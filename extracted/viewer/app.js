import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { advanceCharacterUvRuntime, applyCharacterMaterialRuntimePipeline } from "./material-runtime-shaders.js?v=20260717-vain-skaarf-corrections";
import { localizeAnimationName } from "./locale.js";
import { appendModelQualifier } from "./model-labels.js";
import { buildSearchIndex, normalizeSearchValue, searchIndexMatches } from "./search-utils.js";
import { entryUsesParticleEffect, particleRoleForPfx, RuntimeParticleEffect } from "./effect-particles.js";
import { HERO_RANGE } from "./effect-hero-range.js";
import { createCombobox, createSelectMenu } from "./ui-components.js";
import {
  MODEL_FORM_MODE,
  modelFormProfileForSkinId,
  splitModelFormIndexArrays,
} from "./model-form-profiles.js?v=20260717-tank-only";
import {
  isVertexControlledOnlyByHiddenBones,
  resolveFormBoneIndices,
  resolveFormBoneVisibility,
  resolveFormMeshVisibility,
} from "./runtime-form-visibility.js";

const viewport = document.querySelector("#viewport");
const emptyState = document.querySelector("#emptyState");
const modelList = document.querySelector("#modelList");
const searchInput = document.querySelector("#searchInput");
const heroSearchOptions = document.querySelector("#heroSearchOptions");
const heroDropdownButton = document.querySelector("#heroDropdownButton");
const clearSearchButton = document.querySelector("#clearSearchButton");
const characterSelect = document.querySelector("#characterSelect");
const formatSelect = document.querySelector("#formatSelect");
const staticFormatLabel = document.querySelector("#staticFormatLabel");
const previewModeButtons = [...document.querySelectorAll("[data-preview-mode]")];
const lightingSelect = document.querySelector("#lightingSelect");
const backgroundPanelToggle = document.querySelector("#backgroundPanelToggle");
const backgroundPanel = document.querySelector("#backgroundPanel");
const backgroundColorButtons = [...document.querySelectorAll("[data-background-color]")];
const animationControls = document.querySelector("#animationControls");
const animatedDisplayControls = document.querySelector("#animatedDisplayControls");
const animationPlaybackPanel = document.querySelector("#animationPlaybackPanel");
const animationActionControl = document.querySelector("#animationActionControl");
const animationTimeline = document.querySelector("#animationTimeline");
const animationSelect = document.querySelector("#animationSelect");
const modelFormControls = document.querySelector("#modelFormControls");
const modelFormSelect = document.querySelector("#modelFormSelect");
const attachmentSelect = document.querySelector("#attachmentSelect");
const modelCount = document.querySelector("#modelCount");
const modelPath = document.querySelector("#modelPath");
const modelStats = document.querySelector("#modelStats");
const modelHealthText = document.querySelector("#modelHealthText");
const effectDiagnosticBadge = document.querySelector("#effectDiagnosticBadge");
const effectDiagnosticSummary = document.querySelector("#effectDiagnosticSummary");
const effectDiagnosticSwatches = document.querySelector("#effectDiagnosticSwatches");
const effectDiagnosticList = document.querySelector("#effectDiagnosticList");
const wireToggle = document.querySelector("#wireToggle");
const bloomToggle = document.querySelector("#bloomToggle");
const bonesToggle = document.querySelector("#bonesToggle");
const poseLoopToggle = document.querySelector("#poseLoopToggle");
const effectsToggle = document.querySelector("#effectsToggle");
const frameButton = document.querySelector("#frameButton");
const animationTimeRange = document.querySelector("#animationTimeRange");
const animationTimeText = document.querySelector("#animationTimeText");
const animationFrameText = document.querySelector("#animationFrameText");
const playPauseButton = document.querySelector("#playPauseButton");
const playbackSpeedSelect = document.querySelector("#playbackSpeedSelect");
const openExportDialogButton = document.querySelector("#openExportDialogButton");
const openRecordDialogButton = document.querySelector("#openRecordDialogButton");
const exportDialog = document.querySelector("#exportDialog");
const recordDialog = document.querySelector("#recordDialog");
const diagnoseMaterialsButton = document.querySelector("#diagnoseMaterialsButton");
const exportPoseGlbButton = document.querySelector("#exportPoseGlbButton");
const exportPoseObjButton = document.querySelector("#exportPoseObjButton");
const exportPoseStlButton = document.querySelector("#exportPoseStlButton");
const exportPoseThreeMfButton = document.querySelector("#exportPoseThreeMfButton");
const recordCameraSelect = document.querySelector("#recordCameraSelect");
const recordFormatSelect = document.querySelector("#recordFormatSelect");
const recordQualitySelect = document.querySelector("#recordQualitySelect");
const recordVideoButton = document.querySelector("#recordVideoButton");
const recordProgress = document.querySelector("#recordProgress");
const recordProgressBar = document.querySelector("#recordProgressBar");
const recordProgressText = document.querySelector("#recordProgressText");
const recordProgressPercent = document.querySelector("#recordProgressPercent");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x0b0c0a, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000);
camera.position.set(0, 80, 180);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 30, 0);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
const roomEnvironment = pmremGenerator.fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.environment = roomEnvironment;

const hemisphereLight = new THREE.HemisphereLight(0xfff4d5, 0x1e2b28, 1.05);
scene.add(hemisphereLight);
const keyLight = new THREE.DirectionalLight(0xffe6b5, 1.35);
keyLight.position.set(120, 190, 120);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x8ac8b0, 0.35);
fillLight.position.set(-130, 70, -90);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0x9fb7ff, 0.45);
rimLight.position.set(-90, 140, 160);
scene.add(rimLight);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.04, 0.22, 1.08);
composer.addPass(bloomPass);

// 光照预设都用方向光（有明暗塑形）。曾经的 "native" 用纯均匀 AmbientLight + 挂相机点光，
// 会让浅色面/凸起平板发亮、形成固定光斑（用户反复报的"奇怪的光"），已整体移除。
const LIGHTING_PRESETS = {
  neutral: {
    toneMappingExposure: 0.82,
    environment: true,
    hemisphere: 1.05,
    key: 1.35,
    fill: 0.35,
    rim: 0.45,
    bloom: { strength: 0.04, radius: 0.22, threshold: 1.08 },
  },
  game: {
    toneMappingExposure: 0.98,
    environment: true,
    hemisphere: 1.45,
    key: 2.15,
    fill: 0.7,
    rim: 1.0,
    bloom: { strength: 0.1, radius: 0.25, threshold: 0.98 },
  },
  flat: {
    toneMappingExposure: 0.9,
    environment: false,
    hemisphere: 1.25,
    key: 0.35,
    fill: 0.15,
    rim: 0,
    bloom: { strength: 0, radius: 0.1, threshold: 1.2 },
  },
};

const BACKGROUND_COLOR_PRESETS = {
  black: {
    color: "#0b0c0a",
  },
  charcoal: {
    color: "#242721",
  },
  light: {
    color: "#c7c8bf",
  },
};

const gltfLoader = new GLTFLoader();
const gltfExporter = new GLTFExporter();
const objLoader = new OBJLoader();
const objExporter = new OBJExporter();
const stlExporter = new STLExporter();
const runtimeEffectTextureLoader = new THREE.TextureLoader();
const characterMaterialTextureLoader = new THREE.TextureLoader();
const bowAlphaTextureLoader = new THREE.TextureLoader();
const characterMaterialTextureCache = new Map();
const runtimeEffectPlaneGeometry = new THREE.PlaneGeometry(1, 1);
const manifests = {
  pbr: [],
  skinned: [],
  all: [],
  textured: [],
  glb: [],
  obj: [],
};
const MIN_SKINNED_POSE_COVERAGE = 0.75;
const MIN_NATIVE_TRANSLATION_COVERAGE = 0.5;
const RUNTIME_NATIVE_TRANSLATION_MATCH_TOLERANCE = 20;
const AUTO_NATIVE_TRANSLATION_MAX_RATIO = 1.35;
const AUTO_NATIVE_TRANSLATION_RIGID_MAX_RATIO = 1.65;
const AUTO_NATIVE_TRANSLATION_EDGE_MAX_RATIO = 1.4;
const AUTO_NATIVE_TRANSLATION_EDGE_WORSE_RATIO = 1.03;
const AUTO_NATIVE_TRANSLATION_EDGE_MIN_RAW = 10;
const AUTO_NATIVE_TRANSLATION_SAFE_EQUALS_NONE_RATIO = 1.03;
const AUTO_NATIVE_TRANSLATION_SAFE_OVER_NONE_RATIO = 1.45;
const AUTO_NATIVE_TRANSLATION_SAFE_PREFERRED_RATIO = 1.03;
const AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT = 6;
const ROOT_DIRECT_WEAPON_TRANSLATION_OFFSET = 120;
const ROOT_DIRECT_ATTACHMENT_DOMINANT_VERTICES = 800;
const ENABLE_RUNTIME_NATIVE_TRANSLATION_TAKEOVER = false;
const NATIVE_SCALE_MASK = (1 << 7) | (1 << 8) | (1 << 9);
const SKYE_BIKE_TRANSITION_ANIMATION_PATHS = new Set([
  "Characters/Skye/Art/skye.bike_spawn.anim",
  "Characters/Skye/Art/skye.bike_withdraw.anim",
]);
const SKYE_BIKE_MOTORCYCLE_ROOT_BONE_NAME = "7C1BC5C2";
const SKYE_BIKE_MOTO_INHERITED_SCALE_BY_BONE_NAME = new Map([
  ["D5B032E7", [0.1, 0.1, 0.1]],
  ["2A2E6C4F", [0.1, 0.001, 0.1]],
  ["6268847C", [4.9531, 0.1382, 0.1459]],
  ["90246792", [0.1, 0.001, 0.1]],
  ["5541D42F", [4.9531, 0.1382, 0.1459]],
  ["5D77F2C1", [0.1, 0.0111, 0.1]],
  ["FF471786", [3.7773, 0.1411, 1.2148]],
  ["545B4FAE", [0.1, 0.0111, 0.1]],
  ["DE059D5C", [3.7793, 0.1414, 1.2139]],
  ["759551EF", [0.1, 0.1, 0.1]],
  ["31099AA2", [0.1, 0.1, 0.1]],
  ["EA12AB50", [0.01, 0.01, 0.01]],
  ["A37B4A50", [0.01, 0.01, 0.01]],
  ["9237C7CD", [0.001, 0.001, 0.001]],
  ["00BB42EB", [0.1, 0.1, 0.1]],
  ["555D80C2", [0.1, 0.1, 0.1]],
  ["F7FAF4A2", [0.1, 0.1, 0.1]],
  ["587247DC", [0.1, 0.1, 0.1]],
  ["D2F10A78", [0.1, 0.1, 0.1]],
  ["708818DA", [0.1, 0.1, 0.1]],
  ["48492C64", [0.01, 0.01, 0.01]],
  ["04004BD3", [0.01, 0.01, 0.01]],
]);
const HERO011_STEALTH_BOX_BONE_NAMES = new Set([
  "D6C3C9DB",
  "EB846DB6",
  "D1B3517B",
  "51D99E4E",
  "E3C26473",
  "839D54B3",
]);
const SAW_KNIFE_BONE_NAME = "B48D9C6A";
const SAW_KNIFE_HIDDEN_SCALE = 0.01;
const PREVIEW_EFFECT_SCALE_VISIBLE_THRESHOLD = 0.5;
const MIN_PROJECTED_VIEWPORT_COVERAGE = 0.012;
const MIN_CENTERED_PROJECTED_VIEWPORT_COVERAGE = 0.004;
const MIN_REFIT_PROJECTED_VIEWPORT_COVERAGE = 0.028;
const MAX_REFIT_PROJECTED_VIEWPORT_COVERAGE = 0.82;
const AUTO_FRAME_RETRY_COUNT = 4;
const CAMERA_CLIP_MIN_NEAR = 0.01;
const CAMERA_CLIP_MIN_DEPTH_SPAN = 10;
const CAMERA_CLIP_RADIUS_PADDING = 4;
const WATER_SHADER_CRYSTAL_OPACITY = 1;
const WATER_SHADER_OPAQUE_ALPHA_FLOOR = 0.68;
const GUOB_EFFECT_OPACITY = 0.38;
const EMBEDDED_GLOW_PREVIEW_OPACITY = 0;
const BOW_STRING_PREVIEW_OPACITY = 0;
const BOW_STRING_PREVIEW_LINE_OPACITY = 0.72;
const BOW_STRING_SKINNED_PREVIEW_OPACITY = 0.9;
const BOW_STRING_SKINNED_WIDTH_SCALE = 0.04;
const BOW_STRING_COMPONENT_CLUSTER_DISTANCE = 8;
const BOW_ALPHA_RUNTIME_MASKS = new Map([
  [
    "Characters/Hero023/Art/hero023_drow.drow_bowAlpha_mat.shadergraph",
    "../hero_assets_material_textures_preview/Characters/Hero023/Art/hero023_drow.drow_bowAlpha_mat.sampler-sampler84.png",
  ],
]);
const bowAlphaRuntimeMaskTextureCache = new Map();
const RUNTIME_EFFECT_PREVIEW_LIMIT = 12;
const RUNTIME_EFFECT_PREVIEW_MAX_LAYERS = 3;
const RUNTIME_EFFECT_PREVIEW_DEFAULT_COLOR = "#FF8A24";
const RUNTIME_EFFECT_PROJECTILE_PATTERN =
  /proj|projectile|missile|bullet|shot|bolt|rocket|cannon|shell|grenade|arrow|dart|mortar|orb|fireball|flare|ray|beam|laser/i;
const RUNTIME_EFFECT_RENDERABLE_TEXTURE_ROLES = new Set([
  "alphaMask",
  "baseColor",
  "emissive",
  "rimLighting",
  "uniformColor",
  "uvAnimation",
  "vertexColor",
]);
const RUNTIME_NATIVE_PROJECTILE_SEMANTIC_SLOT_SCORE = 50;
const RUNTIME_EFFECT_BOUND_PROJECTILE_STATUSES = new Set([
  "definition-bone",
  "native-emitter-slot",
  "native-nearby-bone",
  "native-runtime-locator-transform",
  "native-emitter-semantic-slot",
  "native-effect-hook",
]);
const ENABLE_INDEXED_PFX_EFFECT_PREVIEW = false;
const RECORDING_QUALITY_PRESETS = {
  compact: { frameRate: 30, videoBitsPerSecond: 8000000 },
  high: { frameRate: 60, videoBitsPerSecond: 16000000 },
  max: { frameRate: 60, videoBitsPerSecond: 24000000 },
};
let activeObject = null;
let activeButton = null;
let activeIdentity = "";
let activeManifestItem = null;
let activeSourceSize = null;
let activeBackgroundColor = "black";
let lastFrameFitDistance = null;
let activeCameraClipSphere = null;
let pendingAnimationPoseFrameObject = null;
let pendingAnimationPoseFrameResetCamera = false;
let activeLoadToken = 0;
let activeSkeleton = null;
let skeletonManifest = new Set();
let animationBindings = new Map();
let animationStructures = new Map();
let animationBoneMappings = new Map();
let runtimeSkinGraph = new Map();
let runtimeBindingConfig = new Map();
let runtimeAttachmentBones = new Map();
let runtimeAttachmentVisibilityByModel = new Map();
let runtimeEffectHookSummary = null;
let runtimeEffectNativeOptionProfileSummary = null;
let runtimeEffectGapSummary = null;
let runtimeEffectDefinitionNeighborhoodSummary = null;
let nativeEffectRuntimeSchemaSummary = null;
let nativeEffectRuntimeLinksSummary = null;
let nativeParticleRuntimeSchemaSummary = null;
let nativeParticleCallbackTableScanSummary = null;
let nativeParticleCallbackSemanticsSummary = null;
let pfxEncryptedRuntimeTargetSummary = null;
let pfxNativeCallbackRuntimeTargetSummary = null;
let pfxNativeCallbackCaptureSummary = null;
let effectNativeChannelCaptureTargetSummary = null;
let effectNativeChannelCaptureSummary = null;
let effectChannelStaticResourceAuditSummary = null;
let nativeEffectTokenOnlyCallsiteAuditSummary = null;
let nativeEffectHashMissingOwnerAuditSummary = null;
let kindredHashPfxRuntimeGateAuditSummary = null;
let kindredEffectComponentRuntimeChainAuditSummary = null;
let kindredCurrentParticleBridgeAuditSummary = null;
let cff0EffectInstanceGraphSummary = null;
let cff0EffectInstanceGapSummary = null;
let cff0EffectInstanceGraphByModelLabel = new Map();
let runtimeEffectDefinitionNeighborhoodByModelLabel = new Map();
let runtimeEffectHooksByDefinition = new Map();
let runtimeEffectHooksByHero = new Map();
let runtimeEffectPfxByPath = new Map();
let runtimeEffectPfxByHero = new Map();
let runtimeEffectDefinitionProjectilesByModelLabel = new Map();
let runtimeEffectProjectileRuntimeByModelLabel = new Map();
let runtimeEffectProjectileRuntimeLoaded = false;
let runtimeEffectProjectileRuntimeSummary = null;
let runtimeEffectProjectileGapSummary = null;
let runtimeEffectProjectileCreateBridgeSummary = null;
let runtimeEffectProjectileTargetDispatchSummary = null;
let runtimeEffectProjectileVtableSlotSummary = null;
let runtimeEffectProjectileVtableFunctionSummary = null;
let runtimeEffectProjectileVtableOutputLayoutSummary = null;
let runtimeEffectProjectileVtableCallsitePayloadSummary = null;
let runtimeEffectProjectileVtableSemanticJoinSummary = null;
let runtimeEffectProjectileConsumerTraceSummary = null;
let runtimeEffectProjectileCurrentTokenWindowSummary = null;
let runtimeEffectProjectileCurrentBranchTargetSummary = null;
let runtimeEffectProjectileCurrentFieldWriterCallsiteSummary = null;
let runtimeEffectProjectileCurrentFieldReaderCandidateSummary = null;
let runtimeEffectProjectileCurrentFieldReaderCallsiteContextSummary = null;
let runtimeEffectProjectileCurrentFieldReaderDownstreamRouteSummary = null;
let runtimeEffectProjectileCurrentFieldReaderListDispatchSummary = null;
let runtimeEffectProjectileCurrentTokenChildObjectChainSummary = null;
let runtimeEffectProjectileCurrentTokenChildCallbackBodySummary = null;
let runtimeEffectProjectileCurrentTokenChildClassMethodSummary = null;
let runtimeEffectProjectileCurrentTokenChildEvaluatorPayloadSummary = null;
let runtimeEffectProjectileCurrentTokenChildPayloadSetterSummary = null;
let runtimeEffectProjectileCurrentTokenChildPayloadSetterDownstreamSummary = null;
let runtimeEffectProjectileCurrentTokenChildManagerRecordBridgeSummary = null;
let runtimeEffectProjectileCurrentTokenChildEffectOwnerCandidateSummary = null;
let runtimeEffectProjectileCurrentTokenChildStaticPfxOwnerSummary = null;
let runtimeEffectShadergraphByPath = new Map();
let runtimeNativeProjectilesByHero = new Map();
let runtimeNativeProjectileCallbacksByHero = new Map();
let runtimeTimelineByHero = new Map();
let runtimeResourceCompletenessSummary = null;
let runtimeResourceCompletenessByLookup = new Map();
let glbMaterialCoverageSummary = null;
let glbMaterialCoverageByLookup = new Map();
let materialRuntimePipelineSummary = null;
let materialRuntimePipelineByLookup = new Map();
let materialRenderStateAuditSummary = null;
let runtimeStateConditionSummary = null;
let runtimeStateConditionsByKey = new Map();
let runtimeAttachmentNativeChainSummary = null;
let runtimeAttachmentNativeChainsByKey = new Map();
let nativeEffectBuilderMethodSemanticsSummary = null;
let nativeTransientEffectPrimitiveChainSummary = null;
let nativeTransientRenderRecordSchemaSummary = null;
let nativeTransientRenderRecordCallsiteScanSummary = null;
let nativeTransientRecordRuntimeExecutorSummary = null;
let currentNativeParticleDrawChainSummary = null;
let currentNativeParticleRegistrationChainSummary = null;
let currentNativeLayoutAOwnerGlobalUsageSummary = null;
let currentNativeLayoutARefreshStateSourceSummary = null;
let currentNativeLayoutAStateWriterSummary = null;
let currentNativeLayoutAStateRegistrationSummary = null;
let currentNativeLayoutAAddRecordFlagSourceSummary = null;
let currentNativeParticleMaskCandidateOwnerSummary = null;
let currentNativeType210PrimitiveBuilderSummary = null;
let currentNativeType210LevelVisualsBridgeSummary = null;
let currentNativeLayoutBTypeOwnerSummary = null;
let currentNativeLayoutBEntryOwnerSummary = null;
let currentNativeObjectAcWidthOverlapSummary = null;
let currentNativeObjectAcOwnerTraceSummary = null;
let currentNativeLayoutBCallbackBoundarySummary = null;
let currentNativeLayoutBIndirectSlotSummary = null;
let currentNativeLayoutBSlotRecordBridgeSummary = null;
let currentNativeLayoutBActiveRecordLifecycleSummary = null;
let currentNativeLayoutBTargetPayloadSummary = null;
let currentNativeLayoutBPfxTargetFactorySummary = null;
let currentNativeLayoutBTargetCacheSummary = null;
let currentNativeLayoutBTargetPayloadNodeChainSummary = null;
let currentNativeLayoutBPayloadSourceProgramBridgeSummary = null;
let currentNativeLayoutBManagerDrawBridgeSummary = null;
let currentNativeLayoutBParticleEntryDispatchSummary = null;
let currentNativeLayoutBEntryProviderPayloadBridgeSummary = null;
let currentNativeLayoutBOwnerBVtableDispatchSummary = null;
let currentNativeLayoutBPrimitiveModeDispatchSummary = null;
let currentNativeLayoutBMaterialDrawBridgeSummary = null;
let currentNativeLayoutBFinalPrimitiveConsumerSummary = null;
let currentNativeLayoutBShaderParameterBridgeSummary = null;
let currentNativeShaderDataType4ValueSourceSummary = null;
let currentNativeShaderDataType4EntrySemanticsSummary = null;
let currentNativeTexDataTextureObjectSummary = null;
let currentNativeShaderDataTextureSamplerTableSummary = null;
let currentNativeShaderDataExternalTextureBindingSummary = null;
let currentNativeTextureSamplerStateSemanticsSummary = null;
let currentNativeShaderDataInlineTexturePlaceholderSummary = null;
let currentNativeShadergraphSamplerTexDataJoinSummary = null;
let currentNativeMaterialSourceProgramCaptureTargetSummary = null;
let currentNativeMaterialSourceProgramCaptureSummary = null;
let currentNativeDefinitionShaderParamStaticStringSummary = null;
let currentNativeDefinitionShaderParamsPayloadStructureSummary = null;
let currentNativeMaterialSamplerOwnershipGateSummary = null;
let currentNativeRuntimeCaptureGateSummary = null;
let currentNativeRuntimeCaptureGateItems = [];
let currentNativeDynamicSourceTableSemanticsSummary = null;
let currentNativeStaticMeshSelectorEntrySummary = null;
let currentNativeShaderParamsSchemaSummary = null;
let currentNativeStaticMeshShaderParamsCaptureTargetSummary = null;
let currentNativeStaticMeshShaderParamsCaptureSummary = null;
let currentNativeShaderParamsValueSemanticsSummary = null;
let currentNativeLayoutBObjectAcStoreCoverageSummary = null;
let currentNativeLayoutBObjectAcRuntimeCaptureTargetSummary = null;
let currentNativeLayoutBObjectAcRuntimeCaptureSummary = null;
let currentNativeLayoutBObjectAcCandidateDisqualificationSummary = null;
let currentNativeLayoutBPayloadRecordLayoutSummary = null;
let currentNativeLayoutBFlagProducerSummary = null;
let currentNativeLayoutBVisibilityGateSummary = null;
let currentNativeLayoutBTargetStatusSummary = null;
let currentNativeLayoutBRefreshModeSplitSummary = null;
let currentNativeLayoutBQueryApplyPathSummary = null;
let currentNativeLayoutBSharedStructApplySummary = null;
let currentNativeLayoutBCallerStructInitializerSummary = null;
let currentNativeLayoutBComponentTableEntrySummary = null;
let currentNativeLayoutBComponentTableOwnerSummary = null;
let currentNativeLayoutBComponentSlotRegistrationSummary = null;
let currentNativeLayoutBDirectCallerStructBuilderSummary = null;
let currentNativeLayoutBResourceCallerDynamicFieldsSummary = null;
let currentNativeLayoutBCommonApplySetterFieldsSummary = null;
let currentNativeLayoutBObjectAcProducerGateSummary = null;
let currentNativePositionSamplerOwnerSummary = null;
let currentNativeLevelRuntimeOwnerSummary = null;
let currentNativeRuntimeKeySelectorCaptureTargetSummary = null;
let runtimeKeySelectorCaptureSummary = null;
let currentNativeLightProbeChainSummary = null;
let characterLitProbeBlockerSummary = null;
let heroPreviewProfileCandidateSummary = null;
let nativeBinaryVersionAuditSummary = null;
let runtimeSkinVariantAliasSummary = null;
let runtimeSkinVariantAliasesBySkinId = new Map();
let runtimeSkinEffectAliasSummary = null;
let runtimeSkinEffectAliasesByModelLabel = new Map();
let heroCatalog = new Map();
let skinCatalog = new Map();
let searchOptionToHero = new Map();
let heroSearchItems = [];
let itemSearchIndexes = new WeakMap();
const nativeScaleBoneIndicesByObject = new WeakMap();
const skyeBikeTransitionScaleProfileByObject = new WeakMap();
const runtimeFormBoneIndicesByObject = new WeakMap();
let heroCombobox = null;
let selectMenus = [];
let activeAnimations = [];
let activeAnimationSkeletonPath = "";
let activeBaseStatsText = "";
let activeSkeletonStatsText = "";
let activeAnimationStatsText = "";
let activeAnimationClipKey = "";
let activeAnimationClip = null;
let activeAnimationClipLoading = false;
let activeAnimationClipError = "";
let activeEffectScalePoseKey = "";
let activeEffectScalePose = null;
let activeAttachments = [];
let activeAttachmentObjects = [];
let activeRuntimeEffectObjects = [];
let runtimeParticleFxRoot = null;
let runtimeEffectPreviewTexture = null;
let runtimeEffectNativePrimitiveRingTextureCache = null;
const runtimeEffectPreviewTextures = new Map();
const runtimeEffectDistortionTextures = new Map();
let nativeTranslationMode = "auto";
const autoNativeTranslationModes = new Map();
const dynamicNativeTranslationModes = new Map();
const poseClock = new THREE.Clock();
const runtimeEffectClock = new THREE.Clock();
let activePoseBlend = 0;
let manualAnimationTime = 0;
let runtimeEffectElapsed = 0;
let videoRecording = false;

function applyLightingPreset() {
  const preset = LIGHTING_PRESETS[lightingSelect.value] || LIGHTING_PRESETS.neutral;
  const nextToneMapping = preset.toneMapping === "none" ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  if (renderer.toneMapping !== nextToneMapping) {
    renderer.toneMapping = nextToneMapping;
    // toneMapping 是 shader program 级 define，运行中切换需重编译已有材质
    scene.traverse((child) => {
      const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
      for (const material of materials) material.needsUpdate = true;
    });
  }
  renderer.toneMappingExposure = preset.toneMappingExposure;
  scene.environment = preset.environment ? roomEnvironment : null;
  hemisphereLight.intensity = preset.hemisphere;
  keyLight.intensity = preset.key;
  fillLight.intensity = preset.fill;
  rimLight.intensity = preset.rim;
  bloomPass.strength = preset.bloom.strength;
  bloomPass.radius = preset.bloom.radius;
  bloomPass.threshold = preset.bloom.threshold;
}

function setBackgroundPanelOpen(open) {
  backgroundPanel.hidden = !open;
  backgroundPanelToggle.setAttribute("aria-expanded", String(open));
}

function syncBackgroundControlButtons() {
  for (const button of backgroundColorButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.backgroundColor === activeBackgroundColor));
  }
}

function applyPreviewBackground() {
  const colorPreset = BACKGROUND_COLOR_PRESETS[activeBackgroundColor] || BACKGROUND_COLOR_PRESETS.black;
  scene.background = new THREE.Color(colorPreset.color);
  renderer.setClearColor(colorPreset.color, 1);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function currentFormat() {
  if (formatSelect.value === "skinned") return "skinned";
  if (formatSelect.value === "pbr") return "pbr";
  if (formatSelect.value === "all") return "all";
  if (formatSelect.value === "obj") return "obj";
  if (formatSelect.value === "glb") return "glb";
  return "textured";
}

function isAnimationFormat() {
  return currentFormat() === "skinned";
}

function hasRuntimeEffectPreviews(item = activeManifestItem) {
  return isAnimationFormat() && runtimeEffectPreviewEntries(item).length > 0;
}

function syncEffectsToggleAvailability(enabled) {
  // 特效部件默认关闭：只控制开关可用性，不自动勾选。
  // 运行时特效面片（法术光片、冷雾、飘带、武器挥砍拖尾等）默认隐藏，用户想看时手动打开。
  effectsToggle.disabled = !enabled;
  if (!enabled) effectsToggle.checked = false;
}

function currentManifest() {
  return manifests[currentFormat()] || [];
}

function resetViewerControlsForModel() {
  wireToggle.checked = false;
  bloomToggle.checked = false;
  bonesToggle.checked = false;
  effectsToggle.checked = false;
  poseLoopToggle.checked = isAnimationFormat();
  activePoseBlend = 0;
  manualAnimationTime = 0;
  nativeTranslationMode = "auto";
  activeAnimations = [];
  activeAnimationSkeletonPath = "";
  activeAnimationStatsText = "";
  clearActiveAnimationClip();
  activeAttachments = [];
  activeAttachmentObjects = [];
  modelFormControls.hidden = true;
  modelFormSelect.disabled = true;
  modelFormSelect.replaceChildren(new Option("该模型没有可用形态", ""));
  attachmentSelect.replaceChildren(new Option("不加载附属资源", ""));
  animationSelect.replaceChildren(new Option("没有可用动作", ""));
  syncFormatControls();
  syncTimelineControls();
}

function syncFormatControls() {
  const animated = isAnimationFormat();
  staticFormatLabel.hidden = animated;
  animationControls.hidden = !animated;
  animatedDisplayControls.hidden = !animated;
  animationPlaybackPanel.hidden = false;
  animationPlaybackPanel.classList.toggle("is-static", !animated);
  animationActionControl.hidden = !animated;
  animationTimeline.hidden = !animated;
  for (const button of previewModeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.previewMode === (animated ? "skinned" : "static")));
  }
  if (!animated) {
    poseLoopToggle.checked = false;
    bonesToggle.checked = false;
    effectsToggle.checked = false;
  }
  animationSelect.disabled = !animated || !activeAnimations.length;
  attachmentSelect.disabled = !animated || !activeAttachments.length;
  poseLoopToggle.disabled = !animated;
  bonesToggle.disabled = !animated;
  syncEffectsToggleAvailability(animated && hasRuntimeEffectPreviews());
  syncPreviewEffectVisibility();
  refreshSelectMenus();
}

function assetRoot(item = activeManifestItem) {
  if (currentFormat() === "skinned") return "../hero_assets_glb_skinned_pbr/";
  if (currentFormat() === "pbr") return "../hero_assets_glb_textured_pbr/";
  if (currentFormat() === "all") {
    return item?.category === "Characters" ? "../hero_assets_glb_textured_pbr/" : "../all_assets_glb_textured_pbr/";
  }
  if (currentFormat() === "textured") return "../hero_assets_glb_textured_mtl/";
  if (currentFormat() === "glb") return "../hero_assets_glb/";
  return "../hero_assets_obj/";
}

function attachmentAssetRoot(attachment) {
  if (attachment?.assetRoot === "skinned") return "../hero_assets_glb_skinned_pbr/";
  if (attachment?.assetRoot === "all") return "../all_assets_glb_textured_pbr/";
  return "../hero_assets_glb_textured_pbr/";
}

function attachmentAssetRoots(attachment) {
  const primary = attachmentAssetRoot(attachment);
  const fallback = "../hero_assets_glb_textured_pbr/";
  return primary === fallback ? [primary] : [primary, fallback];
}

function buildResourcePath(relativePath) {
  return `../build_resources_by_path/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

function itemIdentity(item) {
  return item.aliasSkinId ? `${item.rel}#${item.aliasSkinId}` : item.rel.replace(/\.(obj|glb)$/i, "");
}

function dedupeManifestItems(items) {
  const uniqueItems = new Map();
  for (const item of items || []) {
    const identity = itemIdentity(item);
    if (!uniqueItems.has(identity)) uniqueItems.set(identity, item);
  }
  return [...uniqueItems.values()];
}

function modelSkinId(item) {
  return item?.aliasSkinId || item?.modelLabel || item?.variant || "";
}

function buildRuntimeSkinEffectAliasLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    if (!item?.modelLabel || !item?.sourceEffectToken || !item?.skinEffectToken) continue;
    const records = lookup.get(item.modelLabel) || [];
    records.push(item);
    lookup.set(item.modelLabel, records);
  }
  for (const records of lookup.values()) {
    records.sort(
      (left, right) =>
        String(left.sourceEffectToken || "").localeCompare(String(right.sourceEffectToken || "")) ||
        String(left.skinEffectToken || "").localeCompare(String(right.skinEffectToken || "")),
    );
  }
  return lookup;
}

function runtimeEffectSkinAliasRowsForItem(item = activeManifestItem) {
  const skinId = modelSkinId(item);
  return skinId ? runtimeSkinEffectAliasesByModelLabel.get(skinId) || [] : [];
}

function runtimeEffectSkinAliasRowsForEffectToken(effectToken, item = activeManifestItem) {
  const token = String(effectToken || "");
  if (!token) return [];
  return runtimeEffectSkinAliasRowsForItem(item).filter((row) => row.sourceEffectToken === token);
}

function runtimeEffectTokenParts(value) {
  return String(value || "")
    .split("_")
    .map((part) => part.trim())
    .filter(Boolean);
}

function runtimeEffectSkinAliasInsertedParts(alias) {
  const sourceParts = runtimeEffectTokenParts(alias?.sourceEffectToken);
  const skinParts = runtimeEffectTokenParts(alias?.skinEffectToken);
  if (!sourceParts.length || !skinParts.length || skinParts.length <= sourceParts.length) return [];

  let prefixLength = 0;
  while (
    prefixLength < sourceParts.length &&
    prefixLength < skinParts.length &&
    sourceParts[prefixLength].toLowerCase() === skinParts[prefixLength].toLowerCase()
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < sourceParts.length - prefixLength &&
    suffixLength < skinParts.length - prefixLength &&
    sourceParts[sourceParts.length - 1 - suffixLength].toLowerCase() ===
      skinParts[skinParts.length - 1 - suffixLength].toLowerCase()
  ) {
    suffixLength += 1;
  }

  return skinParts
    .slice(prefixLength, skinParts.length - suffixLength)
    .map((part) => part.toLowerCase())
    .filter((part) => part.length >= 2);
}

function runtimeEffectPathParts(relativePath) {
  return new Set(
    String(relativePath || "")
      .split(/[^A-Za-z0-9]+|_/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

function runtimeEffectPfxPathMatchesSkinEffectAlias(relativePath, alias) {
  const insertedParts = runtimeEffectSkinAliasInsertedParts(alias);
  if (!insertedParts.length) return false;
  const pathParts = runtimeEffectPathParts(relativePath);
  return insertedParts.every((part) => pathParts.has(part));
}

function runtimeEffectCanonicalSkinAliasPart(part) {
  const value = String(part || "").toLowerCase();
  if (value === "basicattack") return "aa";
  if (value === "impact") return "hit";
  if (value === "projectile") return "proj";
  return value;
}

function runtimeEffectSkinAliasSemanticParts(alias) {
  const insertedParts = new Set(runtimeEffectSkinAliasInsertedParts(alias));
  const sourceParts = runtimeEffectTokenParts(alias?.sourceEffectToken).map((part) => part.toLowerCase());
  const skinParts = runtimeEffectTokenParts(alias?.skinEffectToken).map((part) => part.toLowerCase());
  const ignored = new Set(["effect", sourceParts[1], skinParts[1], ...insertedParts].filter(Boolean));
  const parts = [];
  const seen = new Set();
  for (const part of skinParts) {
    const canonical = runtimeEffectCanonicalSkinAliasPart(part);
    if (!canonical || ignored.has(part) || ignored.has(canonical) || seen.has(canonical)) continue;
    parts.push(canonical);
    seen.add(canonical);
  }
  return parts;
}

function runtimeEffectNormalizedPathText(relativePath) {
  return String(relativePath || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function runtimeEffectPfxPathHasAliasPart(relativePath, part) {
  const token = String(part || "").toLowerCase();
  if (!token) return false;
  const pathParts = runtimeEffectPathParts(relativePath);
  if (pathParts.has(token)) return true;
  if (token.length <= 1) return false;
  return runtimeEffectNormalizedPathText(relativePath).includes(token);
}

function runtimeEffectPfxPathMatchesSkinAliasResource(relativePath, alias) {
  const insertedParts = runtimeEffectSkinAliasInsertedParts(alias);
  const semanticParts = runtimeEffectSkinAliasSemanticParts(alias);
  if (!insertedParts.length || !semanticParts.length) return false;
  return (
    insertedParts.every((part) => runtimeEffectPfxPathHasAliasPart(relativePath, part)) &&
    semanticParts.every((part) => runtimeEffectPfxPathHasAliasPart(relativePath, part))
  );
}

function runtimeEffectPfxResourceAllowedBySkinEffectEvidence(resourcePath, effectToken, item = activeManifestItem) {
  const aliasRows = runtimeEffectSkinAliasRowsForEffectToken(effectToken, item);
  if (aliasRows.length) {
    return aliasRows.some((alias) => runtimeEffectPfxPathMatchesSkinEffectAlias(resourcePath, alias));
  }
  return !runtimeEffectPathLooksSkinnedVariant(resourcePath);
}

function runtimeEffectHookHasStrongSkinAliasResourceEvidence(hook) {
  return (
    hook?.aliasEvidenceStrength === "strong" &&
    (hook?.resourceEvidenceSource === "cff0-skin-effect-alias" ||
      hook?.resourceEvidenceSource === "native-action-effect-alias-resource")
  );
}

function runtimeEffectSkinAliasIndexedPfxItems(effectToken, item = activeManifestItem, hook = null) {
  const aliasRows = runtimeEffectSkinAliasRowsForEffectToken(effectToken, item);
  if (!aliasRows.length) return [];
  const heroKeys = uniqueSorted([heroKeyForItem(item), ...runtimeEffectHeroKeysForHook(hook)].filter(Boolean));
  const items = [];
  const seen = new Set();
  for (const heroKey of heroKeys) {
    for (const pfxItem of runtimeEffectPfxByHero.get(heroKey) || []) {
      if (!pfxItem?.relativePath || seen.has(pfxItem.relativePath)) continue;
      if (!aliasRows.some((alias) => runtimeEffectPfxPathMatchesSkinAliasResource(pfxItem.relativePath, alias))) continue;
      items.push(pfxItem);
      seen.add(pfxItem.relativePath);
    }
  }
  return items.sort(
    (left, right) =>
      runtimeEffectPfxVariantScore(left, item) - runtimeEffectPfxVariantScore(right, item) ||
      left.relativePath.localeCompare(right.relativePath),
  );
}

function runtimeEffectSkinAliasScopedPfxItems(pfxItems, effectToken, item = activeManifestItem, hook = null) {
  const aliasRows = runtimeEffectSkinAliasRowsForEffectToken(effectToken, item);
  if (!aliasRows.length) return null;
  const scopedCandidates = (pfxItems || []).filter((pfxItem) =>
    aliasRows.some(
      (alias) =>
        runtimeEffectPfxPathMatchesSkinAliasResource(pfxItem?.relativePath, alias) ||
        runtimeEffectPfxPathMatchesSkinEffectAlias(pfxItem?.relativePath, alias),
    ),
  );
  if (scopedCandidates.length || !runtimeEffectHookHasStrongSkinAliasResourceEvidence(hook)) return scopedCandidates;
  return pfxItems || [];
}

function skinCatalogEntry(item) {
  return skinCatalog.get(modelSkinId(item)) || null;
}

function displaySkinName(entry, fallback) {
  const english = entry?.fallbackLabel || fallback || "";
  const chinese = entry?.zhCN || "";
  if (chinese && english && chinese !== english) return `${chinese} / ${english}`;
  return english || entry?.localizationKey || fallback || "";
}

function displayVariant(item) {
  const label = displaySkinName(skinCatalogEntry(item), item.modelLabel || item.variant || item.rel || "");
  return appendModelQualifier(label, item);
}

const neutralCreatureCatalog = new Map([
  ["JungleHeal", { english: "Treant", zhCN: "树精", aliases: ["JungleHeal", "Treant", "树精"] }],
  ["JungleMinion", { english: "Miner", zhCN: "矿工", aliases: ["JungleMinion", "Miner", "矿工"] }],
  ["Kraken", { english: "Kraken", zhCN: "海怪克拉肯", aliases: ["Kraken", "海怪克拉肯"] }],
]);

function heroKeyForItem(item) {
  const artMatch = /^Characters\/([^/]+)\//.exec(item?.rel || "");
  if (neutralCreatureCatalog.has(artMatch?.[1])) return artMatch[1];
  const sourceMatch = /^Characters\/([^/]+)\//.exec(item?.sourceRelativePath || "");
  return sourceMatch?.[1] || item?.character || "";
}

function heroCatalogEntry(heroKey) {
  return neutralCreatureCatalog.get(heroKey) || heroCatalog.get(heroKey) || null;
}

function displayHeroName(heroKey) {
  const entry = heroCatalogEntry(heroKey);
  const english = entry?.english || heroKey || "资源";
  const chinese = entry?.zhCN || "";
  return chinese && chinese !== english ? `${chinese} / ${english}` : english;
}

function displayCharacter(character) {
  return displayHeroName(character);
}

function displayItemCharacter(item) {
  return displayHeroName(heroKeyForItem(item));
}

function heroSearchAliases(heroKey) {
  const entry = heroCatalogEntry(heroKey);
  return [heroKey, entry?.english, entry?.zhCN, entry?.localizationKey, ...(entry?.aliases || [])].filter(Boolean);
}

function skinSearchAliases(item) {
  const entry = skinCatalogEntry(item);
  return [entry?.fallbackLabel, entry?.zhCN, entry?.localizationKey].filter(Boolean);
}

function itemSearchValues(item) {
  const heroKey = heroKeyForItem(item);
  return [
    item.character,
    heroKey,
    displayHeroName(heroKey),
    ...heroSearchAliases(heroKey),
    displayVariant(item),
    ...skinSearchAliases(item),
    item.modelLabel || "",
    item.variant || "",
    item.rel,
    item.sourceRelativePath || "",
    item.meshPath || "",
  ];
}

function itemSearchIndex(item) {
  const cached = itemSearchIndexes.get(item);
  if (cached) return cached;
  const index = buildSearchIndex(itemSearchValues(item));
  itemSearchIndexes.set(item, index);
  return index;
}

function searchMatchesSelectedHero() {
  const query = normalizeSearchValue(searchInput.value);
  return query ? searchOptionToHero.get(query) === characterSelect.value : false;
}

function filteredHeroSearchItems(query) {
  const normalized = normalizeSearchValue(query);
  if (!normalized) return heroSearchItems;
  return heroSearchItems.filter((item) => searchIndexMatches(item.searchIndex, normalized)).slice(0, 80);
}

function heroSearchMeta(item) {
  const aliases = item.aliases.filter((alias) => alias !== item.label && alias !== item.key).slice(0, 2);
  return [item.key, ...aliases].filter(Boolean).join(" / ");
}

function selectHeroSearchItem(item) {
  searchInput.value = item.label;
  characterSelect.value = item.key;
  renderList();
}

function syncSearchSelection() {
  characterSelect.value = searchOptionToHero.get(normalizeSearchValue(searchInput.value)) || "";
  renderList();
  return filteredHeroSearchItems(searchInput.value);
}

function refreshSelectMenus() {
  for (const menu of selectMenus) menu.refresh();
}

function setSelectDisabled(select, disabled) {
  if (!select || select.disabled === disabled) return false;
  select.disabled = disabled;
  return true;
}

function relationshipStats(item) {
  if (!item?.relationshipMatched) return "";
  const parts = [];
  const skinVariantAliasStats = runtimeSkinVariantAliasStats(item);
  if (skinVariantAliasStats) parts.push(skinVariantAliasStats);
  if (item.usesFallbackSkeleton) parts.push("骨架未证实");
  else if (item.skeletons?.length) parts.push("直接骨架");
  if (item.sameLabelAnimationCount) parts.push(`${item.sameLabelAnimationCount} 个动作`);
  const runtimeStats = runtimeBindSlotStats(item);
  if (runtimeStats) parts.push(runtimeStats);
  const visibilityStats = runtimeAttachmentVisibilityStats(item);
  if (visibilityStats) parts.push(visibilityStats);
  const timelineStats = runtimeTimelineStats(item);
  if (timelineStats) parts.push(timelineStats);
  const projectileCallbackStats = runtimeNativeProjectileCallbackStats(item);
  if (projectileCallbackStats) parts.push(projectileCallbackStats);
  const projectileBindingStats = runtimeEffectProjectileBindingStats(item);
  if (projectileBindingStats) parts.push(projectileBindingStats);
  const resourceCompletenessStats = runtimeResourceCompletenessStats(item);
  if (resourceCompletenessStats) parts.push(resourceCompletenessStats);
  const glbMaterialCoverageStats = runtimeGlbMaterialCoverageStats(item);
  if (glbMaterialCoverageStats) parts.push(glbMaterialCoverageStats);
  const materialRuntimePipelineStats = runtimeMaterialRuntimePipelineStats(item);
  if (materialRuntimePipelineStats) parts.push(materialRuntimePipelineStats);
  const stateConditionStats = runtimeStateConditionStats(item);
  if (stateConditionStats) parts.push(stateConditionStats);
  const attachmentNativeChainStats = runtimeAttachmentNativeChainStats(item);
  if (attachmentNativeChainStats) parts.push(attachmentNativeChainStats);
  return parts.length ? ` | ${parts.join(" | ")}` : "";
}

function buildRuntimeSkinVariantAliasLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    if (!item.skinId) continue;
    lookup.set(item.skinId, item);
  }
  return lookup;
}

function cloneSkinVariantAliasItem(baseItem, alias) {
  return {
    ...baseItem,
    modelLabel: alias.skinId,
    variant: alias.skinId,
    aliasSkinId: alias.skinId,
    aliasOfModelLabel: alias.baseModelLabel || baseItem.modelLabel || baseItem.variant || "",
    aliasEvidence: alias.evidence || "",
    sourceRelativePath: alias.sourceRelativePath || baseItem.sourceRelativePath || "",
    materialCount: alias.materialCount === "" || alias.materialCount == null ? baseItem.materialCount : alias.materialCount,
    texturedMaterialCount:
      alias.texturedMaterialCount === "" || alias.texturedMaterialCount == null
        ? baseItem.texturedMaterialCount
        : alias.texturedMaterialCount,
  };
}

function applySkinVariantAliasesToManifest(items, aliases) {
  const sourceItems = items || [];
  const byLabel = new Map();
  const byRel = new Map();
  const existingLabels = new Set();
  const aliasesByBaseItem = new Map();
  for (const item of sourceItems) {
    const label = item.modelLabel || item.variant || "";
    if (label) {
      byLabel.set(label, item);
      existingLabels.add(label);
    }
    if (item.rel && !byRel.has(item.rel)) byRel.set(item.rel, item);
  }
  for (const alias of aliases || []) {
    if (!alias.skinId || existingLabels.has(alias.skinId)) continue;
    const baseItem = byLabel.get(alias.baseModelLabel || "") || byRel.get(alias.rel || "");
    if (!baseItem) continue;
    const baseAliases = aliasesByBaseItem.get(baseItem) || [];
    baseAliases.push(cloneSkinVariantAliasItem(baseItem, alias));
    aliasesByBaseItem.set(baseItem, baseAliases);
    existingLabels.add(alias.skinId);
  }
  return sourceItems.flatMap((item) => [item, ...(aliasesByBaseItem.get(item) || [])]);
}

function runtimeSkinVariantAliasStats(item) {
  if (!item?.aliasSkinId) return "";
  const base = item.aliasOfModelLabel || "基础模型";
  return `共享模型变体：${base}`;
}

function runtimeLookupKeysForItem(item) {
  if (!item?.rel) return [];
  return [
    `${item.rel || ""}\t${item.sourceRelativePath || ""}\t${item.modelLabel || ""}`,
    `${item.rel || ""}\t${item.sourceRelativePath || ""}\t`,
    `${item.rel || ""}\t\t${item.modelLabel || ""}`,
    `${item.rel || ""}\t\t`,
    item.rel,
  ];
}

function buildRuntimeLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    for (const key of runtimeLookupKeysForItem(item)) {
      if (!lookup.has(key)) lookup.set(key, item);
    }
  }
  return lookup;
}

function buildRuntimeResourceCompletenessLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    for (const key of [item.skinId, item.rel, `${item.rel || ""}\t${item.skinId || ""}`].filter(Boolean)) {
      if (!lookup.has(key)) lookup.set(key, item);
    }
  }
  return lookup;
}

function runtimeResourceCompletenessRowForItem(item) {
  if (!item) return null;
  return (
    runtimeResourceCompletenessByLookup.get(item.modelLabel || "") ||
    runtimeResourceCompletenessByLookup.get(item.variant || "") ||
    runtimeResourceCompletenessByLookup.get(item.rel || "") ||
    runtimeResourceCompletenessByLookup.get(`${item.rel || ""}\t${item.modelLabel || item.variant || ""}`) ||
    null
  );
}

function runtimeResourceCompletenessStats(item) {
  const row = runtimeResourceCompletenessRowForItem(item);
  if (!row || row.issues === "ok") return "";
  const issues = new Set(String(row.issues || "").split("|").filter(Boolean));
  const details = [];
  if (issues.has("missing-skin-preview-glb")) details.push("缺预览 GLB");
  if (issues.has("missing-skinned-runtime-glb")) details.push("缺可动 GLB");
  if (issues.has("missing-runtime-graph")) details.push("缺 runtime 图谱");
  if (issues.has("no-basecolor-texture")) details.push("缺 baseColor 贴图");
  if (issues.has("partial-basecolor-texture")) details.push("部分材质无 baseColor");
  if (issues.has("no-same-label-animation")) details.push("缺同名动作");
  if (issues.has("unresolved-runtime-bind-slot")) details.push(`${row.runtimeBindingGapCount || row.unresolvedBindSlotCount || 0} 个绑定未解`);
  if (issues.has("unclassified-effect-shadergraph")) details.push(`${row.unclassifiedShadergraphCount || 0} 个特效材质待归类`);
  if (issues.has("no-effect-pfx-for-character")) details.push("缺特效 PFX");
  if (issues.has("no-native-runtime-timeline")) details.push("缺 runtime 时间线");
  return details.length ? `资源完整性：${details.join(" / ")}` : "资源完整性：有待检查项";
}

function buildGlbMaterialCoverageLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    for (const key of [item.rel, item.modelLabel, `${item.rel || ""}\t${item.modelLabel || ""}`].filter(Boolean)) {
      const rows = lookup.get(key) || [];
      rows.push(item);
      lookup.set(key, rows);
    }
  }
  for (const rows of lookup.values()) {
    rows.sort((left, right) => Number(left.materialIndex || 0) - Number(right.materialIndex || 0));
  }
  return lookup;
}

function runtimeGlbMaterialCoverageRowsForItem(item) {
  if (!item) return [];
  const rows =
    glbMaterialCoverageByLookup.get(`${item.rel || ""}\t${item.modelLabel || item.variant || ""}`) ||
    glbMaterialCoverageByLookup.get(item.rel || "") ||
    glbMaterialCoverageByLookup.get(item.modelLabel || "") ||
    glbMaterialCoverageByLookup.get(item.variant || "") ||
    [];
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.rel}:${row.materialIndex}:${row.materialName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function runtimeGlbMaterialCoverageStats(item) {
  const rows = runtimeGlbMaterialCoverageRowsForItem(item);
  if (!rows.length) return "";
  const materialRows = rows.filter((row) => row.materialIndex !== "");
  if (!materialRows.length) return "";
  const baseColor = materialRows.filter((row) => row.hasBaseColorTexture === "yes").length;
  const pale = materialRows.filter((row) => row.looksPale === "yes").length;
  const colorOnly = materialRows.filter((row) => row.coverageClass === "color-only").length;
  const details = [`${baseColor}/${materialRows.length} 个 baseColor 贴图`];
  if (pale) details.push(`${pale} 个疑似白膜`);
  if (colorOnly) details.push(`${colorOnly} 个纯色材质`);
  return `材质明细：${details.join(" / ")}`;
}

function runtimeMaterialRuntimePipelineRowsForItem(item) {
  if (!item) return [];
  const rows =
    materialRuntimePipelineByLookup.get(`${item.rel || ""}\t${item.modelLabel || item.variant || ""}`) ||
    materialRuntimePipelineByLookup.get(item.rel || "") ||
    materialRuntimePipelineByLookup.get(item.modelLabel || "") ||
    materialRuntimePipelineByLookup.get(item.variant || "") ||
    [];
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.rel}:${row.materialIndex}:${row.materialName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeMaterialRuntimeName(name = "") {
  return String(name || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function materialRuntimePipelineRowsForActiveItem(item = activeManifestItem) {
  return runtimeMaterialRuntimePipelineRowsForItem(item);
}

function materialRuntimePipelineRowForMaterial(material, item = activeManifestItem) {
  const materialName = normalizeMaterialRuntimeName(material?.name || "");
  if (!materialName) return null;
  return (
    materialRuntimePipelineRowsForActiveItem(item).find((row) => {
      return (
        normalizeMaterialRuntimeName(row.materialName) === materialName ||
        normalizeMaterialRuntimeName(row.shadergraphRel) === materialName
      );
    }) || null
  );
}

function materialRuntimeExecutionModes(row) {
  return [
    row?.alphaExecutionMode,
    row?.colorExecutionMode,
    row?.reflectionExecutionMode,
    row?.uvAnimationExecutionMode,
  ].filter(Boolean);
}

function materialRuntimeRowHasExecutionMode(row, mode) {
  return materialRuntimeExecutionModes(row).includes(mode);
}

function configureCharacterRuntimeTexture(texture, kind = "color") {
  texture.colorSpace = kind === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.flipY = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function loadCharacterRuntimeMaterialTexture(texturePath, kind = "color") {
  if (!texturePath) return null;
  const key = `${kind}:${texturePath}`;
  if (!characterMaterialTextureCache.has(key)) {
    const texture = characterMaterialTextureLoader.load(
      texturePath,
      (loadedTexture) => {
        loadedTexture.userData.vaingloryRuntimePlaceholder = false;
        configureCharacterRuntimeTexture(loadedTexture, kind);
      },
      undefined,
      () => {
        texture.userData.vaingloryRuntimeLoadError = texturePath;
      },
    );
    texture.name = `character_runtime_${texturePath}`;
    texture.userData.vaingloryRuntimePlaceholder = true;
    configureCharacterRuntimeTexture(texture, kind);
    characterMaterialTextureCache.set(key, texture);
  }
  return characterMaterialTextureCache.get(key);
}

function runtimeMaterialRuntimePipelineStats(item) {
  const rows = runtimeMaterialRuntimePipelineRowsForItem(item);
  if (!rows.length) return "";
  const materialRows = rows.filter((row) => row.materialIndex !== "");
  if (!materialRows.length) return "";
  const shadergraphRows = materialRows.filter((row) => row.shadergraphFound === "yes").length;
  const glbGapRows = materialRows.filter((row) => row.missingGlbRoleNames).length;
  const runtimeRoleRows = materialRows.filter((row) => row.runtimeOnlyRoleNames).length;
  const runtimeAppliedRows = materialRows.filter((row) => materialRuntimeRowHasExecutionMode(row, "runtime")).length;
  const alphaOpaqueRows = materialRows.filter((row) => row.alphaRuntimeStage === "runtime-opaque-mask").length;
  const alphaMaskRows = materialRows.filter((row) => row.alphaRuntimeStage === "runtime-alpha-mask").length;
  const uvRuntimeRows = materialRows.filter((row) => row.uvAnimationExecutionMode === "runtime").length;
  const uvDiagnosticRows = materialRows.filter((row) => row.uvAnimationExecutionMode === "diagnostic").length;
  const nativeUniformBindingRows = materialRows.filter((row) => {
    try {
      return JSON.parse(row.nativeUniformBindings || "[]").length > 0;
    } catch {
      return false;
    }
  }).length;
  const diagnosticOnlyRows = materialRows.filter((row) => {
    const modes = materialRuntimeExecutionModes(row);
    return modes.includes("diagnostic") && !modes.includes("runtime");
  }).length;
  const passStateRows = materialRows.filter((row) => row.shaderPassStateSignatures).length;
  const passStateFamilies = new Map();
  const passBlendStates = new Map();
  const passBlendPresets = new Map();
  const passDepthWriteStates = new Map();
  const colorModes = new Map();
  const nativeShaderModes = new Map();
  const nativeShaderBlockers = new Map();
  const unhashedSamplers = new Map();
  const texturePathMissingSamplers = new Map();
  const runtimeResolvedSamplers = new Map();
  const unresolvedSamplers = new Map();
  const runtimeSamplerKinds = new Map();
  const roleNames = new Set();
  const countState = (map, value) => {
    if (!value) return;
    map.set(value, (map.get(value) || 0) + 1);
  };
  for (const row of materialRows) {
    for (const role of String(row.roleNames || "").split("|").filter(Boolean)) roleNames.add(role);
    if (row.shaderPassStateFamily) {
      passStateFamilies.set(row.shaderPassStateFamily, (passStateFamilies.get(row.shaderPassStateFamily) || 0) + 1);
    }
    countState(colorModes, row.colorMode);
    countState(nativeShaderModes, row.nativeShaderMode);
    countState(nativeShaderBlockers, row.nativeShaderBlocker);
    for (const sampler of String(row.unhashedSamplers || "").split("|").filter(Boolean)) countState(unhashedSamplers, sampler);
    for (const sampler of String(row.texturePathMissingSamplers || "").split("|").filter(Boolean)) {
      countState(texturePathMissingSamplers, sampler);
    }
    for (const sampler of String(row.runtimeResolvedSamplers || "").split("|").filter(Boolean)) {
      countState(runtimeResolvedSamplers, sampler);
    }
    for (const sampler of String(row.unresolvedSamplers || "").split("|").filter(Boolean)) countState(unresolvedSamplers, sampler);
    for (const kind of String(row.runtimeSamplerKinds || "").split("|").filter(Boolean)) countState(runtimeSamplerKinds, kind);
    countState(passBlendStates, row.shaderPassBlendEnabled);
    countState(passBlendPresets, row.shaderPassBlendPreset);
    countState(passDepthWriteStates, row.shaderPassDepthWrite);
  }
  const compactStateSummary = (map) =>
    [...map.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([state, count]) => `${state}:${count}`)
      .join(", ");
  const passStateFamilySummary = [...passStateFamilies.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 3)
    .map(([family, count]) => `${family}:${count}`)
    .join(", ");
  const passBlendSummary = compactStateSummary(passBlendStates);
  const passBlendPresetSummary = compactStateSummary(passBlendPresets);
  const passDepthWriteSummary = compactStateSummary(passDepthWriteStates);
  const colorModeSummary = compactStateSummary(colorModes);
  const nativeShaderModeSummary = compactStateSummary(nativeShaderModes);
  const nativeShaderBlockerSummary = compactStateSummary(nativeShaderBlockers);
  const unhashedSamplerSummary = compactStateSummary(unhashedSamplers);
  const texturePathMissingSamplerSummary = compactStateSummary(texturePathMissingSamplers);
  const runtimeResolvedSamplerSummary = compactStateSummary(runtimeResolvedSamplers);
  const unresolvedSamplerSummary = compactStateSummary(unresolvedSamplers);
  const runtimeSamplerKindSummary = compactStateSummary(runtimeSamplerKinds);
  const details = [`${shadergraphRows}/${materialRows.length} 个 shadergraph`];
  if (glbGapRows) details.push(`${glbGapRows} 个 GLB 角色缺口`);
  if (runtimeRoleRows) details.push(`${runtimeRoleRows} 个 runtime shader 角色`);
  if (runtimeAppliedRows) details.push(`${runtimeAppliedRows} 个 runtime 已接管`);
  if (colorModeSummary) details.push(`颜色模式 ${colorModeSummary}`);
  if (nativeShaderModeSummary) details.push(`原生 shader ${nativeShaderModeSummary}`);
  if (nativeShaderBlockerSummary) details.push(`原生阻断 ${nativeShaderBlockerSummary}`);
  if (nativeUniformBindingRows) details.push(`${nativeUniformBindingRows} 个原生 uniform 绑定`);
  if (unhashedSamplerSummary) details.push(`运行时 sampler ${unhashedSamplerSummary}`);
  if (texturePathMissingSamplerSummary) details.push(`无外部贴图路径 sampler ${texturePathMissingSamplerSummary}`);
  if (runtimeResolvedSamplerSummary) details.push(`runtime 已解析 sampler ${runtimeResolvedSamplerSummary}`);
  if (runtimeSamplerKindSummary) details.push(`运行时 lookup ${runtimeSamplerKindSummary}`);
  if (unresolvedSamplerSummary) details.push(`未解析 sampler ${unresolvedSamplerSummary}`);
  if (alphaMaskRows) details.push(`${alphaMaskRows} 个 alpha mask`);
  if (alphaOpaqueRows) details.push(`${alphaOpaqueRows} 个不透明 alpha`);
  if (uvRuntimeRows) details.push(`${uvRuntimeRows} 个 UV 变换已接管`);
  if (uvDiagnosticRows) details.push(`${uvDiagnosticRows} 个复杂 UV 待还原`);
  if (diagnosticOnlyRows) details.push(`${diagnosticOnlyRows} 个仅诊断`);
  if (passStateRows) {
    details.push(`${passStateRows} 个 pass 签名${passStateFamilySummary ? ` (${passStateFamilySummary})` : ""}`);
  }
  if (passBlendSummary || passDepthWriteSummary) {
    details.push(`原生状态 blend ${passBlendSummary || "未知"} / depthWrite ${passDepthWriteSummary || "未知"}`);
  }
  if (passBlendPresetSummary) details.push(`blend 模式 ${passBlendPresetSummary}`);
  const sampledRoles = [...roleNames].slice(0, 5);
  if (sampledRoles.length) details.push(`角色 ${sampledRoles.join("/")}`);
  return `材质管线：${details.join(" / ")}`;
}

function buildRuntimeStateConditionLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    for (const key of String(item.resourceKeys || "").split("|").filter(Boolean)) {
      const rows = lookup.get(key) || [];
      rows.push(item);
      lookup.set(key, rows);
    }
  }
  return lookup;
}

function runtimeStateConditionKeysForItem(item) {
  const heroKey = heroKeyForItem(item);
  const heroEntry = heroCatalogEntry(heroKey);
  const definitionHero = String(item?.sourceRelativePath || "").match(/^Characters\/[^/]+\/([^/.]+)\.def$/)?.[1] || "";
  const skinPrefix = String(modelSkinId(item)).replace(/_DefaultSkin$/i, "").replace(/_Skin_.+$/i, "");
  return [heroKey, heroEntry?.english, definitionHero, skinPrefix, item?.character].filter(Boolean);
}

function runtimeStateConditionRowsForItem(item) {
  const rows = [];
  const seen = new Set();
  for (const key of runtimeStateConditionKeysForItem(item)) {
    for (const row of runtimeStateConditionsByKey.get(key) || []) {
      const id = `${row.sourceKind}:${row.conditionKind}:${row.functionName}:${row.callbackFunction}:${row.token}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
    }
  }
  return rows;
}

function runtimeStateConditionStats(item) {
  const rows = runtimeStateConditionRowsForItem(item);
  if (!rows.length) return "";
  const bySource = new Map();
  for (const row of rows) bySource.set(row.sourceKind, (bySource.get(row.sourceKind) || 0) + 1);
  const details = [];
  if (bySource.get("visibility-event")) details.push(`${bySource.get("visibility-event")} 条显隐`);
  if (bySource.get("visibility-state-write")) details.push(`${bySource.get("visibility-state-write")} 条显隐状态`);
  if (bySource.get("visibility-callback")) details.push(`${bySource.get("visibility-callback")} 条显隐回调`);
  if (bySource.get("attachment-state-write")) details.push(`${bySource.get("attachment-state-write")} 条附件状态`);
  if (bySource.get("attachment-callback")) details.push(`${bySource.get("attachment-callback")} 条附件回调`);
  if (bySource.get("attachment-helper-ability-slot")) details.push(`${bySource.get("attachment-helper-ability-slot")} 条技能变量`);
  if (bySource.get("projectile-callback")) details.push(`${bySource.get("projectile-callback")} 条弹道回调`);
  return `状态条件：${rows.length} 条${details.length ? `（${details.join(" / ")}）` : ""}`;
}

function runtimeAttachmentNativeChainTokenKeys(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  const keys = [text];
  if (/_bnd$/i.test(text)) keys.push(text.replace(/_bnd$/i, ""));
  for (const token of text.split(/[^A-Za-z0-9_]+/).filter((item) => item.length >= 3)) {
    keys.push(token);
    if (/_bnd$/i.test(token)) keys.push(token.replace(/_bnd$/i, ""));
  }
  return [...new Set(keys.filter(Boolean))];
}

function buildRuntimeAttachmentNativeChainLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    const keys = [
      ...String(item.resourceKeys || "").split("|"),
      ...String(item.token || "").split("|"),
      ...runtimeAttachmentNativeChainTokenKeys(item.bindToken),
    ].filter(Boolean);
    for (const key of keys) {
      const rows = lookup.get(key) || [];
      rows.push(item);
      lookup.set(key, rows);
    }
  }
  for (const rows of lookup.values()) {
    rows.sort(
      (left, right) =>
        String(left.sourceKind || "").localeCompare(String(right.sourceKind || "")) ||
        String(left.stage || "").localeCompare(String(right.stage || "")) ||
        String(left.functionName || left.callbackFunction || "").localeCompare(String(right.functionName || right.callbackFunction || "")),
    );
  }
  return lookup;
}

function runtimeAttachmentNativeChainKeysForItem(item) {
  const keys = new Set(runtimeStateConditionKeysForItem(item));
  for (const value of [item?.rel, item?.sourceRelativePath, item?.modelLabel, item?.variant, item?.character]) {
    for (const key of runtimeAttachmentNativeChainTokenKeys(value)) keys.add(key);
  }
  for (const slot of runtimeBindSlotsForItem(item)) {
    for (const key of runtimeAttachmentNativeChainTokenKeys(slot.slotName)) keys.add(key);
    for (const key of runtimeAttachmentNativeChainTokenKeys(slot.bindToken)) keys.add(key);
  }
  return [...keys].filter(Boolean);
}

function runtimeAttachmentNativeChainRowsForItem(item = activeManifestItem) {
  const rows = [];
  const seen = new Set();
  for (const key of runtimeAttachmentNativeChainKeysForItem(item)) {
    for (const row of runtimeAttachmentNativeChainsByKey.get(key) || []) {
      const id = [
        row.sourceKind,
        row.stage,
        row.functionName,
        row.callbackFunction,
        row.helperFunction,
        row.bindToken,
        row.line,
        row.contextHash,
      ].join(":");
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
    }
  }
  return rows;
}

function runtimeAttachmentNativeChainStats(item) {
  const rows = runtimeAttachmentNativeChainRowsForItem(item);
  if (!rows.length) return "";
  const bySource = new Map();
  for (const row of rows) bySource.set(row.sourceKind, (bySource.get(row.sourceKind) || 0) + 1);
  const details = [];
  if (bySource.get("attachment-frame-update")) details.push(`${bySource.get("attachment-frame-update")} 条更新`);
  if (bySource.get("attachment-extra-transform")) details.push(`${bySource.get("attachment-extra-transform")} 条额外变换`);
  if (bySource.get("attachment-animation-apply")) details.push(`${bySource.get("attachment-animation-apply")} 条应用`);
  if (bySource.get("attachment-animation-runtime")) details.push(`${bySource.get("attachment-animation-runtime")} 条动画`);
  if (bySource.get("attachment-helper-call")) details.push(`${bySource.get("attachment-helper-call")} 条 Helper 调用`);
  if (bySource.get("attachment-helper-semantics")) details.push(`${bySource.get("attachment-helper-semantics")} 条 Helper 语义`);
  if (bySource.get("attachment-runtime-data-component")) details.push(`${bySource.get("attachment-runtime-data-component")} 条技能数据`);
  if (bySource.get("attachable-runtime")) details.push(`${bySource.get("attachable-runtime")} 条装备刷新`);
  return `附件 Runtime：${rows.length} 条${details.length ? `（${details.join(" / ")}）` : ""}`;
}

function buildRuntimeAttachmentVisibilityLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    for (const key of runtimeLookupKeysForItem(item)) {
      const records = lookup.get(key) || [];
      records.push(item);
      lookup.set(key, records);
    }
  }
  for (const records of lookup.values()) {
    records.sort(
      (left, right) =>
        String(left.actionKey || "").localeCompare(String(right.actionKey || "")) ||
        String(left.animationPath || "").localeCompare(String(right.animationPath || "")) ||
        Number(left.boneIndex || 0) - Number(right.boneIndex || 0),
    );
  }
  return lookup;
}

function runtimeEffectHeroKeysForHook(item) {
  if (!item) return [];
  const keys = [];
  const addKey = (key) => {
    if (key) keys.push(key);
  };
  for (const heroCode of item.heroCodes || []) addKey(heroCode);
  for (const heroName of item.heroNames || []) addKey(heroName);
  for (const token of runtimeEffectHookTokenKeys(item.effectToken || item.token)) addKey(token);
  const definitionMatch = /^Characters\/([^/]+)\//.exec(item.primaryAbilityContext?.definitionPath || "");
  addKey(definitionMatch?.[1] || "");
  for (const resourcePath of item.resourcePaths || []) {
    const resourceMatch = resourcePath.match(/^Effects\/([^/]+)\//);
    addKey(resourceMatch?.[1] || "");
  }
  return uniqueSorted(keys);
}

function runtimeEffectHookTokenKeys(value) {
  const ignored = new Set(["effect", "ability", "attack", "crit", "cast", "hit", "impact", "projectile", "proj"]);
  return String(value || "")
    .split(/[^A-Za-z0-9]+|_/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !ignored.has(token.toLowerCase()));
}

function buildRuntimeEffectHookLookup(items) {
  const byDefinition = new Map();
  const byHero = new Map();
  for (const item of items || []) {
    const definitionPath = item.primaryAbilityContext?.definitionPath || "";
    if (definitionPath) {
      const records = byDefinition.get(definitionPath) || [];
      records.push(item);
      byDefinition.set(definitionPath, records);
    }
    for (const heroKey of runtimeEffectHeroKeysForHook(item)) {
      const records = byHero.get(heroKey) || [];
      records.push(item);
      byHero.set(heroKey, records);
    }
  }
  return { byDefinition, byHero };
}

function buildRuntimeEffectPfxLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    if (item?.relativePath) lookup.set(item.relativePath, item);
  }
  return lookup;
}

function runtimeEffectHeroKeyForPfx(pfxItem) {
  const match = /^Effects\/([^/]+)\//.exec(pfxItem?.relativePath || "");
  return match?.[1] || "";
}

function buildRuntimeEffectPfxHeroLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    const heroKey = runtimeEffectHeroKeyForPfx(item);
    if (!heroKey) continue;
    const records = lookup.get(heroKey) || [];
    records.push(item);
    lookup.set(heroKey, records);
  }
  for (const records of lookup.values()) records.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return lookup;
}

function buildRuntimeEffectDefinitionProjectileLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    if (!item?.modelLabel || !item?.resourcePath) continue;
    const records = lookup.get(item.modelLabel) || [];
    records.push(item);
    lookup.set(item.modelLabel, records);
  }
  for (const records of lookup.values()) records.sort((left, right) => left.resourcePath.localeCompare(right.resourcePath));
  return lookup;
}

function runtimeManifestListValues(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function runtimeManifestNumericListValues(value) {
  return runtimeManifestListValues(value)
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));
}

function runtimeLocatorVectorFromManifest(item, field) {
  const values = String(item?.[field] || "")
    .split(",")
    .map((part) => Number(part.trim()));
  if (values.length < 3 || values.slice(0, 3).some((value) => !Number.isFinite(value))) return null;
  return new THREE.Vector3(values[0], values[1], values[2]);
}

function runtimeLocatorPositionFromManifest(item) {
  return runtimeLocatorVectorFromManifest(item, "runtimeLocatorPosition");
}

function normalizeRuntimeEffectProjectileRow(item) {
  const locatorPosition = runtimeLocatorPositionFromManifest(item);
  const runtimeStartSeconds = Number(item.runtimeStartSeconds);
  const runtimeBindingKind =
    item.bindingStatus === "native-runtime-locator-transform" && locatorPosition
      ? "model-root-offset"
      : item.bindingBoneToken
        ? "bone"
        : "model-root";
  return {
    ...item,
    role: item.role || "projectile",
    sourceKind: "runtime-projectile-binding",
    actionKeys: runtimeManifestListValues(item.actionKeys),
    effectTokens: runtimeManifestListValues(item.effectTokens),
    nativeEffectHookTokens: runtimeManifestListValues(item.nativeEffectHookTokens),
    pairedProjectileResourcePaths: runtimeManifestListValues(item.pairedProjectileResourcePaths),
    pairedImpactResourcePaths: runtimeManifestListValues(item.pairedImpactResourcePaths),
    nativeProjectileModes: runtimeManifestListValues(item.nativeProjectileModes),
    nativeProjectileLateralOffsets: runtimeManifestNumericListValues(item.nativeProjectileLateralOffsets),
    boneToken: item.bindingBoneToken || item.boneToken || "",
    nativeProjectileId: item.nativeProjectileId || "",
    runtimeBinding: {
      kind: runtimeBindingKind,
      boneToken: item.bindingBoneToken || "",
      boneIndex: Number.isInteger(Number(item.bindingBoneIndex)) ? Number(item.bindingBoneIndex) : null,
      projectileMode: runtimeManifestListValues(item.nativeProjectileModes)[0] || "",
      lateralOffsets: runtimeManifestNumericListValues(item.nativeProjectileLateralOffsets),
      localPosition: locatorPosition ? locatorPosition.toArray() : null,
      localRotation: runtimeLocatorVectorFromManifest(item, "runtimeLocatorRotation")?.toArray() || null,
      localScale: runtimeLocatorVectorFromManifest(item, "runtimeLocatorScale")?.toArray() || null,
      locatorLabel: item.runtimeLocatorLabel || "",
      transformEvidence: item.runtimeLocatorTransformEvidence || "",
      runtimeStartSeconds: Number.isFinite(runtimeStartSeconds) ? runtimeStartSeconds : null,
      startSeconds: Number.isFinite(runtimeStartSeconds) ? runtimeStartSeconds : null,
      timelineTimes: runtimeManifestNumericListValues(item.nativeTimelineTimes),
      evidence: item.bindingStatus || "",
    },
  };
}

function buildRuntimeEffectProjectileRuntimeLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    if (!item?.modelLabel || !item?.resourcePath) continue;
    if (!RUNTIME_EFFECT_BOUND_PROJECTILE_STATUSES.has(item.bindingStatus)) continue;
    const records = lookup.get(item.modelLabel) || [];
    records.push(normalizeRuntimeEffectProjectileRow(item));
    lookup.set(item.modelLabel, records);
  }
  for (const records of lookup.values()) records.sort((left, right) => left.resourcePath.localeCompare(right.resourcePath));
  return lookup;
}

function normalizedRuntimeNativeHeroName(value) {
  return String(value || "").trim().toLowerCase();
}

function buildRuntimeNativeProjectileLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    for (const heroName of item?.heroNames || []) {
      const key = normalizedRuntimeNativeHeroName(heroName);
      if (!key) continue;
      const records = lookup.get(key) || [];
      records.push(item);
      lookup.set(key, records);
    }
  }
  for (const records of lookup.values()) {
    records.sort((left, right) =>
      String(left.emitterLabel || "").localeCompare(String(right.emitterLabel || "")) ||
      String(left.projectileIdHex || "").localeCompare(String(right.projectileIdHex || "")),
    );
  }
  return lookup;
}

function buildRuntimeNativeProjectileCallbackLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    for (const heroName of item?.heroNames || []) {
      const key = normalizedRuntimeNativeHeroName(heroName);
      if (!key) continue;
      const records = lookup.get(key) || [];
      records.push(item);
      lookup.set(key, records);
    }
  }
  for (const records of lookup.values()) {
    records.sort(
      (left, right) =>
        String(left.semanticClass || "").localeCompare(String(right.semanticClass || "")) ||
        String(left.callbackFunction || "").localeCompare(String(right.callbackFunction || "")),
    );
  }
  return lookup;
}

function buildRuntimeTimelineLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    for (const heroName of item?.heroNames || []) {
      const key = normalizedRuntimeNativeHeroName(heroName);
      if (!key) continue;
      const records = lookup.get(key) || [];
      records.push(item);
      lookup.set(key, records);
    }
  }
  for (const records of lookup.values()) {
    records.sort(
      (left, right) =>
        String(left.actionKeys?.[0] || "").localeCompare(String(right.actionKeys?.[0] || "")) ||
        Number(left.timeSeconds || 0) - Number(right.timeSeconds || 0) ||
        String(left.sourceFile || "").localeCompare(String(right.sourceFile || "")) ||
        Number(left.line || 0) - Number(right.line || 0),
    );
  }
  return lookup;
}

function buildRuntimeEffectShadergraphLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    if (item?.relativePath) lookup.set(item.relativePath, item);
  }
  return lookup;
}

function runtimeSkinGraphItem(item = activeManifestItem) {
  for (const key of runtimeLookupKeysForItem(item)) {
    const match = runtimeSkinGraph.get(key);
    if (match) return match;
  }
  return null;
}

function runtimeBindingConfigItem(item = activeManifestItem) {
  for (const key of runtimeLookupKeysForItem(item)) {
    const match = runtimeBindingConfig.get(key);
    if (match) return match;
  }
  return null;
}

function runtimeAttachmentBonesItem(item = activeManifestItem) {
  for (const key of runtimeLookupKeysForItem(item)) {
    const match = runtimeAttachmentBones.get(key);
    if (match) return match;
  }
  return null;
}

function runtimeAttachmentVisibilityRowsForItem(item = activeManifestItem) {
  const rows = [];
  const seen = new Set();
  for (const key of runtimeLookupKeysForItem(item)) {
    for (const row of runtimeAttachmentVisibilityByModel.get(key) || []) {
      if (!row?.id || seen.has(row.id)) continue;
      rows.push(row);
      seen.add(row.id);
    }
  }
  return rows;
}

function runtimeAttachmentVisibilityRowsForAnimation(animation = selectedAnimation(), item = activeManifestItem) {
  const animationPath = animation?.targetRelativePath || "";
  const actionKey = animation?.actionKey || "";
  return runtimeAttachmentVisibilityRowsForItem(item).filter(
    (row) => (animationPath && row.animationPath === animationPath) || (actionKey && row.actionKey === actionKey),
  );
}

function runtimeAttachmentVisibilityStats(item = activeManifestItem) {
  const rows = runtimeAttachmentVisibilityRowsForItem(item);
  if (!rows.length) return "";
  const windowed = rows.filter((row) => row.visibilityStatus === "time-windowed").length;
  return `显隐窗口：${rows.length} 条${windowed ? `（${windowed} 条随时间）` : ""}`;
}

function runtimeBindSlotsForItem(item = activeManifestItem) {
  const configItem = runtimeBindingConfigItem(item);
  if (Array.isArray(configItem?.slots)) return configItem.slots;
  const graphItem = runtimeSkinGraphItem(item);
  return Array.isArray(graphItem?.bindSlots) ? graphItem.bindSlots : [];
}

function runtimeBindSlotStats(item) {
  const slots = runtimeBindSlotsForItem(item);
  return slots.length ? `${slots.length} 个运行时挂点` : "";
}

function runtimeEffectHooksForItem(item = activeManifestItem) {
  const hooks = [];
  const seen = new Set();
  const pushHooks = (records = []) => {
    for (const record of records) {
      if (!record?.id || seen.has(record.id)) continue;
      hooks.push(record);
      seen.add(record.id);
    }
  };
  pushHooks(runtimeEffectHooksByDefinition.get(item?.sourceRelativePath || ""));
  pushHooks(runtimeEffectHooksByHero.get(heroKeyForItem(item)));
  return hooks;
}

function runtimeEffectPfxCandidatesForHook(hook, item = activeManifestItem) {
  if (!runtimeEffectHookHasRenderableResourceEvidence(hook)) return [];
  const items = [];
  const seen = new Set();
  for (const resourcePath of hook?.resourcePaths || []) {
    if (seen.has(resourcePath)) continue;
    if (!runtimeEffectResourcePathMatchesActiveSkin(hook, resourcePath, item)) continue;
    const pfxItem = runtimeEffectPfxByPath.get(resourcePath);
    if (!pfxItem) continue;
    items.push(pfxItem);
    seen.add(resourcePath);
  }
  for (const shadergraphOnlyItem of runtimeEffectShadergraphOnlyItemsForHook(hook, item)) {
    if (seen.has(shadergraphOnlyItem.relativePath)) continue;
    items.push(shadergraphOnlyItem);
    seen.add(shadergraphOnlyItem.relativePath);
  }
  return items;
}

function runtimeEffectShadergraphGroupPath(relativePath = "") {
  const match = String(relativePath).match(/^(.*)\.Surface\[\d+\]\.shadergraph$/i);
  return match ? match[1] : "";
}

function runtimeEffectShadergraphOnlyItemsForHook(hook, item = activeManifestItem) {
  const shadergraphPaths = Array.isArray(hook?.shadergraphPaths) ? hook.shadergraphPaths : [];
  if (!shadergraphPaths.length) return [];
  const groups = new Map();
  for (const shadergraphPath of shadergraphPaths) {
    if (!runtimeEffectShadergraphByPath.has(shadergraphPath)) continue;
    const groupPath = runtimeEffectShadergraphGroupPath(shadergraphPath);
    if (!groupPath) continue;
    const paths = groups.get(groupPath) || [];
    paths.push(shadergraphPath);
    groups.set(groupPath, paths);
  }
  const items = [...groups.entries()].map(([groupPath, paths]) => {
    const uniquePaths = uniqueSorted(paths);
    return {
      relativePath: `${groupPath}.shadergraph-only`,
      shadergraphOnly: true,
      shadergraphRefCount: uniquePaths.length,
      uniqueShadergraphRefCount: uniquePaths.length,
      references: uniquePaths.map((relativePath) => ({
        kind: "shadergraph",
        relativePath,
      })),
      surfaceRecords: [],
      hookTokens: uniqueSorted([hook?.token || ""]),
      hookEffectTokens: uniqueSorted([hook?.effectToken || hook?.token || ""]),
      hookAbilityNames: [],
    };
  });
  if (items.length <= 1) return items;
  const scored = items
    .map((pfxItem) => ({ pfxItem, score: runtimeEffectPfxVariantScore(pfxItem, item) }))
    .sort((left, right) => left.score - right.score || left.pfxItem.relativePath.localeCompare(right.pfxItem.relativePath));
  const bestScore = scored[0].score;
  return scored.filter((entry) => entry.score === bestScore).map((entry) => entry.pfxItem);
}

function runtimeEffectHookHasRenderableResourceEvidence(hook) {
  if (hook?.resourceEvidenceSource === "effect-resource-candidate") return false;
  if (hook?.aliasEvidenceStrength === "weak") return false;
  return true;
}

function runtimeEffectResourcePathMatchesActiveSkin(hook, resourcePath, item = activeManifestItem) {
  const variants = (hook?.resourceVariants || []).filter((variant) => variant.resourcePath === resourcePath);
  if (!variants.length) return true;
  return variants.some((variant) => runtimeEffectVariantMatchesItem(variant, item));
}

function runtimeEffectVariantMatchesItem(variant, item = activeManifestItem) {
  const modelLabel = variant?.modelLabel || "";
  if (!modelLabel) return true;
  const skinId = modelSkinId(item);
  if (!skinId) return variant.skinKind !== "skin";
  if (skinId === modelLabel || item?.aliasSkinId === modelLabel) return true;
  return variant.skinKind === "default" && /_DefaultSkin$/i.test(modelLabel) && /_DefaultSkin$/i.test(skinId);
}

function runtimeEffectHookAllowsMultipleBestPfxItems(hook) {
  return (
    hook?.resourceMatchKind === "kindred-effect-slot-bare-action-channel" &&
    hook?.resourceEvidenceSource === "kindred-effect-resource-slot" &&
    hook?.aliasEvidenceStrength === "strong"
  );
}

function runtimeEffectBestPfxItemsForHook(hook, item = activeManifestItem) {
  const directCandidates = runtimeEffectPfxCandidatesForHook(hook, item);
  const skinAliasIndexedCandidates = runtimeEffectSkinAliasIndexedPfxItems(hook?.effectToken || hook?.token, item, hook);
  const candidates = skinAliasIndexedCandidates.length ? skinAliasIndexedCandidates : directCandidates;
  const skinAliasScopedCandidates = runtimeEffectSkinAliasScopedPfxItems(candidates, hook?.effectToken || hook?.token, item, hook);
  const candidatesToScore = skinAliasScopedCandidates ?? candidates;
  if (candidatesToScore.length <= 1) return candidatesToScore;
  if (!candidatesToScore.length) return [];
  const scored = candidatesToScore
    .map((pfxItem) => ({ pfxItem, score: runtimeEffectPfxVariantScore(pfxItem, item) }))
    .sort((left, right) => left.score - right.score || left.pfxItem.relativePath.localeCompare(right.pfxItem.relativePath));
  const bestScore = scored[0].score;
  const best = scored.filter((entry) => entry.score === bestScore);
  return runtimeEffectHookAllowsMultipleBestPfxItems(hook) ? best.map((entry) => entry.pfxItem) : [best[0].pfxItem];
}

function runtimeEffectPfxItemsForHooks(hooks, item = activeManifestItem) {
  const items = [];
  const seen = new Set();
  for (const hook of hooks || []) {
    for (const pfxItem of runtimeEffectBestPfxItemsForHook(hook, item)) {
      if (seen.has(pfxItem.relativePath)) continue;
      items.push(pfxItem);
      seen.add(pfxItem.relativePath);
    }
  }
  return items;
}

function runtimeEffectShadergraphItemsForPfx(pfxItems) {
  const items = [];
  const seen = new Set();
  for (const pfxItem of pfxItems || []) {
    for (const reference of pfxItem.references || []) {
      if (reference.kind !== "shadergraph" || !reference.relativePath || seen.has(reference.relativePath)) continue;
      const item = runtimeEffectShadergraphByPath.get(reference.relativePath);
      if (!item) continue;
      items.push(item);
      seen.add(reference.relativePath);
    }
  }
  return items;
}

function uniqueRuntimeEffectPfxItems(items) {
  const uniqueItems = [];
  const seen = new Set();
  for (const item of items || []) {
    if (!item?.relativePath || seen.has(item.relativePath)) continue;
    seen.add(item.relativePath);
    uniqueItems.push(item);
  }
  return uniqueItems;
}

function defaultRuntimeEffectModelLabel(modelLabel) {
  return String(modelLabel || "").replace(/_Skin_[A-Za-z0-9_]+$/, "_DefaultSkin");
}

function buildRuntimeEffectDefinitionNeighborhoodLookup(items = []) {
  const lookup = new Map();
  for (const row of items || []) {
    if (row?.pfxPromotionClass !== "nearby-action-matched") continue;
    for (const modelLabel of row.pfxModelLabels || []) {
      if (!modelLabel) continue;
      const rows = lookup.get(modelLabel) || [];
      rows.push(row);
      lookup.set(modelLabel, rows);
    }
  }
  return lookup;
}

function runtimeEffectDefinitionNeighborhoodRowsForItem(item = activeManifestItem) {
  const skinId = modelSkinId(item);
  const exact = runtimeEffectDefinitionNeighborhoodByModelLabel.get(skinId) || [];
  const defaultLabel = defaultRuntimeEffectModelLabel(skinId);
  const fallback =
    defaultLabel && defaultLabel !== skinId ? runtimeEffectDefinitionNeighborhoodByModelLabel.get(defaultLabel) || [] : [];
  const rows = [];
  const seen = new Set();
  for (const row of [...exact, ...fallback]) {
    const key = [row.sourceEffectToken, row.token, row.pfxPromotionClass, ...(row.pfxResourcePaths || [])].join("\t");
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

function buildCff0EffectInstanceGraphLookup(items = []) {
  const lookup = new Map();
  for (const row of items || []) {
    const label = row?.ownerLabel || row?.modelLabel || "";
    if (!label) continue;
    const rows = lookup.get(label) || [];
    rows.push(row);
    lookup.set(label, rows);
  }
  return lookup;
}

function cff0EffectInstanceRowsForItem(item = activeManifestItem) {
  const skinId = modelSkinId(item);
  const exact = cff0EffectInstanceGraphByModelLabel.get(skinId) || [];
  const defaultLabel = defaultRuntimeEffectModelLabel(skinId);
  const fallback =
    defaultLabel && defaultLabel !== skinId ? cff0EffectInstanceGraphByModelLabel.get(defaultLabel) || [] : [];
  const rows = [];
  const seen = new Set();
  for (const row of [...exact, ...fallback]) {
    const key = row.id || [row.ownerLabel, row.ownerFieldOffset, row.targetObjectOffset, row.effectToken].join("\t");
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

function runtimeEffectProjectilesForItemFromLookup(lookup, item = activeManifestItem) {
  const exact = lookup.get(item?.modelLabel || "") || [];
  if (exact.length) return exact;
  const defaultLabel = defaultRuntimeEffectModelLabel(item?.modelLabel || "");
  if (!defaultLabel || defaultLabel === item?.modelLabel) return [];
  return lookup.get(defaultLabel) || [];
}

function runtimeEffectDefinitionProjectilesForItem(item = activeManifestItem) {
  if (runtimeEffectProjectileRuntimeLoaded) {
    return runtimeEffectProjectilesForItemFromLookup(runtimeEffectProjectileRuntimeByModelLabel, item);
  }
  return runtimeEffectProjectilesForItemFromLookup(runtimeEffectDefinitionProjectilesByModelLabel, item);
}

function runtimeEffectProjectileBindingStats(item = activeManifestItem) {
  const rows = runtimeEffectDefinitionProjectilesForItem(item).filter((row) => !row.role || row.role === "projectile");
  if (!rows.length || !runtimeEffectProjectileRuntimeLoaded) return "";
  const bound = rows.filter((row) => RUNTIME_EFFECT_BOUND_PROJECTILE_STATUSES.has(row.bindingStatus)).length;
  const unbound = rows.filter(
    (row) => !RUNTIME_EFFECT_BOUND_PROJECTILE_STATUSES.has(row.bindingStatus) && row.bindingStatus !== "effect-library-only",
  ).length;
  const byStatus = new Map();
  for (const row of rows) byStatus.set(row.bindingStatus || "unknown", (byStatus.get(row.bindingStatus || "unknown") || 0) + 1);
  const details = [];
  if (byStatus.get("native-runtime-locator-transform")) details.push(`${byStatus.get("native-runtime-locator-transform")} 条 locator`);
  if (byStatus.get("native-emitter-slot")) details.push(`${byStatus.get("native-emitter-slot")} 条发射点`);
  if (byStatus.get("native-effect-hook")) details.push(`${byStatus.get("native-effect-hook")} 条特效挂点`);
  if (byStatus.get("native-nearby-bone")) details.push(`${byStatus.get("native-nearby-bone")} 条附近骨骼`);
  if (byStatus.get("definition-bone")) details.push(`${byStatus.get("definition-bone")} 条定义骨骼`);
  if (byStatus.get("effect-library-only")) details.push(`${byStatus.get("effect-library-only")} 条仅资源库`);
  if (unbound) details.push(`${unbound} 条缺 native`);
  return `弹道绑定：${rows.length} 条（${bound} 已绑定${details.length ? ` / ${details.join(" / ")}` : ""}）`;
}

function runtimeNativeHeroNamesForItem(item = activeManifestItem) {
  const heroKey = heroKeyForItem(item);
  const catalogEntry = heroCatalogEntry(heroKey);
  const modelHero = String(item?.modelLabel || item?.variant || "").match(/^([^_]+?)(?:_DefaultSkin|_Skin_|$)/)?.[1] || "";
  const definitionHero = String(item?.sourceRelativePath || "").match(/^Characters\/[^/]+\/([^/.]+)\.def$/)?.[1] || "";
  return [...new Set([heroKey, item?.character, catalogEntry?.english, modelHero, definitionHero].filter(Boolean))];
}

function runtimeNativeProjectileRowsForItem(item = activeManifestItem) {
  const rows = [];
  const seen = new Set();
  for (const heroName of runtimeNativeHeroNamesForItem(item)) {
    for (const row of runtimeNativeProjectilesByHero.get(normalizedRuntimeNativeHeroName(heroName)) || []) {
      const key = row.id || `${row.sourceFile}\t${row.line}\t${row.projectileIdHex}\t${row.emitterLabel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

function runtimeNativeProjectileCallbackRowsForItem(item = activeManifestItem) {
  const rows = [];
  const seen = new Set();
  for (const heroName of runtimeNativeHeroNamesForItem(item)) {
    for (const row of runtimeNativeProjectileCallbacksByHero.get(normalizedRuntimeNativeHeroName(heroName)) || []) {
      const key = row.id || `${row.sourceFile || ""}\t${row.callbackSlot || ""}\t${row.callbackFunction || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

function runtimeNativeProjectileCallbackStats(item = activeManifestItem) {
  const rows = runtimeNativeProjectileCallbackRowsForItem(item);
  if (!rows.length) return "";
  const directlyApplicable = rows.filter((row) => row.semanticClass === "constant" || row.semanticClass === "multiplier").length;
  const unresolved = rows.filter((row) => row.semanticClass === "unresolved").length;
  const stateConditional = rows.filter((row) => row.semanticClass === "state-conditional-emitter").length;
  const details = [];
  if (directlyApplicable) details.push(`${directlyApplicable} 条可直接应用`);
  if (stateConditional) details.push(`${stateConditional} 条状态切换`);
  if (unresolved) details.push(`${unresolved} 条待解析`);
  return `弹道回调：${rows.length} 条${details.length ? `（${details.join(" / ")}）` : ""}`;
}

function runtimeNativeProjectileCallbackFieldValues(row, singleField, listField) {
  const values = [
    ...(Array.isArray(row?.[listField]) ? row[listField] : runtimeManifestListValues(row?.[listField])),
    row?.[singleField],
  ];
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function runtimeNativeProjectileCallbackOrderedFieldValues(row, singleField, listField) {
  const values = Array.isArray(row?.[listField]) ? row[listField] : runtimeManifestListValues(row?.[listField]);
  const ordered = values.map((value) => String(value || "").trim()).filter(Boolean);
  if (ordered.length) return ordered;
  const fallback = String(row?.[singleField] || "").trim();
  return fallback ? [fallback] : [];
}

function runtimeNativeProjectileCallbackValuesIntersect(rowValues, runtimeValues) {
  if (!rowValues.length || !runtimeValues.length) return true;
  const runtimeValueSet = new Set(runtimeValues.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
  return rowValues.some((value) => runtimeValueSet.has(String(value || "").trim().toLowerCase()));
}

function runtimeNativeProjectileCallbackMatchesEntry(row, entry) {
  const projectile = entry?.projectile || entry?.projectileSourceEntry?.projectile || null;
  if (projectile && !runtimeNativeProjectileActionMatches(row, projectile)) return false;
  const nativeProjectile = entry?.bindingTarget?.nativeProjectile || entry?.projectileSourceEntry?.bindingTarget?.nativeProjectile || null;
  const rowProjectileIds = runtimeNativeProjectileCallbackFieldValues(row, "projectileIdHex", "projectileIdHexes");
  const runtimeProjectileIds = [nativeProjectile?.projectileIdHex, projectile?.nativeProjectileId]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!runtimeNativeProjectileCallbackValuesIntersect(rowProjectileIds, runtimeProjectileIds)) return false;
  const rowEmitters = runtimeNativeProjectileCallbackFieldValues(row, "emitterLabel", "emitterLabels");
  const runtimeEmitters = [
    nativeProjectile?.emitterLabel,
    entry?.bindingTarget?.locatorLabel,
    projectile?.runtimeLocatorLabel,
    projectile?.runtimeBinding?.locatorLabel,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!runtimeNativeProjectileCallbackValuesIntersect(rowEmitters, runtimeEmitters)) return false;
  return true;
}

function runtimeNativeProjectileCallbackRowsForEntry(entry, item = activeManifestItem) {
  return runtimeNativeProjectileCallbackRowsForItem(item).filter((row) => runtimeNativeProjectileCallbackMatchesEntry(row, entry));
}

function runtimeEffectProjectileCallbackBranches(row) {
  const projectileIdHexes = runtimeNativeProjectileCallbackOrderedFieldValues(row, "projectileIdHex", "projectileIdHexes");
  const emitterLabels = runtimeNativeProjectileCallbackOrderedFieldValues(row, "emitterLabel", "emitterLabels");
  const constantValues = (Array.isArray(row?.constantValues) ? row.constantValues : runtimeManifestListValues(row?.constantValues))
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const branchCount = Math.max(projectileIdHexes.length, emitterLabels.length, constantValues.length);
  return Array.from({ length: branchCount }, (_, index) => ({
    branchIndex: index,
    projectileIdHex: projectileIdHexes[index] || "",
    emitterLabel: emitterLabels[index] || "",
    constantValue: constantValues[index] || "",
    semanticClass: row?.semanticClass || "",
  })).filter((branch) => branch.projectileIdHex || branch.emitterLabel || branch.constantValue);
}

function runtimeEffectProjectileCallbackBranchMatchesEntry(branch, entry) {
  const projectile = entry?.projectile || entry?.projectileSourceEntry?.projectile || null;
  const nativeProjectile = entry?.bindingTarget?.nativeProjectile || entry?.projectileSourceEntry?.bindingTarget?.nativeProjectile || null;
  const runtimeProjectileIds = [nativeProjectile?.projectileIdHex, projectile?.nativeProjectileId]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const runtimeEmitters = [
    nativeProjectile?.emitterLabel,
    entry?.bindingTarget?.locatorLabel,
    projectile?.runtimeLocatorLabel,
    projectile?.runtimeBinding?.locatorLabel,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return (
    runtimeNativeProjectileCallbackValuesIntersect([branch?.projectileIdHex].filter(Boolean), runtimeProjectileIds) &&
    runtimeNativeProjectileCallbackValuesIntersect([branch?.emitterLabel].filter(Boolean), runtimeEmitters)
  );
}

function runtimeEffectProjectileCallbackBranchesForEntry(row, entry) {
  return runtimeEffectProjectileCallbackBranches(row).filter((branch) => runtimeEffectProjectileCallbackBranchMatchesEntry(branch, entry));
}

function runtimeEffectProjectileCallbackBranchBindingTarget(entry, item = activeManifestItem) {
  if (!runtimeEffectIsProjectile(entry)) return null;
  const candidates = [];
  for (const row of runtimeNativeProjectileCallbackRowsForEntry(entry, item)) {
    for (const branch of runtimeEffectProjectileCallbackBranchesForEntry(row, entry)) {
      if (!branch.emitterLabel) continue;
      runtimeBindSlotsForItem(item).forEach((slot, slotIndex) => {
        const definitionLabels = runtimeDefinitionLabelsForSlot(slot);
        if (!definitionLabels.has(branch.emitterLabel)) return;
        candidates.push({
          branch,
          slot,
          slotIndex,
          score: runtimeNativeProjectileEmitterSlotScore({ emitterLabel: branch.emitterLabel }, slot),
        });
      });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((left, right) => right.score - left.score || left.slotIndex - right.slotIndex);
  const { branch, slot } = candidates[0];
  if (Number.isInteger(Number(slot.resolvedBoneIndex))) {
    return {
      kind: "bone",
      boneIndex: Number(slot.resolvedBoneIndex),
      boneToken: slot.slotName,
      nativeProjectile: { projectileIdHex: branch.projectileIdHex, emitterLabel: branch.emitterLabel, callbackBranch: branch },
      callbackBranchBinding: true,
    };
  }
  return {
    kind: "bone-name",
    boneIndex: null,
    boneToken: slot.slotName,
    nativeProjectile: { projectileIdHex: branch.projectileIdHex, emitterLabel: branch.emitterLabel, callbackBranch: branch },
    callbackBranchBinding: true,
  };
}

function runtimeEffectEntryWithBindingTarget(entry, bindingTarget) {
  return {
    ...entry,
    hook: {
      ...entry.hook,
      boneToken: bindingTarget.boneToken || "",
      runtimeBinding: {
        ...(entry.hook?.runtimeBinding || {}),
        kind: bindingTarget.kind,
        boneToken: bindingTarget.boneToken || "",
        localPosition: bindingTarget.localPosition ? bindingTarget.localPosition.toArray() : null,
      },
    },
    bindingTarget,
  };
}

function runtimeEffectProjectileCallbackDebugRows(entry) {
  return runtimeNativeProjectileCallbackRowsForEntry(entry).map((row) => ({
    semanticClass: row.semanticClass || "",
    callbackSlot: row.callbackSlot || "",
    actionKeys: row.actionKeys || [],
    projectileIdHexes: runtimeNativeProjectileCallbackFieldValues(row, "projectileIdHex", "projectileIdHexes"),
    emitterLabels: runtimeNativeProjectileCallbackFieldValues(row, "emitterLabel", "emitterLabels"),
    branches: runtimeEffectProjectileCallbackBranches(row),
    matchedBranches: runtimeEffectProjectileCallbackBranchesForEntry(row, entry),
    evidenceTags: row.evidenceTags || "",
  }));
}

function runtimeProjectileCallbackSmallConstant(row) {
  const values = (row?.constantValues || []).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  return values.find((value) => Math.abs(value) > 0.001 && Math.abs(value) <= 2) || 0;
}

function runtimeEffectProjectileCallbackLateralOffset(entry) {
  const row = runtimeNativeProjectileCallbackRowsForEntry(entry).find(
    (candidate) => candidate.semanticClass === "constant" && candidate.callbackSlot === "projectileCallback38",
  );
  const value = runtimeProjectileCallbackSmallConstant(row);
  return value ? value * 12 : 0;
}

function runtimeTimelineRowsForItem(item = activeManifestItem) {
  const rows = [];
  const seen = new Set();
  for (const heroName of runtimeNativeHeroNamesForItem(item)) {
    for (const row of runtimeTimelineByHero.get(normalizedRuntimeNativeHeroName(heroName)) || []) {
      const key =
        row.id ||
        `${row.sourceFile || ""}\t${row.functionName || ""}\t${row.line || ""}\t${row.eventKind || ""}\t${
          row.effectToken || row.projectileIdHex || ""
        }`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

function runtimeTimelineStats(item = activeManifestItem) {
  const rows = runtimeTimelineRowsForItem(item);
  if (!rows.length) return "";
  const byKind = new Map();
  for (const row of rows) byKind.set(row.eventKind, (byKind.get(row.eventKind) || 0) + 1);
  const details = [];
  if (byKind.get("action")) details.push(`${byKind.get("action")} 个动作入口`);
  if (byKind.get("delay")) details.push(`${byKind.get("delay")} 个时间点`);
  if (byKind.get("effect")) details.push(`${byKind.get("effect")} 个特效事件`);
  if (byKind.get("projectile")) details.push(`${byKind.get("projectile")} 个弹道事件`);
  return `运行时时间线：${rows.length} 条事件${details.length ? `（${details.join(" / ")}）` : ""}`;
}

function runtimeDefinitionLabelsForSlot(slot) {
  const labels = new Set();
  for (const rawDefinitionLabels of [slot?.definitionLabels, slot?.definitionLocatorLabels]) {
    for (const label of String(rawDefinitionLabels || "").split("|")) {
      const cleaned = label.trim().replace(/^\?+/, "");
      if (!cleaned) continue;
      labels.add(cleaned);
    }
  }
  return labels;
}

function runtimeEffectDefinitionProjectilePfxItemsForItem(item = activeManifestItem) {
  return uniqueRuntimeEffectPfxItems(
    runtimeEffectDefinitionProjectilesForItem(item)
      .map((projectile) => runtimeEffectPfxByPath.get(projectile.resourcePath))
      .filter(Boolean),
  );
}

function runtimeEffectDefinitionNeighborhoodPfxItemsForItem(item = activeManifestItem) {
  return uniqueRuntimeEffectPfxItems(
    runtimeEffectDefinitionNeighborhoodRowsForItem(item)
      .flatMap((row) => row.pfxResourcePaths || [])
      .map((resourcePath) => runtimeEffectPfxByPath.get(resourcePath))
      .filter(Boolean),
  );
}

function runtimeEffectAllPfxItemsForItem(item = activeManifestItem) {
  const hooks = runtimeEffectHooksForItem(item);
  const hookPfxItems = runtimeEffectPfxItemsForHooks(hooks, item);
  const definitionProjectilePfxItems = runtimeEffectDefinitionProjectilePfxItemsForItem(item);
  const definitionNeighborhoodPfxItems = runtimeEffectDefinitionNeighborhoodPfxItemsForItem(item);
  const fallbackPfxItems = runtimeEffectFallbackPfxItemsForItem(item);
  return uniqueRuntimeEffectPfxItems([...hookPfxItems, ...definitionProjectilePfxItems, ...definitionNeighborhoodPfxItems, ...fallbackPfxItems]);
}

function runtimeEffectPfxLooksProjectile(pfxItem) {
  return RUNTIME_EFFECT_PROJECTILE_PATTERN.test(String(pfxItem?.relativePath || ""));
}

function runtimeEffectProjectilePfxItemsForItem(item = activeManifestItem) {
  return runtimeEffectFallbackPfxItemsForItem(item).filter(runtimeEffectPfxLooksProjectile);
}

const RUNTIME_EFFECT_UV_GAP_REASON_LABELS = {
  "sampled-uv-distortion": "采样扰动",
  "multi-phase-uv-expression": "多相位 UV",
  "complex-uv-expression": "复杂 UV",
  "complex-flipbook-phase": "复杂序列帧",
  "trig-rotated-uv": "旋转 UV",
  "no-texture-uv-expression": "缺 UV 表达式",
};

const RUNTIME_EFFECT_UV_GAP_INPUT_LABELS = {
  "uv0.x": "uv0.x",
  "uv0.y": "uv0.y",
  "uv0.z": "uv0.z",
  "uv0.w": "uv0.w",
  "vertexColor.x": "vertexColor.x",
  "vertexColor.y": "vertexColor.y",
  "vertexColor.z": "vertexColor.z",
  "vertexColor.w": "vertexColor.w",
};

const RUNTIME_EFFECT_UV_RUNTIME_EVIDENCE_KIND_LABELS = {
  "pfx-surface-vertex-color-parameters": "PFX surface vertexColor 参数",
  "pfx-surface-uv-parameters": "PFX surface UV 参数",
};

const RUNTIME_EFFECT_SURFACE_REJECT_REASON_LABELS = {
  "area-base-card-risk": "area 基础面",
  "area-masked-base-card-risk": "area 遮罩基础面",
  "area-uv-base-card-risk": "area UV 基础面",
};

const RUNTIME_EFFECT_PFX_PARAMETER_PROFILE_LABELS = {
  "lifecycle-transform": "生命周期+变换",
  lifecycle: "生命周期",
  transform: "变换",
  sampled: "采样参数",
};

const RUNTIME_EFFECT_PFX_EMITTER_RUNTIME_PROFILE_LABELS = {
  lifecycle: "生命周期",
  transform: "变换曲线",
  color: "颜色曲线",
};

const RUNTIME_EFFECT_PFX_EMITTER_CALLBACK_TARGET_LABELS = {
  velocity: "速度",
  position: "位置",
  size: "尺寸",
  rotation: "旋转",
  color: "颜色",
};

const RUNTIME_EFFECT_PFX_EMITTER_CALLBACK_INPUT_KIND_LABELS = {
  "candidate-key": "候选 resolver key",
  "literal-or-null": "常量或空 callback",
  "packed-literal": "内联 packed 参数",
};

const RUNTIME_EFFECT_PFX_EMITTER_CALLBACK_LAYOUT_EVIDENCE_LABELS = {
  "question-prefixed-surface-path": "?Effects 布局未证实",
};

const RUNTIME_EFFECT_PFX_EMITTER_RESOLVER_TABLE_COMPATIBILITY_LABELS = {
  "cross-build-reference": "跨 build 参考",
  "exact-build": "精确构建",
  "missing-evidence": "缺版本证据",
};

const RUNTIME_EFFECT_PFX_EMITTER_CURRENT_BUILD_STATUS_LABELS = {
  "matched-current-table-candidate": "当前表候选命中",
  "missing-current-table-candidate": "当前表确认缺失",
};

const RUNTIME_EFFECT_PFX_EMITTER_CURRENT_SEMANTIC_CLASS_LABELS = {
  "constant-scalar-store": "常量标量",
  "constant-zero-scalar-store": "零标量",
  "constant-vector4-load-store": "常量向量",
  "constant-vector2-load-store": "常量双分量",
  "constant-zero-vector3-store": "零向量",
  "helper-call-callback": "helper 调用",
  "computed-callback": "计算函数",
  "unresolved-callback": "未解析 callback",
};

const RUNTIME_EFFECT_PFX_EMITTER_CALLBACK_RESOLUTION_LABELS = {
  "pending-table-resolution": "待表解析",
  "likely-null-literal": "常量或空 callback",
  "likely-packed-literal": "内联 packed 参数",
  "current-table-callback-matched": "当前表 callback 已命中",
};

const RUNTIME_EFFECT_PFX_BINDING_PROFILE_LABELS = {
  bone: "骨骼绑定",
  "effect-channel": "特效通道",
  "selected-attachment": "选中附件",
};

const RUNTIME_EFFECT_PFX_SURFACE_RENDER_FAMILY_LABELS = {
  billboard: "面片",
  area: "范围面",
  beam: "光束",
};

const RUNTIME_EFFECT_PFX_NATIVE_OPTION_LABELS = {
  "follow-target": "跟随目标",
  "world-binding-candidate": "世界绑定候选",
  "visible-or-active": "显式可见",
  "hidden-or-inactive": "显式隐藏",
  "raw-offset-values": "原始数值参数",
  color: "颜色",
  scale: "缩放",
  percentParam: "百分比参数",
  fade: "淡出",
};

const RUNTIME_EFFECT_PFX_NATIVE_OPTION_RUNTIME_HINT_LABELS = {
  delaySeconds: "延迟",
  durationSeconds: "持续",
  sizeScalar: "尺寸",
  rotationDegrees: "旋转",
};

function runtimeEffectUvGapReasonLabel(reason) {
  return RUNTIME_EFFECT_UV_GAP_REASON_LABELS[reason] || reason || "未知 UV";
}

function runtimeEffectUvGapInputLabel(input) {
  return RUNTIME_EFFECT_UV_GAP_INPUT_LABELS[input] || input || "未知输入";
}

function runtimeEffectUvRuntimeEvidenceKindLabel(kind) {
  return RUNTIME_EFFECT_UV_RUNTIME_EVIDENCE_KIND_LABELS[kind] || kind || "未知 PFX UV 参数";
}

function runtimeEffectSurfaceRejectReasonLabel(reason) {
  return RUNTIME_EFFECT_SURFACE_REJECT_REASON_LABELS[reason] || reason || "未知卡片风险";
}

function runtimeEffectPfxParameterProfileLabel(evidenceClass) {
  return RUNTIME_EFFECT_PFX_PARAMETER_PROFILE_LABELS[evidenceClass] || evidenceClass || "未知参数";
}

function runtimeEffectPfxEmitterRuntimeProfileLabel(kind) {
  return RUNTIME_EFFECT_PFX_EMITTER_RUNTIME_PROFILE_LABELS[kind] || kind || "未知 emitter 字段";
}

function runtimeEffectPfxEmitterCallbackTargetLabel(kind) {
  return RUNTIME_EFFECT_PFX_EMITTER_CALLBACK_TARGET_LABELS[kind] || kind || "未知目标";
}

function runtimeEffectPfxEmitterCallbackInputKindLabel(kind) {
  return RUNTIME_EFFECT_PFX_EMITTER_CALLBACK_INPUT_KIND_LABELS[kind] || kind || "未知输入";
}

function runtimeEffectPfxEmitterCallbackLayoutEvidenceLabel(kind) {
  return RUNTIME_EFFECT_PFX_EMITTER_CALLBACK_LAYOUT_EVIDENCE_LABELS[kind] || kind || "未知布局";
}

function runtimeEffectPfxEmitterResolverTableCompatibilityLabel(kind) {
  return RUNTIME_EFFECT_PFX_EMITTER_RESOLVER_TABLE_COMPATIBILITY_LABELS[kind] || kind || "未知表来源";
}

function runtimeEffectPfxEmitterCurrentBuildStatusLabel(kind) {
  return RUNTIME_EFFECT_PFX_EMITTER_CURRENT_BUILD_STATUS_LABELS[kind] || kind || "未知当前表状态";
}

function runtimeEffectPfxEmitterCurrentSemanticClassLabel(kind) {
  return RUNTIME_EFFECT_PFX_EMITTER_CURRENT_SEMANTIC_CLASS_LABELS[kind] || kind || "未知 callback 语义";
}

function runtimeEffectPfxEmitterCallbackResolutionLabel(kind) {
  return RUNTIME_EFFECT_PFX_EMITTER_CALLBACK_RESOLUTION_LABELS[kind] || kind || "未知解析状态";
}

function runtimeEffectPfxBindingProfileLabel(kind) {
  return RUNTIME_EFFECT_PFX_BINDING_PROFILE_LABELS[kind] || kind || "未知绑定";
}

function runtimeEffectPfxSurfaceRenderFamilyLabel(renderFamily) {
  return RUNTIME_EFFECT_PFX_SURFACE_RENDER_FAMILY_LABELS[renderFamily] || renderFamily || "未知类型";
}

function runtimeEffectPfxNativeOptionLabel(optionKind) {
  return RUNTIME_EFFECT_PFX_NATIVE_OPTION_LABELS[optionKind] || optionKind || "未知 native 参数";
}

function runtimeEffectPfxNativeOptionRuntimeHintLabel(semantic) {
  return RUNTIME_EFFECT_PFX_NATIVE_OPTION_RUNTIME_HINT_LABELS[semantic] || semantic || "未知 PFX 槽位";
}

function runtimeEffectUvGapReasonCounts(shadergraphItems) {
  const counts = new Map();
  for (const shadergraphItem of shadergraphItems || []) {
    const reason = shadergraphItem.previewUvAnimationGapReason || "";
    if (!reason) continue;
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return counts;
}

function runtimeEffectUvGapInputCounts(shadergraphItems) {
  const counts = new Map();
  for (const shadergraphItem of shadergraphItems || []) {
    for (const input of shadergraphItem.previewUvAnimationGapInputs || []) {
      counts.set(input, (counts.get(input) || 0) + 1);
    }
  }
  return counts;
}

function runtimeEffectUvRuntimeEvidenceKindCounts(shadergraphItems) {
  const counts = new Map();
  for (const shadergraphItem of shadergraphItems || []) {
    const kind = shadergraphItem.previewUvRuntimeEvidence?.kind || "";
    if (!kind) continue;
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  return counts;
}

function runtimeEffectShadergraphRuntimeUvFallbackMode(shadergraphItem) {
  if (!shadergraphItem?.previewUvAnimationGapReason) return "";
  const evidenceKind = shadergraphItem.previewUvRuntimeEvidence?.kind || "";
  const offsets = (shadergraphItem.previewUvRuntimeEvidence?.parameterSampleOffsets || []).map(Number).filter(Number.isFinite);
  if (!offsets.length) return "";
  if (evidenceKind === "pfx-surface-uv-parameters") return "scroll";

  const vertexColorInputs = shadergraphItem.previewUvRuntimeEvidence?.vertexColorInputs || [];
  if (evidenceKind !== "pfx-surface-vertex-color-parameters" || !vertexColorInputs.length) return "";
  if (shadergraphItem.previewUvAnimationGapReason === "trig-rotated-uv") return "rotate";
  if (shadergraphItem.previewUvAnimationGapReason === "sampled-uv-distortion") return "distort";
  return "";
}

function runtimeEffectUvRuntimeFallbackCount(shadergraphItems) {
  return (shadergraphItems || []).filter((shadergraphItem) => runtimeEffectShadergraphRuntimeUvFallbackMode(shadergraphItem)).length;
}

function runtimeEffectUvStaticPreviewCount(shadergraphItems) {
  return (shadergraphItems || []).filter(
    (shadergraphItem) =>
      shadergraphItem.previewUvAnimationGapReason &&
      runtimeEffectShadergraphHasRuntimeUvEvidence(shadergraphItem) &&
      !runtimeEffectShadergraphRuntimeUvFallbackMode(shadergraphItem),
  ).length;
}

function runtimeEffectPreviewSurfaceRejectReasonCounts(shadergraphItems) {
  const counts = new Map();
  for (const shadergraphItem of shadergraphItems || []) {
    const reason = shadergraphItem.previewSurfaceRejectReason || "";
    if (!reason) continue;
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return counts;
}

function runtimeEffectBlockedPreviewSurfaceDetails(shadergraphItems, pfxItem, entry = {}) {
  return (shadergraphItems || [])
    .map((shadergraphItem) => {
      const rejectReason = shadergraphItem.previewSurfaceRejectReason || "";
      if (!/card-risk/.test(rejectReason)) return null;
      const surfaceRecord = runtimeEffectSurfaceRecordForShadergraph(pfxItem, shadergraphItem);
      return {
        relativePath: shadergraphItem.relativePath || "",
        renderFamily: runtimeEffectShadergraphRenderFamily(pfxItem, shadergraphItem),
        rejectReason,
        materialStatus: shadergraphItem.materialStatus || "",
        roleNames: shadergraphItem.roleNames || [],
        previewBlendMode: shadergraphItem.previewBlendMode || "",
        previewTexture: shadergraphItem.previewTexture || "",
        previewTextureMode: shadergraphItem.previewTextureMode || "",
        areaShapeEvidence: runtimeEffectAreaSurfaceHasShapeEvidence(shadergraphItem, pfxItem, entry),
        areaShapeGapReason: runtimeEffectAreaSurfaceShapeGapReason(shadergraphItem, pfxItem, entry),
        parameterEvidenceClass: surfaceRecord?.parameterProfile?.evidenceClass || "",
        parameterSemanticSlots: surfaceRecord?.parameterProfile?.semanticSlots || [],
        runtimeHints: {
          durationSeconds: runtimeEffectSurfaceRuntimeHint(surfaceRecord, "durationSeconds"),
          delaySeconds: runtimeEffectSurfaceRuntimeHint(surfaceRecord, "delaySeconds"),
          sizeScalar: runtimeEffectSurfaceRuntimeHint(surfaceRecord, "sizeScalar"),
          rotationDegrees: runtimeEffectSurfaceRuntimeHint(surfaceRecord, "rotationDegrees"),
        },
      };
    })
    .filter(Boolean);
}

function runtimeEffectBlockedPreviewCandidateRows(hooks = runtimeEffectHooksForItem(), item = activeManifestItem, animation = selectedAnimation()) {
  const rows = [];
  for (const hook of hooks || []) {
    const bindingTarget = runtimeEffectBindingTarget(hook, item);
    if (!bindingTarget) continue;
    const pfxItems = runtimeEffectPfxItemsForHooks([hook], item);
    for (const pfxItem of pfxItems) {
      const shadergraphItems = runtimeEffectShadergraphItemsForPfx([pfxItem]);
      if (!shadergraphItems.length) continue;
      const pfxBindingProfile = runtimeEffectPfxBindingProfileForEntry(pfxItem, hook);
      const entryContext = {
        hook,
        pfxItem,
        pfxBindingProfile,
        bindingTarget,
        sourceKind: hook.sourceKind || "native-effect-hook",
        effectToken: hook.effectToken || hook.token || pfxItem.relativePath,
        actionKeys: hook.actionKeys || [],
      };
      const projectileRuntimeCoverage = runtimeEffectProjectileRuntimeCoverage(entryContext, animation, item);
      if (projectileRuntimeCoverage) continue;
      if (runtimeEffectPreviewShadergraphItems(shadergraphItems, pfxItem, entryContext).length) continue;

      const blockedSurfaceDetails = runtimeEffectBlockedPreviewSurfaceDetails(shadergraphItems, pfxItem, entryContext)
        .filter((detail) => detail.areaShapeGapReason);
      const blockedSurfaceReasons = blockedSurfaceDetails.map((detail) => detail.rejectReason || detail.areaShapeGapReason).filter(Boolean);
      if (!blockedSurfaceReasons.length) continue;

      rows.push({
        hookId: hook.id || "",
        effectToken: hook.effectToken || hook.token || pfxItem.relativePath,
        pfxPath: pfxItem.relativePath,
        actionKeys: hook.actionKeys || [],
        inferredActionKeys: [...runtimeEffectInferredActionKeys(entryContext)],
        bindingKind: bindingTarget.kind || "",
        boneIndex: bindingTarget.boneIndex ?? null,
        boneToken: bindingTarget.boneToken || "",
        effectChannelFallback: Boolean(bindingTarget?.effectChannelFallback),
        hasStrongSpatialEvidence: runtimeEffectEntryHasStrongSpatialEvidence(entryContext),
        hasTimelineEvidence: runtimeEffectHasTimelineEvidence(entryContext),
        pfxBindingKind: pfxBindingProfile?.kind || "",
        pfxBindingBoneToken: pfxBindingProfile?.boneToken || "",
        pfxBindingEvidence: pfxBindingProfile?.evidence || "",
        pfxBindingSourceKind: pfxBindingProfile?.sourceKind || "",
        resourceKey: `${hook.id || hook.effectToken || hook.token || ""}\t${pfxItem.relativePath}`,
        blockedSurfaceCount: blockedSurfaceReasons.length,
        blockedSurfaceReasons,
        blockedSurfaceDetails,
      });
    }
  }
  return rows;
}

function runtimeEffectBlockedPreviewSurfaceReasonCounts(hooks, item = activeManifestItem, animation = selectedAnimation()) {
  const reasonCounts = new Map();
  const blockedPreviewResources = new Set();
  let blockedPreviewSurfaceCount = 0;

  for (const row of runtimeEffectBlockedPreviewCandidateRows(hooks, item, animation)) {
    blockedPreviewSurfaceCount += row.blockedSurfaceCount;
    blockedPreviewResources.add(row.resourceKey);
    for (const reason of row.blockedSurfaceReasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    }
  }

  return {
    blockedPreviewResourceCount: blockedPreviewResources.size,
    blockedPreviewSurfaceCount,
    reasonCounts,
  };
}

function runtimeEffectPfxParameterProfileCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      if (!record.parameterProfile?.semanticSlots?.length) continue;
      const evidenceClass = record.parameterProfile.evidenceClass || "sampled";
      counts.set(evidenceClass, (counts.get(evidenceClass) || 0) + 1);
    }
  }
  return counts;
}

function runtimeEffectPfxEmitterRuntimeProfileCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      const profile = record.emitterRuntimeProfile;
      if (!profile?.semanticSlots?.length) continue;
      counts.set("profile", (counts.get("profile") || 0) + 1);
      if (profile.lifecycleOffsets?.length) counts.set("lifecycle", (counts.get("lifecycle") || 0) + 1);
      if (profile.transformOffsets?.length) counts.set("transform", (counts.get("transform") || 0) + 1);
      if (profile.colorOffsets?.length) counts.set("color", (counts.get("color") || 0) + 1);
    }
  }
  return counts;
}

function runtimeEffectPfxCurrentCallbackEvidenceCount(pfxItem) {
  let count = 0;
  for (const record of pfxItem?.surfaceRecords || []) {
    for (const slot of record.emitterRuntimeProfile?.semanticSlots || []) {
      if (
        slot.resolverResolutionStatus === "current-table-callback-matched" ||
        slot.resolverCurrentBuildStatus === "matched-current-table-candidate" ||
        slot.resolverCurrentCallbackAddress
      ) {
        count += 1;
      }
    }
    for (const childRecord of record.childEmitterRecords || []) {
      for (const slot of childRecord.runtimeProfile?.semanticSlots || []) {
        if (
          slot.resolverResolutionStatus === "current-table-callback-matched" ||
          slot.resolverCurrentBuildStatus === "matched-current-table-candidate" ||
          slot.resolverCurrentCallbackAddress
        ) {
          count += 1;
        }
      }
    }
  }
  return count;
}

function runtimeEffectPfxProfileEvidenceCount(pfxItem) {
  let count = 0;
  for (const record of pfxItem?.surfaceRecords || []) {
    if (record.parameterProfile?.semanticSlots?.length) count += 1;
    if (record.emitterRuntimeProfile?.semanticSlots?.length) count += 1;
    if ((record.childEmitterRecords || []).some((childRecord) => childRecord.runtimeProfile?.semanticSlots?.length)) count += 1;
    if (runtimeEffectSurfaceRecordHasRuntimeHint(record)) count += 1;
  }
  return count;
}

function runtimeEffectEntryHasRuntimeRouteEvidence(entry) {
  if (entry?.pfxItem?.nativePrimitive) return true;
  const sourceKind = entry?.sourceKind || entry?.hook?.sourceKind || "";
  if (
    [
      "native-effect-hook",
      "native-effect-vcall",
      "native-effect-spawn",
      "native-effect-selector",
      "runtime-projectile-binding",
      "native-projectile-related-impact-hook",
      "cff0-effect-instance",
      "definition-neighborhood-pfx",
    ].includes(sourceKind)
  ) {
    return true;
  }
  if (entry?.hook?.runtimeBinding?.evidence) return true;
  if (entry?.projectile?.runtimeBinding?.evidence || entry?.projectile?.bindingStatus) return true;
  if (entry?.projectileSourceEntry?.projectile?.runtimeBinding?.evidence) return true;
  if (entry?.pfxBindingProfile?.evidence || entry?.pfxBindingProfile?.kind || entry?.pfxBindingProfile?.sourceKind) return true;
  return false;
}

function runtimeEffectPfxRuntimeEvidence(entry) {
  if (entry?.pfxItem?.nativePrimitive) {
    return {
      allowed: true,
      blockReason: "",
      currentCallbackCount: 0,
      profileEvidenceCount: 0,
      routeEvidence: "native-primitive",
    };
  }

  const currentCallbackCount = runtimeEffectPfxCurrentCallbackEvidenceCount(entry?.pfxItem);
  const profileEvidenceCount = runtimeEffectPfxProfileEvidenceCount(entry?.pfxItem);
  const hasRuntimeRoute = runtimeEffectEntryHasRuntimeRouteEvidence(entry);
  const hasPfxRuntimeEvidence = currentCallbackCount > 0 || profileEvidenceCount > 0;
  const allowed = hasRuntimeRoute && hasPfxRuntimeEvidence;
  return {
    allowed,
    blockReason: allowed ? "" : hasRuntimeRoute ? "no-current-pfx-runtime-evidence" : "no-runtime-route",
    currentCallbackCount,
    profileEvidenceCount,
    routeEvidence: hasRuntimeRoute ? "runtime-route" : "",
  };
}

function runtimeEffectPfxEmitterCallbackTargetCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      for (const slot of record.emitterRuntimeProfile?.semanticSlots || []) {
        if (!slot.targetArraySemantic) continue;
        counts.set(slot.targetArraySemantic, (counts.get(slot.targetArraySemantic) || 0) + 1);
      }
    }
  }
  return counts;
}

function runtimeEffectPfxEmitterCallbackInputKindCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      for (const slot of record.emitterRuntimeProfile?.semanticSlots || []) {
        if (!slot.resolverInputKind) continue;
        counts.set(slot.resolverInputKind, (counts.get(slot.resolverInputKind) || 0) + 1);
      }
    }
  }
  return counts;
}

function runtimeEffectPfxEmitterCallbackLayoutEvidenceCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      for (const slot of record.emitterRuntimeProfile?.semanticSlots || []) {
        if (!slot.callbackLayoutEvidence) continue;
        counts.set(slot.callbackLayoutEvidence, (counts.get(slot.callbackLayoutEvidence) || 0) + 1);
      }
    }
  }
  return counts;
}

function runtimeEffectPfxEmitterResolverTableCompatibilityCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      for (const slot of record.emitterRuntimeProfile?.semanticSlots || []) {
        if (!slot.resolverTableCompatibilityStatus) continue;
        counts.set(slot.resolverTableCompatibilityStatus, (counts.get(slot.resolverTableCompatibilityStatus) || 0) + 1);
      }
    }
  }
  return counts;
}

function runtimeEffectPfxEmitterCurrentBuildStatusCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      for (const slot of record.emitterRuntimeProfile?.semanticSlots || []) {
        if (!slot.resolverCurrentBuildStatus) continue;
        counts.set(slot.resolverCurrentBuildStatus, (counts.get(slot.resolverCurrentBuildStatus) || 0) + 1);
      }
    }
  }
  return counts;
}

function runtimeEffectPfxEmitterCurrentSemanticClassCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      for (const slot of record.emitterRuntimeProfile?.semanticSlots || []) {
        if (!slot.resolverCurrentCallbackSemanticClass) continue;
        counts.set(slot.resolverCurrentCallbackSemanticClass, (counts.get(slot.resolverCurrentCallbackSemanticClass) || 0) + 1);
      }
    }
  }
  return counts;
}

function runtimeEffectPfxEmitterCurrentConstantTargetCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      for (const slot of record.emitterRuntimeProfile?.semanticSlots || []) {
        if (!Number.isFinite(slot.resolverCurrentCallbackConstantValue)) continue;
        const target = slot.targetArraySemantic || slot.name || "unknown";
        counts.set(target, (counts.get(target) || 0) + 1);
      }
    }
  }
  return counts;
}

function runtimeEffectPfxEmitterCurrentVectorTargetCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      for (const slot of record.emitterRuntimeProfile?.semanticSlots || []) {
        if (!Array.isArray(slot.resolverCurrentCallbackVectorValue) || !slot.resolverCurrentCallbackVectorValue.length) continue;
        const target = slot.targetArraySemantic || slot.name || "unknown";
        counts.set(target, (counts.get(target) || 0) + 1);
      }
    }
  }
  return counts;
}

function runtimeEffectPfxEmitterPackedLiteralFloatCandidateTargetCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      for (const slot of record.emitterRuntimeProfile?.semanticSlots || []) {
        if (!Array.isArray(slot.resolverPackedLiteralFloatCandidates) || !slot.resolverPackedLiteralFloatCandidates.length) continue;
        const target = slot.targetArraySemantic || slot.name || "unknown";
        counts.set(target, (counts.get(target) || 0) + 1);
      }
    }
  }
  return counts;
}

function runtimeEffectPfxEmitterCallbackResolutionStatusCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      for (const slot of record.emitterRuntimeProfile?.semanticSlots || []) {
        if (!slot.resolverResolutionStatus) continue;
        counts.set(slot.resolverResolutionStatus, (counts.get(slot.resolverResolutionStatus) || 0) + 1);
      }
    }
  }
  return counts;
}

function runtimeEffectPfxChildEmitterCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      for (const childRecord of record.childEmitterRecords || []) {
        counts.set("record", (counts.get("record") || 0) + 1);
        for (const slot of childRecord.runtimeProfile?.semanticSlots || []) {
          counts.set("callback", (counts.get("callback") || 0) + 1);
        }
      }
    }
  }
  return counts;
}

function runtimeEffectPfxChildEmitterModeCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      for (const childRecord of record.childEmitterRecords || []) {
        counts.set(String(childRecord.mode ?? "unknown"), (counts.get(String(childRecord.mode ?? "unknown")) || 0) + 1);
      }
    }
  }
  return counts;
}

function runtimeEffectPfxChildEmitterCallbackResolutionStatusCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      for (const childRecord of record.childEmitterRecords || []) {
        for (const slot of childRecord.runtimeProfile?.semanticSlots || []) {
          if (!slot.resolverResolutionStatus) continue;
          counts.set(slot.resolverResolutionStatus, (counts.get(slot.resolverResolutionStatus) || 0) + 1);
        }
      }
    }
  }
  return counts;
}

function runtimeEffectPfxChildEmitterCurrentSemanticClassCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      for (const childRecord of record.childEmitterRecords || []) {
        for (const slot of childRecord.runtimeProfile?.semanticSlots || []) {
          if (!slot.resolverCurrentCallbackSemanticClass) continue;
          counts.set(slot.resolverCurrentCallbackSemanticClass, (counts.get(slot.resolverCurrentCallbackSemanticClass) || 0) + 1);
        }
      }
    }
  }
  return counts;
}

function runtimeEffectPfxBindingProfileCounts(pfxItems) {
  const counts = new Map();
  const seen = new Set();
  for (const pfxItem of pfxItems || []) {
    for (const profile of pfxItem.hookBindingProfiles || []) {
      const key = `${pfxItem.relativePath}\t${profile.effectToken || profile.token || ""}\t${profile.kind || ""}\t${
        profile.boneToken || ""
      }\t${profile.selectedAttachmentSlot ?? ""}\t${profile.startSeconds ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const kind = profile.kind || "unknown";
      counts.set(kind, (counts.get(kind) || 0) + 1);
    }
  }
  return counts;
}

function runtimeEffectPfxSurfaceRenderFamilyCounts(pfxItems) {
  const counts = new Map();
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      const renderFamily = record?.prelude?.renderFamily || "unknown";
      counts.set(renderFamily, (counts.get(renderFamily) || 0) + 1);
    }
  }
  return counts;
}

function runtimeEffectPfxNativeOptionCounts(pfxItems) {
  const counts = new Map();
  const seen = new Set();
  function add(optionKind, key) {
    const seenKey = `${optionKind}\t${key}`;
    if (seen.has(seenKey)) return;
    seen.add(seenKey);
    counts.set(optionKind, (counts.get(optionKind) || 0) + 1);
  }
  for (const pfxItem of pfxItems || []) {
    for (const profile of pfxItem.hookBindingProfiles || []) {
      const key = `${pfxItem.relativePath}\t${profile.effectToken || profile.token || ""}\t${profile.kind || ""}\t${
        profile.boneToken || ""
      }\t${profile.selectedAttachmentSlot ?? ""}\t${profile.startSeconds ?? ""}`;
      const options = profile.effectOptions || {};
      if (options.followTarget === true) add("follow-target", key);
      if (options.followTarget === false) add("world-binding-candidate", key);
      if (options.visibleOrActive === true) add("visible-or-active", key);
      if (options.visibleOrActive === false) add("hidden-or-inactive", key);
      if (options.hasColor) add("color", key);
      if (options.hasScale) add("scale", key);
      if (options.hasFadeSeconds) add("fade", key);
      if (Array.isArray(options.effectOptionOffsets) && options.effectOptionOffsets.length) add("raw-offset-values", key);
      else if (options.offsetValues && Object.keys(options.offsetValues).length) add("raw-offset-values", key);
    }
  }
  return counts;
}

function runtimeEffectPfxNativeOptionArgKindCounts(pfxItems) {
  const counts = new Map();
  const seen = new Set();
  for (const pfxItem of pfxItems || []) {
    for (const profile of pfxItem.hookBindingProfiles || []) {
      const key = `${pfxItem.relativePath}\t${profile.effectToken || profile.token || ""}\t${profile.kind || ""}\t${
        profile.boneToken || ""
      }\t${profile.selectedAttachmentSlot ?? ""}\t${profile.startSeconds ?? ""}`;
      for (const argKind of profile.effectOptions?.effectOptionArgKinds || []) {
        const seenKey = `${key}\t${argKind}`;
        if (seen.has(seenKey)) continue;
        seen.add(seenKey);
        counts.set(argKind, (counts.get(argKind) || 0) + 1);
      }
    }
  }
  return counts;
}

function runtimeEffectPfxNativeOptionRuntimeHintMatchCounts(pfxItems) {
  const counts = new Map();
  const seen = new Set();
  for (const pfxItem of pfxItems || []) {
    for (const profile of pfxItem.hookBindingProfiles || []) {
      const key = `${pfxItem.relativePath}\t${profile.effectToken || profile.token || ""}\t${profile.kind || ""}\t${
        profile.boneToken || ""
      }\t${profile.selectedAttachmentSlot ?? ""}\t${profile.startSeconds ?? ""}`;
      for (const match of profile.effectOptions?.effectOptionRuntimeHintMatches || []) {
        const seenKey = `${key}\t${match}`;
        if (seen.has(seenKey)) continue;
        seen.add(seenKey);
        const semantic = String(match).match(/^0x[0-9a-f]+:([^:]+):/i)?.[1] || "unknown";
        counts.set(semantic, (counts.get(semantic) || 0) + 1);
      }
    }
  }
  return counts;
}

function runtimeEffectPfxUnknownNativeOptionRuntimeHintMatchCounts(pfxItems) {
  const counts = new Map();
  const seen = new Set();
  for (const pfxItem of pfxItems || []) {
    for (const profile of pfxItem.hookBindingProfiles || []) {
      const key = `${pfxItem.relativePath}\t${profile.effectToken || profile.token || ""}\t${profile.kind || ""}\t${
        profile.boneToken || ""
      }\t${profile.selectedAttachmentSlot ?? ""}\t${profile.startSeconds ?? ""}`;
      for (const match of profile.effectOptions?.effectOptionUnknownRuntimeHintMatches || []) {
        const seenKey = `${key}\t${match}`;
        if (seen.has(seenKey)) continue;
        seen.add(seenKey);
        const semantic = String(match).match(/^0x[0-9a-f]+:([^:]+):/i)?.[1] || "unknown";
        counts.set(semantic, (counts.get(semantic) || 0) + 1);
      }
    }
  }
  return counts;
}

function runtimeEffectUvGapSummary(reasonCounts) {
  const entries = [...(reasonCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([reason, count]) => `${runtimeEffectUvGapReasonLabel(reason)} ${count}`).join("，");
}

function runtimeEffectUvGapInputSummary(inputCounts) {
  const entries = [...(inputCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.slice(0, 4).map(([input, count]) => `${runtimeEffectUvGapInputLabel(input)} ${count}`).join("，");
}

function runtimeEffectUvRuntimeEvidenceSummary(kindCounts) {
  const entries = [...(kindCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([kind, count]) => `${runtimeEffectUvRuntimeEvidenceKindLabel(kind)} ${count}`).join("，");
}

function runtimeEffectPreviewSurfaceRejectSummary(reasonCounts) {
  const entries = [...(reasonCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([reason, count]) => `${runtimeEffectSurfaceRejectReasonLabel(reason)} ${count}`).join("，");
}

function runtimeEffectPfxParameterProfileSummary(profileCounts) {
  const entries = [...(profileCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([evidenceClass, count]) => `${runtimeEffectPfxParameterProfileLabel(evidenceClass)} ${count}`).join("，");
}

function runtimeEffectPfxEmitterRuntimeProfileSummary(profileCounts) {
  const entries = [...(profileCounts || new Map()).entries()].filter(([kind]) => kind !== "profile");
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([kind, count]) => `${runtimeEffectPfxEmitterRuntimeProfileLabel(kind)} ${count}`).join("，");
}

function runtimeEffectPfxEmitterCallbackTargetSummary(targetCounts) {
  const entries = [...(targetCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([kind, count]) => `${runtimeEffectPfxEmitterCallbackTargetLabel(kind)} ${count}`).join("，");
}

function runtimeEffectPfxEmitterCallbackInputKindSummary(inputKindCounts) {
  const entries = [...(inputKindCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([kind, count]) => `${runtimeEffectPfxEmitterCallbackInputKindLabel(kind)} ${count}`).join("，");
}

function runtimeEffectPfxEmitterCallbackLayoutEvidenceSummary(layoutEvidenceCounts) {
  const entries = [...(layoutEvidenceCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([kind, count]) => `${runtimeEffectPfxEmitterCallbackLayoutEvidenceLabel(kind)} ${count}`).join("，");
}

function runtimeEffectPfxEmitterResolverTableCompatibilitySummary(compatibilityCounts) {
  const entries = [...(compatibilityCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([kind, count]) => `${runtimeEffectPfxEmitterResolverTableCompatibilityLabel(kind)} ${count}`).join("，");
}

function runtimeEffectPfxEmitterCurrentBuildStatusSummary(currentBuildCounts) {
  const entries = [...(currentBuildCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([kind, count]) => `${runtimeEffectPfxEmitterCurrentBuildStatusLabel(kind)} ${count}`).join("，");
}

function runtimeEffectPfxEmitterCurrentSemanticClassSummary(semanticClassCounts) {
  const entries = [...(semanticClassCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([kind, count]) => `${runtimeEffectPfxEmitterCurrentSemanticClassLabel(kind)} ${count}`).join("，");
}

function runtimeEffectPfxEmitterCurrentConstantTargetSummary(constantTargetCounts) {
  const entries = [...(constantTargetCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([target, count]) => `${runtimeEffectPfxEmitterCallbackTargetLabel(target)} ${count}`).join("，");
}

function runtimeEffectPfxEmitterCurrentVectorTargetSummary(vectorTargetCounts) {
  const entries = [...(vectorTargetCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([target, count]) => `${runtimeEffectPfxEmitterCallbackTargetLabel(target)} ${count}`).join("，");
}

function runtimeEffectPfxEmitterPackedLiteralFloatCandidateTargetSummary(candidateTargetCounts) {
  const entries = [...(candidateTargetCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([target, count]) => `${runtimeEffectPfxEmitterCallbackTargetLabel(target)} ${count}`).join("，");
}

function runtimeEffectPfxEmitterCallbackResolutionStatusSummary(statusCounts) {
  const entries = [...(statusCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([kind, count]) => `${runtimeEffectPfxEmitterCallbackResolutionLabel(kind)} ${count}`).join("，");
}

function runtimeEffectPfxChildEmitterModeSummary(modeCounts) {
  const entries = [...(modeCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => Number(left[0]) - Number(right[0]) || left[0].localeCompare(right[0]));
  return entries.map(([mode, count]) => `mode ${mode} ${count}`).join("，");
}

function runtimeEffectPfxChildEmitterCallbackResolutionStatusSummary(statusCounts) {
  return runtimeEffectPfxEmitterCallbackResolutionStatusSummary(statusCounts);
}

function runtimeEffectPfxChildEmitterCurrentSemanticClassSummary(semanticClassCounts) {
  return runtimeEffectPfxEmitterCurrentSemanticClassSummary(semanticClassCounts);
}

function runtimeEffectPfxBindingProfileSummary(profileCounts) {
  const entries = [...(profileCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([kind, count]) => `${runtimeEffectPfxBindingProfileLabel(kind)} ${count}`).join("，");
}

function runtimeEffectPfxTimelineWindowCounts(pfxItems) {
  const counts = new Map();
  const seen = new Set();
  function add(kind, key) {
    const seenKey = `${kind}\t${key}`;
    if (seen.has(seenKey)) return;
    seen.add(seenKey);
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  for (const pfxItem of pfxItems || []) {
    for (const profile of pfxItem.hookBindingProfiles || []) {
      const key = `${pfxItem.relativePath}\t${profile.effectToken || profile.token || ""}\t${profile.kind || ""}\t${
        profile.boneToken || ""
      }\t${profile.selectedAttachmentSlot ?? ""}\t${profile.startSeconds ?? ""}`;
      if (profile.surfaceTimelineWindow) add("surface", key);
      if (profile.absoluteTimelineWindow) add("absolute", key);
    }
  }
  return counts;
}

function runtimeEffectPfxTimelineWindowSummary(windowCounts) {
  const surfaceCount = windowCounts?.get("surface") || 0;
  const absoluteCount = windowCounts?.get("absolute") || 0;
  const parts = [];
  if (surfaceCount) parts.push(`相对 ${surfaceCount}`);
  if (absoluteCount) parts.push(`绝对 ${absoluteCount}`);
  return parts.join("，");
}

function runtimeEffectPfxSurfaceRenderFamilySummary(renderFamilyCounts) {
  const entries = [...(renderFamilyCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([renderFamily, count]) => `${runtimeEffectPfxSurfaceRenderFamilyLabel(renderFamily)} ${count}`).join("，");
}

function runtimeEffectPfxNativeOptionSummary(optionCounts) {
  const entries = [...(optionCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([optionKind, count]) => `${runtimeEffectPfxNativeOptionLabel(optionKind)} ${count}`).join("，");
}

function runtimeEffectPfxNativeOptionArgKindSummary(argKindCounts) {
  const entries = [...(argKindCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries
    .map(([argKind, count]) => {
      const [offset, kind] = String(argKind).split(":");
      return `${offset || "未知"} ${nativeOptionArgKindLabel(kind)} ${count}`;
    })
    .join("，");
}

function runtimeEffectPfxNativeOptionRuntimeHintMatchSummary(matchCounts) {
  const entries = [...(matchCounts || new Map()).entries()];
  if (!entries.length) return "";
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.map(([semantic, count]) => `${runtimeEffectPfxNativeOptionRuntimeHintLabel(semantic)} ${count}`).join("，");
}

function runtimeEffectStats(item = activeManifestItem) {
  const hooks = runtimeEffectHooksForItem(item);
  const pfxItems = runtimeEffectAllPfxItemsForItem(item);
  const definitionNeighborhoodRows = runtimeEffectDefinitionNeighborhoodRowsForItem(item);
  const definitionNeighborhoodPfx = uniqueSorted(definitionNeighborhoodRows.flatMap((row) => row.pfxResourcePaths || []));
  const definitionNeighborhoodEntries = runtimeEffectDefinitionNeighborhoodEntriesForItem(item);
  const definitionNeighborhoodTimedEntries = definitionNeighborhoodEntries.filter((entry) => runtimeEffectHasTimelineEvidence(entry));
  const cff0EffectRows = cff0EffectInstanceRowsForItem(item);
  const cff0EffectPfx = uniqueSorted(cff0EffectRows.flatMap((row) => row.resourcePaths || []));
  const cff0ExpandedRows = cff0EffectRows.filter((row) => row.referencedObjectOffsets?.length).length;
  const cff0RuntimeResources = uniqueSorted(cff0EffectRows.flatMap((row) => row.runtimeResources || []));
  const cff0NativeHookRows = cff0EffectRows.filter((row) => row.nativeHookMatchKinds?.length).length;
  const cff0NativeActionRows = cff0EffectRows.filter((row) => row.nativeActionKeys?.length || row.nativeActionNames?.length).length;
  const cff0NativeTimingRows = cff0EffectRows.filter((row) => row.nativeRuntimeStartSeconds?.length).length;
  const cff0ProjectileBindingRows = cff0EffectRows.filter((row) => row.projectileMatchKinds?.length).length;
  const cff0ProjectileActionRows = cff0EffectRows.filter((row) => row.projectileActionKeys?.length).length;
  const cff0ProjectileBoneRows = cff0EffectRows.filter((row) => row.projectileBoneTokens?.length || row.projectileEmitterLabels?.length).length;
  const cff0ProjectileTimingRows = cff0EffectRows.filter((row) => row.projectileRuntimeStartSeconds?.length).length;
  const cff0ResolvedResourceRows = cff0EffectRows.filter((row) => row.resolvedResourcePaths?.length).length;
  const cff0ResolvedActionRows = cff0EffectRows.filter((row) => row.resolvedActionLabels?.length || row.resolvedActionKeys?.length).length;
  const cff0ResolvedBindingRows = cff0EffectRows.filter((row) => row.resolvedBindingTargets?.length).length;
  const cff0EffectChannelFallbackRows = cff0EffectRows.filter((row) => {
    const targets = row.resolvedBindingTargets || [];
    return targets.length && targets.every((target) => target === "effect-channel");
  }).length;
  const cff0ResolvedTimingRows = cff0EffectRows.filter((row) => row.resolvedStartSeconds?.length).length;
  const definitionProjectileItems = runtimeEffectDefinitionProjectilesForItem(item);
  const projectilePfxItems = runtimeEffectProjectilePfxItemsForItem(item);
  if (!hooks.length && !pfxItems.length && !definitionNeighborhoodRows.length && !cff0EffectRows.length) return "";
  const resourceHooks = hooks.filter((hook) => hook.resourcePaths?.length).length;
  const abilityHooks = hooks.filter((hook) => hook.primaryAbilityContext).length;
  const shadergraphRefs = pfxItems.reduce(
    (sum, pfxItem) => sum + (Number(pfxItem.uniqueShadergraphRefCount) || Number(pfxItem.shadergraphRefCount) || 0),
    0,
  );
  const shadergraphItems = runtimeEffectShadergraphItemsForPfx(pfxItems);
  const textureHashes = new Set(shadergraphItems.flatMap((shadergraphItem) => shadergraphItem.textureHashes || []));
  const materialRoles = new Set(shadergraphItems.flatMap((shadergraphItem) => shadergraphItem.roleNames || []));
  const inlineColors = new Set(shadergraphItems.flatMap((shadergraphItem) => (shadergraphItem.inlineColors || []).map((color) => color.hex)));
  const unclassifiedSurfaceCount = shadergraphItems.filter((shadergraphItem) => shadergraphItem.materialStatus !== "classified").length;
  const surfaceRecordCount = pfxItems.reduce((sum, pfxItem) => sum + (pfxItem.surfaceRecords?.length || 0), 0);
  const pfxSurfaceRenderFamilyCounts = runtimeEffectPfxSurfaceRenderFamilyCounts(pfxItems);
  const pfxSurfaceRenderFamilySummary = runtimeEffectPfxSurfaceRenderFamilySummary(pfxSurfaceRenderFamilyCounts);
  const pfxParameterProfileCounts = runtimeEffectPfxParameterProfileCounts(pfxItems);
  const pfxParameterProfileCount = [...pfxParameterProfileCounts.values()].reduce((sum, count) => sum + count, 0);
  const pfxEmitterRuntimeProfileCounts = runtimeEffectPfxEmitterRuntimeProfileCounts(pfxItems);
  const pfxEmitterRuntimeProfileCount = pfxEmitterRuntimeProfileCounts.get("profile") || 0;
  const pfxEmitterRuntimeProfileSummary = runtimeEffectPfxEmitterRuntimeProfileSummary(pfxEmitterRuntimeProfileCounts);
  const pfxEmitterCallbackTargetCounts = runtimeEffectPfxEmitterCallbackTargetCounts(pfxItems);
  const pfxEmitterCallbackTargetSummary = runtimeEffectPfxEmitterCallbackTargetSummary(pfxEmitterCallbackTargetCounts);
  const pfxEmitterCallbackInputKindCounts = runtimeEffectPfxEmitterCallbackInputKindCounts(pfxItems);
  const pfxEmitterCallbackInputKindSummary =
    runtimeEffectPfxEmitterCallbackInputKindSummary(pfxEmitterCallbackInputKindCounts);
  const pfxEmitterCallbackLayoutEvidenceCounts = runtimeEffectPfxEmitterCallbackLayoutEvidenceCounts(pfxItems);
  const pfxEmitterCallbackLayoutEvidenceSummary =
    runtimeEffectPfxEmitterCallbackLayoutEvidenceSummary(pfxEmitterCallbackLayoutEvidenceCounts);
  const pfxEmitterResolverTableCompatibilityCounts = runtimeEffectPfxEmitterResolverTableCompatibilityCounts(pfxItems);
  const pfxEmitterResolverTableCompatibilitySummary =
    runtimeEffectPfxEmitterResolverTableCompatibilitySummary(pfxEmitterResolverTableCompatibilityCounts);
  const pfxEmitterCurrentBuildStatusCounts = runtimeEffectPfxEmitterCurrentBuildStatusCounts(pfxItems);
  const pfxEmitterCurrentBuildStatusSummary =
    runtimeEffectPfxEmitterCurrentBuildStatusSummary(pfxEmitterCurrentBuildStatusCounts);
  const pfxEmitterCurrentSemanticClassCounts = runtimeEffectPfxEmitterCurrentSemanticClassCounts(pfxItems);
  const pfxEmitterCurrentSemanticClassSummary =
    runtimeEffectPfxEmitterCurrentSemanticClassSummary(pfxEmitterCurrentSemanticClassCounts);
  const pfxEmitterCurrentConstantTargetCounts = runtimeEffectPfxEmitterCurrentConstantTargetCounts(pfxItems);
  const pfxEmitterCurrentConstantTargetSummary =
    runtimeEffectPfxEmitterCurrentConstantTargetSummary(pfxEmitterCurrentConstantTargetCounts);
  const pfxEmitterCurrentVectorTargetCounts = runtimeEffectPfxEmitterCurrentVectorTargetCounts(pfxItems);
  const pfxEmitterCurrentVectorTargetSummary =
    runtimeEffectPfxEmitterCurrentVectorTargetSummary(pfxEmitterCurrentVectorTargetCounts);
  const pfxEmitterPackedLiteralFloatCandidateTargetCounts =
    runtimeEffectPfxEmitterPackedLiteralFloatCandidateTargetCounts(pfxItems);
  const pfxEmitterPackedLiteralFloatCandidateTargetSummary =
    runtimeEffectPfxEmitterPackedLiteralFloatCandidateTargetSummary(pfxEmitterPackedLiteralFloatCandidateTargetCounts);
  const pfxEmitterCallbackResolutionStatusCounts = runtimeEffectPfxEmitterCallbackResolutionStatusCounts(pfxItems);
  const pfxEmitterCallbackResolutionStatusSummary =
    runtimeEffectPfxEmitterCallbackResolutionStatusSummary(pfxEmitterCallbackResolutionStatusCounts);
  const pfxChildEmitterCounts = runtimeEffectPfxChildEmitterCounts(pfxItems);
  const pfxChildEmitterRecordCount = pfxChildEmitterCounts.get("record") || 0;
  const pfxChildEmitterCallbackCount = pfxChildEmitterCounts.get("callback") || 0;
  const pfxChildEmitterModeSummary = runtimeEffectPfxChildEmitterModeSummary(runtimeEffectPfxChildEmitterModeCounts(pfxItems));
  const pfxChildEmitterCallbackResolutionStatusSummary = runtimeEffectPfxChildEmitterCallbackResolutionStatusSummary(
    runtimeEffectPfxChildEmitterCallbackResolutionStatusCounts(pfxItems),
  );
  const pfxChildEmitterCurrentSemanticClassSummary = runtimeEffectPfxChildEmitterCurrentSemanticClassSummary(
    runtimeEffectPfxChildEmitterCurrentSemanticClassCounts(pfxItems),
  );
  const pfxBindingProfileCounts = runtimeEffectPfxBindingProfileCounts(pfxItems);
  const pfxBindingProfileCount = [...pfxBindingProfileCounts.values()].reduce((sum, count) => sum + count, 0);
  const pfxTimelineWindowCounts = runtimeEffectPfxTimelineWindowCounts(pfxItems);
  const pfxTimelineWindowSummary = runtimeEffectPfxTimelineWindowSummary(pfxTimelineWindowCounts);
  const pfxNativeOptionCounts = runtimeEffectPfxNativeOptionCounts(pfxItems);
  const pfxNativeOptionSummary = runtimeEffectPfxNativeOptionSummary(pfxNativeOptionCounts);
  const pfxNativeOptionArgKindCounts = runtimeEffectPfxNativeOptionArgKindCounts(pfxItems);
  const pfxNativeOptionArgKindSummary = runtimeEffectPfxNativeOptionArgKindSummary(pfxNativeOptionArgKindCounts);
  const pfxNativeOptionRuntimeHintMatchCounts = runtimeEffectPfxNativeOptionRuntimeHintMatchCounts(pfxItems);
  const pfxNativeOptionRuntimeHintMatchSummary =
    runtimeEffectPfxNativeOptionRuntimeHintMatchSummary(pfxNativeOptionRuntimeHintMatchCounts);
  const pfxUnknownNativeOptionRuntimeHintMatchCounts = runtimeEffectPfxUnknownNativeOptionRuntimeHintMatchCounts(pfxItems);
  const pfxUnknownNativeOptionRuntimeHintMatchSummary =
    runtimeEffectPfxNativeOptionRuntimeHintMatchSummary(pfxUnknownNativeOptionRuntimeHintMatchCounts);
  const uvGapReasonCounts = runtimeEffectUvGapReasonCounts(shadergraphItems);
  const uvGapCount = [...uvGapReasonCounts.values()].reduce((sum, count) => sum + count, 0);
  const uvRuntimeEvidenceCounts = runtimeEffectUvRuntimeEvidenceKindCounts(shadergraphItems);
  const uvRuntimeEvidenceCount = [...uvRuntimeEvidenceCounts.values()].reduce((sum, count) => sum + count, 0);
  const uvRuntimeFallbackCount = runtimeEffectUvRuntimeFallbackCount(shadergraphItems);
  const uvStaticPreviewCount = runtimeEffectUvStaticPreviewCount(shadergraphItems);
  const surfaceRejectReasonCounts = runtimeEffectPreviewSurfaceRejectReasonCounts(shadergraphItems);
  const surfaceRejectCount = [...surfaceRejectReasonCounts.values()].reduce((sum, count) => sum + count, 0);
  const surfaceRejectSummary = runtimeEffectPreviewSurfaceRejectSummary(surfaceRejectReasonCounts);
  const blockedPreview = runtimeEffectBlockedPreviewSurfaceReasonCounts(hooks, item, selectedAnimation());
  const blockedPreviewSurfaceSummary = runtimeEffectPreviewSurfaceRejectSummary(blockedPreview.reasonCounts);
  const projectileRuntimeCoverageCounts = runtimeEffectProjectileRuntimeCoverageCounts(hooks, selectedAnimation(), item);
  const projectileRuntimeCoverageSummary = runtimeEffectProjectileRuntimeCoverageSummary(projectileRuntimeCoverageCounts);
  const details = [];
  if (resourceHooks) details.push(`${resourceHooks} 条资源`);
  if (abilityHooks) details.push(`${abilityHooks} 条技能`);
  if (pfxItems.length) details.push(`${pfxItems.length} 个 pfx`);
  if (shadergraphRefs) details.push(`${shadergraphRefs} 个特效材质面`);
  if (surfaceRecordCount) details.push(`${surfaceRecordCount} 条 PFX Surface 记录`);
  if (pfxSurfaceRenderFamilySummary) details.push(`PFX Surface 类型：${pfxSurfaceRenderFamilySummary}`);
  if (pfxParameterProfileCount) details.push(`${pfxParameterProfileCount} 条 PFX 参数槽`);
  if (pfxEmitterRuntimeProfileCount) {
    details.push(
      `${pfxEmitterRuntimeProfileCount} 条 PFX emitter Runtime${
        pfxEmitterRuntimeProfileSummary ? `（${pfxEmitterRuntimeProfileSummary}）` : ""
      }`,
    );
  }
  if (pfxEmitterCallbackTargetSummary) details.push(`PFX callback 目标：${pfxEmitterCallbackTargetSummary}`);
  if (pfxEmitterCallbackInputKindSummary) details.push(`PFX callback 输入：${pfxEmitterCallbackInputKindSummary}`);
  if (pfxEmitterCallbackLayoutEvidenceSummary) details.push(`PFX callback 布局：${pfxEmitterCallbackLayoutEvidenceSummary}`);
  if (pfxEmitterResolverTableCompatibilitySummary) details.push(`PFX resolver 表：${pfxEmitterResolverTableCompatibilitySummary}`);
  if (pfxEmitterCurrentBuildStatusSummary) details.push(`PFX 当前表：${pfxEmitterCurrentBuildStatusSummary}`);
  if (pfxEmitterCurrentSemanticClassSummary) details.push(`PFX callback 语义：${pfxEmitterCurrentSemanticClassSummary}`);
  if (pfxEmitterCurrentConstantTargetSummary) details.push(`PFX callback 常量：${pfxEmitterCurrentConstantTargetSummary}`);
  if (pfxEmitterCurrentVectorTargetSummary) details.push(`PFX callback 向量：${pfxEmitterCurrentVectorTargetSummary}`);
  if (pfxEmitterPackedLiteralFloatCandidateTargetSummary) {
    details.push(`PFX packed 数值候选：${pfxEmitterPackedLiteralFloatCandidateTargetSummary}`);
  }
  if (pfxEmitterCallbackResolutionStatusSummary) details.push(`PFX callback 解析：${pfxEmitterCallbackResolutionStatusSummary}`);
  if (pfxChildEmitterRecordCount) {
    details.push(
      `${pfxChildEmitterRecordCount} 条 PFX 子层 emitter / ${pfxChildEmitterCallbackCount} 个子层 callback${
        pfxChildEmitterModeSummary ? `（${pfxChildEmitterModeSummary}）` : ""
      }`,
    );
  }
  if (pfxChildEmitterCallbackResolutionStatusSummary) {
    details.push(`PFX 子层 callback 解析：${pfxChildEmitterCallbackResolutionStatusSummary}`);
  }
  if (pfxChildEmitterCurrentSemanticClassSummary) {
    details.push(`PFX 子层 callback 语义：${pfxChildEmitterCurrentSemanticClassSummary}`);
  }
  if (pfxBindingProfileCount) details.push(`${pfxBindingProfileCount} 条 PFX 绑定证据`);
  if (pfxTimelineWindowSummary) details.push(`PFX 显示时窗：${pfxTimelineWindowSummary}`);
  if (pfxNativeOptionSummary) details.push(`PFX native 参数：${pfxNativeOptionSummary}`);
  if (pfxNativeOptionArgKindSummary) details.push(`PFX 参数形态：${pfxNativeOptionArgKindSummary}`);
  if (pfxNativeOptionRuntimeHintMatchSummary) details.push(`PFX 参数同值：${pfxNativeOptionRuntimeHintMatchSummary}`);
  if (pfxUnknownNativeOptionRuntimeHintMatchSummary) details.push(`未知参数同值：${pfxUnknownNativeOptionRuntimeHintMatchSummary}`);
  if (textureHashes.size) details.push(`${textureHashes.size} 个特效贴图`);
  if (materialRoles.size) details.push(`${materialRoles.size} 类材质角色`);
  if (inlineColors.size) details.push(`${inlineColors.size} 个内联颜色`);
  if (unclassifiedSurfaceCount) details.push(`${unclassifiedSurfaceCount} 个待归类 Surface`);
  if (surfaceRejectCount) details.push(`${surfaceRejectCount} 个卡片风险已拦截${surfaceRejectSummary ? `（${surfaceRejectSummary}）` : ""}`);
  if (blockedPreview.blockedPreviewResourceCount) {
    details.push(
      `${blockedPreview.blockedPreviewResourceCount} 个 runtime 资源待定位 / ${blockedPreview.blockedPreviewSurfaceCount} 个 Surface 已拦截${
        blockedPreviewSurfaceSummary ? `（${blockedPreviewSurfaceSummary}）` : ""
      }`,
    );
  }
  if (projectileRuntimeCoverageSummary) details.push(projectileRuntimeCoverageSummary);
  if (uvGapCount) details.push(`${uvGapCount} 个 UV 待还原`);
  if (uvRuntimeEvidenceCount) details.push(`${uvRuntimeEvidenceCount} 个 PFX UV 参数证据`);
  if (uvRuntimeFallbackCount) details.push(`${uvRuntimeFallbackCount} 个 UV 动态预览`);
  if (uvStaticPreviewCount) details.push(`${uvStaticPreviewCount} 个 UV 静态预览`);
  if (definitionNeighborhoodRows.length) {
    details.push(`${definitionNeighborhoodRows.length} 条邻接 PFX 候选`);
  }
  if (definitionNeighborhoodPfx.length) {
    details.push(`${definitionNeighborhoodPfx.length} 个邻接 PFX 资源`);
  }
  if (definitionNeighborhoodEntries.length) details.push(`${definitionNeighborhoodEntries.length} 条邻接 PFX runtime`);
  if (definitionNeighborhoodTimedEntries.length) details.push(`${definitionNeighborhoodTimedEntries.length} 条邻接 PFX native 时机`);
  if (cff0EffectRows.length) details.push(`${cff0EffectRows.length} 条 CFF0 实例`);
  if (cff0EffectPfx.length) details.push(`${cff0EffectPfx.length} 个 CFF0 PFX`);
  if (cff0ExpandedRows) details.push(`${cff0ExpandedRows} 条 CFF0 引用展开`);
  if (cff0RuntimeResources.length) details.push(`${cff0RuntimeResources.length} 个 CFF0 runtime 资源`);
  if (cff0NativeHookRows) details.push(`${cff0NativeHookRows} 条 CFF0 native hook`);
  if (cff0NativeActionRows) details.push(`${cff0NativeActionRows} 条 CFF0 native action`);
  if (cff0NativeTimingRows) details.push(`${cff0NativeTimingRows} 条 CFF0 native 时机`);
  if (cff0ProjectileBindingRows) details.push(`${cff0ProjectileBindingRows} 条 CFF0 projectile binding`);
  if (cff0ProjectileActionRows) details.push(`${cff0ProjectileActionRows} 条 CFF0 projectile action`);
  if (cff0ProjectileBoneRows) details.push(`${cff0ProjectileBoneRows} 条 CFF0 projectile 发射点`);
  if (cff0ProjectileTimingRows) details.push(`${cff0ProjectileTimingRows} 条 CFF0 projectile 时机`);
  if (cff0EffectChannelFallbackRows) details.push(`${cff0EffectChannelFallbackRows} 条 CFF0 根节点弱绑定`);
  if (cff0ResolvedResourceRows || cff0ResolvedActionRows || cff0ResolvedBindingRows || cff0ResolvedTimingRows) {
    details.push(
      `CFF0 resolved 覆盖：资源 ${cff0ResolvedResourceRows} / action ${cff0ResolvedActionRows} / 绑定 ${cff0ResolvedBindingRows} / 时机 ${cff0ResolvedTimingRows}`,
    );
  }
  if (definitionProjectileItems.length) details.push(`${definitionProjectileItems.length} 个定义 projectile`);
  if (projectilePfxItems.length) details.push(`${projectilePfxItems.length} 个索引 projectile PFX（无发射链路）`);
  let sourceText = `${cff0EffectRows.length} 条 CFF0 实例`;
  if (definitionNeighborhoodRows.length) sourceText = `${definitionNeighborhoodRows.length} 条邻接 PFX 候选`;
  if (pfxItems.length) sourceText = `${pfxItems.length} 个索引 PFX 特效`;
  if (hooks.length) sourceText = `${hooks.length} 条运行时特效`;
  return ` | ${sourceText}${details.length ? `（${details.join(" / ")}）` : ""}`;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function uniqueSortedNumbers(values) {
  return [...new Set(values.filter(Number.isFinite))].sort((left, right) => left - right);
}

function runtimeEffectPreviewActivityCounts(item = activeManifestItem, animation = selectedAnimation()) {
  const previewEntries = runtimeEffectPreviewEntries(item);
  const projectileEntries = runtimeEffectDefinitionProjectileEntriesForItem(item);
  let projectilePreviewableCount = 0;
  let projectileActionBlockedCount = 0;
  let projectileBlockedCount = 0;
  let pfxRuntimeEvidenceBlockedCount = 0;
  for (const entry of projectileEntries) {
    const diagnostics = runtimeEffectPreviewCandidateDiagnostics(entry, animation);
    if (diagnostics.shouldPreview) {
      projectilePreviewableCount += 1;
    } else if (diagnostics.animationBlockReason === "action-mismatch") {
      projectileActionBlockedCount += 1;
    } else {
      projectileBlockedCount += 1;
    }
  }
  for (const hook of runtimeEffectHooksForItem(item)) {
    const bindingTarget = runtimeEffectBindingTarget(hook, item);
    if (!bindingTarget) continue;
    for (const pfxItem of runtimeEffectPfxItemsForHooks([hook], item)) {
      const entry = {
        hook,
        pfxItem,
        pfxBindingProfile: runtimeEffectPfxBindingProfileForEntry(pfxItem, hook),
        bindingTarget,
        sourceKind: hook.sourceKind || "native-effect-hook",
        effectToken: hook.effectToken || hook.token || pfxItem.relativePath,
        actionKeys: hook.actionKeys || [],
      };
      const diagnostics = runtimeEffectPreviewCandidateDiagnostics(entry, animation);
      if (diagnostics.previewBlockReason === "no-current-pfx-runtime-evidence" || diagnostics.previewBlockReason === "no-runtime-route") {
        pfxRuntimeEvidenceBlockedCount += 1;
      }
    }
  }
  return {
    previewEntryCount: previewEntries.length,
    projectilePreviewEntryCount: previewEntries.filter((entry) => runtimeEffectIsProjectile(entry) || runtimeEffectIsProjectileImpact(entry)).length,
    projectileCandidateEntryCount: projectileEntries.length,
    projectilePreviewableCount,
    projectileActionBlockedCount,
    projectileBlockedCount,
    pfxRuntimeEvidenceBlockedCount,
  };
}

function runtimeEffectPreviewActivitySummary(counts) {
  if (!counts) return "";
  const details = [];
  if (counts.previewEntryCount) details.push(`当前动作预览 ${counts.previewEntryCount} 条`);
  else if (counts.projectileCandidateEntryCount) details.push("当前动作预览 0 条");
  if (counts.projectilePreviewEntryCount) details.push(`投射物预览 ${counts.projectilePreviewEntryCount} 条`);
  else if (counts.projectilePreviewableCount) details.push(`投射物候选 ${counts.projectilePreviewableCount} 条`);
  if (counts.pfxRuntimeEvidenceBlockedCount) details.push(`PFX runtime 证据不足 ${counts.pfxRuntimeEvidenceBlockedCount} 条`);
  if (counts.projectileActionBlockedCount) details.push(`${counts.projectileActionBlockedCount} 条 projectile 动作不匹配`);
  if (counts.projectileBlockedCount) details.push(`${counts.projectileBlockedCount} 条 projectile 待补证据`);
  return details.join(" / ");
}

function currentRuntimeEffectDiagnostics(item = activeManifestItem) {
  const hooks = runtimeEffectHooksForItem(item);
  const pfxItems = runtimeEffectAllPfxItemsForItem(item);
  const definitionNeighborhoodRows = runtimeEffectDefinitionNeighborhoodRowsForItem(item);
  const definitionNeighborhoodPfx = uniqueSorted(definitionNeighborhoodRows.flatMap((row) => row.pfxResourcePaths || []));
  const definitionNeighborhoodEntries = runtimeEffectDefinitionNeighborhoodEntriesForItem(item);
  const definitionNeighborhoodTimedEntries = definitionNeighborhoodEntries.filter((entry) => runtimeEffectHasTimelineEvidence(entry));
  const cff0EffectRows = cff0EffectInstanceRowsForItem(item);
  const cff0EffectPfx = uniqueSorted(cff0EffectRows.flatMap((row) => row.resourcePaths || []));
  const cff0ExpandedRows = cff0EffectRows.filter((row) => row.referencedObjectOffsets?.length).length;
  const cff0RuntimeResources = uniqueSorted(cff0EffectRows.flatMap((row) => row.runtimeResources || []));
  const cff0NativeHookRows = cff0EffectRows.filter((row) => row.nativeHookMatchKinds?.length).length;
  const cff0NativeActionRows = cff0EffectRows.filter((row) => row.nativeActionKeys?.length || row.nativeActionNames?.length).length;
  const cff0NativeTimingRows = cff0EffectRows.filter((row) => row.nativeRuntimeStartSeconds?.length).length;
  const cff0ProjectileBindingRows = cff0EffectRows.filter((row) => row.projectileMatchKinds?.length).length;
  const cff0ProjectileActionRows = cff0EffectRows.filter((row) => row.projectileActionKeys?.length).length;
  const cff0ProjectileBoneRows = cff0EffectRows.filter((row) => row.projectileBoneTokens?.length || row.projectileEmitterLabels?.length).length;
  const cff0ProjectileTimingRows = cff0EffectRows.filter((row) => row.projectileRuntimeStartSeconds?.length).length;
  const cff0ResolvedResourceRows = cff0EffectRows.filter((row) => row.resolvedResourcePaths?.length).length;
  const cff0ResolvedActionRows = cff0EffectRows.filter((row) => row.resolvedActionLabels?.length || row.resolvedActionKeys?.length).length;
  const cff0ResolvedBindingRows = cff0EffectRows.filter((row) => row.resolvedBindingTargets?.length).length;
  const cff0ResolvedTimingRows = cff0EffectRows.filter((row) => row.resolvedStartSeconds?.length).length;
  const definitionProjectileItems = runtimeEffectDefinitionProjectilesForItem(item);
  const projectilePfxItems = runtimeEffectProjectilePfxItemsForItem(item);
  const shadergraphItems = runtimeEffectShadergraphItemsForPfx(pfxItems);
  const textureHashes = uniqueSorted(shadergraphItems.flatMap((shadergraphItem) => shadergraphItem.textureHashes || []));
  const materialRoles = uniqueSorted(shadergraphItems.flatMap((shadergraphItem) => shadergraphItem.roleNames || []));
  const inlineColors = uniqueSorted(shadergraphItems.flatMap((shadergraphItem) => (shadergraphItem.inlineColors || []).map((color) => color.hex)));
  const unclassifiedSurfaceCount = shadergraphItems.filter((shadergraphItem) => shadergraphItem.materialStatus !== "classified").length;
  const surfaceRecordCount = pfxItems.reduce((sum, pfxItem) => sum + (pfxItem.surfaceRecords?.length || 0), 0);
  const pfxSurfaceRenderFamilyCounts = runtimeEffectPfxSurfaceRenderFamilyCounts(pfxItems);
  const pfxParameterProfileCounts = runtimeEffectPfxParameterProfileCounts(pfxItems);
  const pfxParameterProfileCount = [...pfxParameterProfileCounts.values()].reduce((sum, count) => sum + count, 0);
  const pfxEmitterRuntimeProfileCounts = runtimeEffectPfxEmitterRuntimeProfileCounts(pfxItems);
  const pfxEmitterRuntimeProfileCount = pfxEmitterRuntimeProfileCounts.get("profile") || 0;
  const pfxEmitterCallbackTargetCounts = runtimeEffectPfxEmitterCallbackTargetCounts(pfxItems);
  const pfxEmitterCallbackInputKindCounts = runtimeEffectPfxEmitterCallbackInputKindCounts(pfxItems);
  const pfxEmitterCallbackLayoutEvidenceCounts = runtimeEffectPfxEmitterCallbackLayoutEvidenceCounts(pfxItems);
  const pfxEmitterResolverTableCompatibilityCounts = runtimeEffectPfxEmitterResolverTableCompatibilityCounts(pfxItems);
  const pfxEmitterCurrentBuildStatusCounts = runtimeEffectPfxEmitterCurrentBuildStatusCounts(pfxItems);
  const pfxEmitterCurrentSemanticClassCounts = runtimeEffectPfxEmitterCurrentSemanticClassCounts(pfxItems);
  const pfxEmitterCurrentConstantTargetCounts = runtimeEffectPfxEmitterCurrentConstantTargetCounts(pfxItems);
  const pfxEmitterCurrentVectorTargetCounts = runtimeEffectPfxEmitterCurrentVectorTargetCounts(pfxItems);
  const pfxEmitterPackedLiteralFloatCandidateTargetCounts =
    runtimeEffectPfxEmitterPackedLiteralFloatCandidateTargetCounts(pfxItems);
  const pfxEmitterCallbackResolutionStatusCounts = runtimeEffectPfxEmitterCallbackResolutionStatusCounts(pfxItems);
  const pfxChildEmitterCounts = runtimeEffectPfxChildEmitterCounts(pfxItems);
  const pfxChildEmitterRecordCount = pfxChildEmitterCounts.get("record") || 0;
  const pfxChildEmitterCallbackCount = pfxChildEmitterCounts.get("callback") || 0;
  const pfxChildEmitterModeCounts = runtimeEffectPfxChildEmitterModeCounts(pfxItems);
  const pfxChildEmitterCallbackResolutionStatusCounts = runtimeEffectPfxChildEmitterCallbackResolutionStatusCounts(pfxItems);
  const pfxChildEmitterCurrentSemanticClassCounts = runtimeEffectPfxChildEmitterCurrentSemanticClassCounts(pfxItems);
  const pfxBindingProfileCounts = runtimeEffectPfxBindingProfileCounts(pfxItems);
  const pfxBindingProfileCount = [...pfxBindingProfileCounts.values()].reduce((sum, count) => sum + count, 0);
  const pfxNativeOptionCounts = runtimeEffectPfxNativeOptionCounts(pfxItems);
  const uvGapReasonCounts = runtimeEffectUvGapReasonCounts(shadergraphItems);
  const uvGapInputCounts = runtimeEffectUvGapInputCounts(shadergraphItems);
  const uvGapCount = [...uvGapReasonCounts.values()].reduce((sum, count) => sum + count, 0);
  const uvRuntimeEvidenceCounts = runtimeEffectUvRuntimeEvidenceKindCounts(shadergraphItems);
  const uvRuntimeEvidenceCount = [...uvRuntimeEvidenceCounts.values()].reduce((sum, count) => sum + count, 0);
  const uvRuntimeFallbackCount = runtimeEffectUvRuntimeFallbackCount(shadergraphItems);
  const uvStaticPreviewCount = runtimeEffectUvStaticPreviewCount(shadergraphItems);
  const surfaceRejectReasonCounts = runtimeEffectPreviewSurfaceRejectReasonCounts(shadergraphItems);
  const surfaceRejectCount = [...surfaceRejectReasonCounts.values()].reduce((sum, count) => sum + count, 0);
  const blockedPreview = runtimeEffectBlockedPreviewSurfaceReasonCounts(hooks, item, selectedAnimation());
  const projectileRuntimeCoverageCounts = runtimeEffectProjectileRuntimeCoverageCounts(hooks, selectedAnimation(), item);
  const projectileRuntimeCoverageSummary = runtimeEffectProjectileRuntimeCoverageSummary(projectileRuntimeCoverageCounts);
  const previewActivityCounts = runtimeEffectPreviewActivityCounts(item, selectedAnimation());
  const currentActionPreviewSummary = runtimeEffectPreviewActivitySummary(previewActivityCounts);
  return {
    hooks,
    pfxItems,
    definitionNeighborhoodRows,
    definitionNeighborhoodPfx,
    definitionNeighborhoodEntries,
    definitionNeighborhoodTimedEntries,
    cff0EffectRows,
    cff0EffectPfx,
    cff0ExpandedRows,
    cff0RuntimeResources,
    cff0NativeHookRows,
    cff0NativeActionRows,
    cff0NativeTimingRows,
    cff0ProjectileBindingRows,
    cff0ProjectileActionRows,
    cff0ProjectileBoneRows,
    cff0ProjectileTimingRows,
    cff0ResolvedResourceRows,
    cff0ResolvedActionRows,
    cff0ResolvedBindingRows,
    cff0ResolvedTimingRows,
    definitionProjectileItems,
    projectilePfxItems,
    shadergraphItems,
    textureHashes,
    materialRoles,
    inlineColors,
    unclassifiedSurfaceCount,
    surfaceRecordCount,
    pfxSurfaceRenderFamilySummary: runtimeEffectPfxSurfaceRenderFamilySummary(pfxSurfaceRenderFamilyCounts),
    pfxParameterProfileCount,
    pfxParameterProfileSummary: runtimeEffectPfxParameterProfileSummary(pfxParameterProfileCounts),
    pfxEmitterRuntimeProfileCount,
    pfxEmitterRuntimeProfileSummary: runtimeEffectPfxEmitterRuntimeProfileSummary(pfxEmitterRuntimeProfileCounts),
    pfxEmitterCallbackTargetSummary: runtimeEffectPfxEmitterCallbackTargetSummary(pfxEmitterCallbackTargetCounts),
    pfxEmitterCallbackInputKindSummary:
      runtimeEffectPfxEmitterCallbackInputKindSummary(pfxEmitterCallbackInputKindCounts),
    pfxEmitterCallbackLayoutEvidenceSummary:
      runtimeEffectPfxEmitterCallbackLayoutEvidenceSummary(pfxEmitterCallbackLayoutEvidenceCounts),
    pfxEmitterResolverTableCompatibilitySummary:
      runtimeEffectPfxEmitterResolverTableCompatibilitySummary(pfxEmitterResolverTableCompatibilityCounts),
    pfxEmitterCurrentBuildStatusSummary:
      runtimeEffectPfxEmitterCurrentBuildStatusSummary(pfxEmitterCurrentBuildStatusCounts),
    pfxEmitterCurrentSemanticClassSummary:
      runtimeEffectPfxEmitterCurrentSemanticClassSummary(pfxEmitterCurrentSemanticClassCounts),
    pfxEmitterCurrentConstantTargetSummary:
      runtimeEffectPfxEmitterCurrentConstantTargetSummary(pfxEmitterCurrentConstantTargetCounts),
    pfxEmitterCurrentVectorTargetSummary:
      runtimeEffectPfxEmitterCurrentVectorTargetSummary(pfxEmitterCurrentVectorTargetCounts),
    pfxEmitterPackedLiteralFloatCandidateTargetSummary:
      runtimeEffectPfxEmitterPackedLiteralFloatCandidateTargetSummary(pfxEmitterPackedLiteralFloatCandidateTargetCounts),
    pfxEmitterCallbackResolutionStatusSummary:
      runtimeEffectPfxEmitterCallbackResolutionStatusSummary(pfxEmitterCallbackResolutionStatusCounts),
    pfxChildEmitterRecordCount,
    pfxChildEmitterCallbackCount,
    pfxChildEmitterModeSummary: runtimeEffectPfxChildEmitterModeSummary(pfxChildEmitterModeCounts),
    pfxChildEmitterCallbackResolutionStatusSummary: runtimeEffectPfxChildEmitterCallbackResolutionStatusSummary(
      pfxChildEmitterCallbackResolutionStatusCounts,
    ),
    pfxChildEmitterCurrentSemanticClassSummary:
      runtimeEffectPfxChildEmitterCurrentSemanticClassSummary(pfxChildEmitterCurrentSemanticClassCounts),
    pfxBindingProfileCount,
    pfxBindingProfileSummary: runtimeEffectPfxBindingProfileSummary(pfxBindingProfileCounts),
    pfxNativeOptionSummary: runtimeEffectPfxNativeOptionSummary(pfxNativeOptionCounts),
    uvGapCount,
    uvGapReasonSummary: runtimeEffectUvGapSummary(uvGapReasonCounts),
    uvGapInputSummary: runtimeEffectUvGapInputSummary(uvGapInputCounts),
    uvRuntimeEvidenceCount,
    uvRuntimeEvidenceSummary: runtimeEffectUvRuntimeEvidenceSummary(uvRuntimeEvidenceCounts),
    uvRuntimeFallbackCount,
    uvStaticPreviewCount,
    surfaceRejectCount,
    surfaceRejectSummary: runtimeEffectPreviewSurfaceRejectSummary(surfaceRejectReasonCounts),
    blockedPreviewResourceCount: blockedPreview.blockedPreviewResourceCount,
    blockedPreviewSurfaceCount: blockedPreview.blockedPreviewSurfaceCount,
    blockedPreviewSurfaceSummary: runtimeEffectPreviewSurfaceRejectSummary(blockedPreview.reasonCounts),
    projectileRuntimeCoverageCounts,
    projectileRuntimeCoverageSummary,
    previewActivityCounts,
    currentActionPreviewSummary,
  };
}

function effectResourceTitle(pfxItem) {
  return pfxItem.relativePath.split("/").slice(-2).join("/");
}

function materialStatusSummaryForPfx(pfxItem) {
  const pfxShadergraphs = runtimeEffectShadergraphItemsForPfx([pfxItem]);
  const pfxUnclassified = pfxShadergraphs.filter((shadergraphItem) => shadergraphItem.materialStatus !== "classified").length;
  const pfxSurfaceRenderFamilyCounts = runtimeEffectPfxSurfaceRenderFamilyCounts([pfxItem]);
  const pfxSurfaceRenderFamilySummary = runtimeEffectPfxSurfaceRenderFamilySummary(pfxSurfaceRenderFamilyCounts);
  const pfxParameterProfileCounts = runtimeEffectPfxParameterProfileCounts([pfxItem]);
  const pfxParameterProfileCount = [...pfxParameterProfileCounts.values()].reduce((sum, count) => sum + count, 0);
  const pfxBindingProfileCounts = runtimeEffectPfxBindingProfileCounts([pfxItem]);
  const pfxBindingProfileCount = [...pfxBindingProfileCounts.values()].reduce((sum, count) => sum + count, 0);
  const pfxNativeOptionCounts = runtimeEffectPfxNativeOptionCounts([pfxItem]);
  const pfxNativeOptionSummary = runtimeEffectPfxNativeOptionSummary(pfxNativeOptionCounts);
  const uvGapReasonCounts = runtimeEffectUvGapReasonCounts(pfxShadergraphs);
  const uvGapCount = [...uvGapReasonCounts.values()].reduce((sum, count) => sum + count, 0);
  const uvRuntimeFallbackCount = runtimeEffectUvRuntimeFallbackCount(pfxShadergraphs);
  const uvStaticPreviewCount = runtimeEffectUvStaticPreviewCount(pfxShadergraphs);
  const uvRuntimeBlocked = pfxShadergraphs.filter((shadergraphItem) => !runtimeEffectShadergraphHasResolvedUvRuntime(shadergraphItem)).length;
  const surfaceRejectReasonCounts = runtimeEffectPreviewSurfaceRejectReasonCounts(pfxShadergraphs);
  const surfaceRejectCount = [...surfaceRejectReasonCounts.values()].reduce((sum, count) => sum + count, 0);
  const surfaceRejectSummary = runtimeEffectPreviewSurfaceRejectSummary(surfaceRejectReasonCounts);
  const details = [];
  if (pfxUnclassified) {
    const pfxTinted = pfxShadergraphs.filter((shadergraphItem) => shadergraphItem.materialStatus === "tinted-texture").length;
    details.push(pfxTinted ? `${pfxUnclassified} 个待归类（${pfxTinted} 个带颜色）` : `${pfxUnclassified} 个待归类`);
  }
  if (pfxParameterProfileCount) {
    details.push(`${pfxParameterProfileCount} 条 PFX 参数槽（${runtimeEffectPfxParameterProfileSummary(pfxParameterProfileCounts)}）`);
  }
  if (pfxSurfaceRenderFamilySummary) details.push(`PFX Surface 类型：${pfxSurfaceRenderFamilySummary}`);
  if (pfxBindingProfileCount) {
    details.push(`${pfxBindingProfileCount} 条 PFX 绑定证据（${runtimeEffectPfxBindingProfileSummary(pfxBindingProfileCounts)}）`);
  }
  if (pfxNativeOptionSummary) details.push(`PFX native 参数：${pfxNativeOptionSummary}`);
  if (surfaceRejectCount) details.push(`${surfaceRejectCount} 个卡片风险已拦截${surfaceRejectSummary ? `（${surfaceRejectSummary}）` : ""}`);
  if (uvGapCount) details.push(`${uvGapCount} 个 UV 待还原`);
  if (uvRuntimeFallbackCount) details.push(`${uvRuntimeFallbackCount} 个 UV 动态预览`);
  if (uvStaticPreviewCount) details.push(`${uvStaticPreviewCount} 个 UV 静态预览`);
  if (uvRuntimeBlocked) details.push(`${uvRuntimeBlocked} 个 UV runtime 未解码`);
  if (!details.length) return "";
  return details.join("，");
}

function runtimeEffectLocatorSlot(hook, item = activeManifestItem) {
  const boneToken = hook?.runtimeBinding?.boneToken || hook?.boneToken || "";
  if (!boneToken || /^Bone_/.test(boneToken)) return null;
  const candidates = [];
  runtimeBindSlotsForItem(item).forEach((slot, slotIndex) => {
    if (runtimeNativeProjectileEmitterSlotScore({ emitterLabel: boneToken }, slot) >= RUNTIME_NATIVE_PROJECTILE_SEMANTIC_SLOT_SCORE) {
      candidates.push({
        slot,
        slotIndex,
        score: runtimeNativeProjectileEmitterSlotScore({ emitterLabel: boneToken }, slot),
      });
    }
  });
  if (!candidates.length) return null;
  candidates.sort((left, right) => right.score - left.score || left.slotIndex - right.slotIndex);
  return candidates[0].slot;
}

function runtimeEffectBoneIndex(hook, item = activeManifestItem) {
  if (!hook?.boneToken) return null;
  const slot = runtimeBindSlotsForItem(item).find(
    (slot) => (slot.slotName === hook.boneToken || slot.bindToken === hook.boneToken) && Number.isInteger(Number(slot.resolvedBoneIndex)),
  );
  if (slot) return Number(slot.resolvedBoneIndex);
  const locatorSlot = runtimeEffectLocatorSlot(hook, item);
  return Number.isInteger(Number(locatorSlot?.resolvedBoneIndex)) ? Number(locatorSlot.resolvedBoneIndex) : null;
}

function normalizedRuntimeBoneName(value) {
  return String(value || "").trim().toLowerCase();
}

function runtimeEffectBoneByName(bones, boneToken) {
  const exact = (bones || []).find((bone) => bone?.name === boneToken);
  if (exact) return exact;
  const normalized = normalizedRuntimeBoneName(boneToken);
  if (!normalized) return null;
  const normalizedMatch = (bones || []).find((bone) => normalizedRuntimeBoneName(bone?.name) === normalized);
  if (normalizedMatch) return normalizedMatch;
  for (const alias of runtimeEffectBoneAliasNames(boneToken)) {
    const aliasMatch = (bones || []).find((bone) => normalizedRuntimeBoneName(bone?.name) === normalizedRuntimeBoneName(alias));
    if (aliasMatch) return aliasMatch;
  }
  return null;
}

function runtimeEffectBoneAliasNames(boneToken) {
  const normalized = normalizedRuntimeBoneName(boneToken);
  if (!normalized) return [];
  if (["bone_centermass", "spinec", "spinec_bnd"].includes(normalized)) return ["3039CA80"];
  return [];
}

function runtimeEffectSelectedAttachmentBindingTarget(hook, item = activeManifestItem) {
  const selectedAttachmentSlot = Number(hook?.runtimeBinding?.selectedAttachmentSlot);
  if (!Number.isInteger(selectedAttachmentSlot) || selectedAttachmentSlot <= 0) return null;
  const attachmentSlots = runtimeAttachmentBindSlotsForItem(item);
  const candidates = [
    { slot: attachmentSlots[selectedAttachmentSlot - 1], slotIndex: selectedAttachmentSlot - 1 },
    { slot: attachmentSlots[selectedAttachmentSlot], slotIndex: selectedAttachmentSlot },
  ];
  const seenSlots = new Set();

  for (const { slot, slotIndex } of candidates) {
    if (!slot) continue;
    const slotKey = `${slotIndex}:${slot.slotName || ""}:${slot.bindToken || ""}`;
    if (seenSlots.has(slotKey)) continue;
    seenSlots.add(slotKey);
    if (slot.bindingKind && slot.bindingKind !== "skeleton-bone") continue;
    if (slot.hashResolved === false) continue;
    const boneIndex = Number(slot.resolvedBoneIndex);
    if (!Number.isInteger(boneIndex) || boneIndex < 0) continue;
    return {
      kind: "bone",
      boneIndex,
      boneToken: slot.slotName || slot.bindToken || `attachment-slot-${selectedAttachmentSlot}`,
      selectedAttachmentSlot,
      selectedAttachmentSlotIndex: slotIndex,
    };
  }

  return null;
}

function runtimeEffectBindingTarget(hook, item = activeManifestItem) {
  const runtimeKind = hook?.runtimeBinding?.kind;
  const boneToken = hook?.runtimeBinding?.boneToken || hook?.boneToken || "";
  if (runtimeKind === "bone") {
    const boneIndex = runtimeEffectBoneIndex(hook, item);
    return Number.isInteger(boneIndex)
      ? { kind: "bone", boneIndex, boneToken }
      : boneToken
        ? { kind: "bone-name", boneIndex: null, boneToken }
        : null;
  }
  if (runtimeKind === "selected-attachment") {
    return runtimeEffectSelectedAttachmentBindingTarget(hook, item);
  }
  if (runtimeKind === "effect-channel" && runtimeEffectNativePrimitivePreviewAllowed(hook)) {
    return { kind: "model-root", boneIndex: null, boneToken: "" };
  }
  if (runtimeKind === "effect-channel") {
    return { kind: "model-root", boneIndex: null, boneToken: "", effectChannelFallback: true };
  }
  if (runtimeKind === "model-root-offset") {
    const localPosition = Array.isArray(hook?.runtimeBinding?.localPosition)
      ? new THREE.Vector3(...hook.runtimeBinding.localPosition)
      : null;
    return { kind: "model-root-offset", boneIndex: null, boneToken: "", localPosition };
  }

  const boneIndex = runtimeEffectBoneIndex(hook, item);
  if (Number.isInteger(boneIndex)) return { kind: "bone", boneIndex, boneToken };
  if (boneToken) return { kind: "bone-name", boneIndex: null, boneToken };
  return null;
}

function runtimeEffectSurfaceRecordOrder(pfxItem) {
  const order = new Map();
  for (const [index, record] of (pfxItem?.surfaceRecords || []).entries()) {
    if (!record?.relativePath || order.has(record.relativePath)) continue;
    order.set(record.relativePath, index);
  }
  return order;
}

function runtimeEffectPreviewTextureItems(shadergraphItems, pfxItem, entry = {}) {
  const rows = [];
  const seen = new Set();
  const surfaceOrder = runtimeEffectSurfaceRecordOrder(pfxItem);
  for (const item of shadergraphItems || []) {
    if (!runtimeEffectPreviewTextureUsableForLayer(item, pfxItem, entry) || seen.has(item.previewTexture)) continue;
    seen.add(item.previewTexture);
    const score = (item.inlineColors?.length ? 0 : 2) + (item.materialStatus === "tinted-texture" ? -1 : 0);
    const order = surfaceOrder.get(item.relativePath) ?? Number.MAX_SAFE_INTEGER;
    rows.push({ texture: item.previewTexture, score, order });
  }
  return rows.sort((left, right) => left.order - right.order || left.score - right.score || left.texture.localeCompare(right.texture)).map((row) => row.texture);
}

function runtimeEffectPreviewTextureNeedsAlphaMap(item) {
  return Boolean(
    item?.previewTextureRequiresAlphaMap === true ||
      (item?.previewTextureMode === "embedded-webp" && (item?.roleNames || []).includes("alphaMask")),
  );
}

function runtimeEffectPreviewTextureNeedsRuntimeAlphaMap(item, pfxItem = null, entry = {}) {
  if (!item?.previewTexture) return false;
  const roleNames = item?.roleNames || [];
  const hasRuntimeFallbackMaterialEvidence =
    runtimeEffectShadergraphHasRuntimeBoundBillboardFallbackMaterialEvidence(item, pfxItem, entry) ||
    runtimeEffectShadergraphHasRuntimeBoundAreaFallbackMaterialEvidence(item, pfxItem, entry);
  if (roleNames.includes("alphaMask") && item?.previewTextureRejectReason === "opaque-preview-texture") {
    return hasRuntimeFallbackMaterialEvidence;
  }
  if (item?.previewTextureMode !== "embedded-webp") return false;
  if (!roleNames.includes("alphaBlend")) return false;
  if (roleNames.includes("alphaMask")) return false;
  if (item?.previewBlendMode && item.previewBlendMode !== "alpha") return false;
  return hasRuntimeFallbackMaterialEvidence;
}

function runtimeEffectPreviewTextureUsableForSprite(item) {
  if (!item?.previewTexture) return false;
  if (item.previewTextureMode === "embedded-webp") return runtimeEffectPreviewTextureNeedsAlphaMap(item);
  return item.previewTextureSpriteUsable !== false;
}

function runtimeEffectShadergraphSurfaceCardRiskBlocked(item) {
  return item?.previewSurfaceRenderable === false && /base-card-risk/i.test(String(item?.previewSurfaceRejectReason || ""));
}

function runtimeEffectShadergraphSurfacePreviewAllowed(item, pfxItem = null, entry = {}) {
  if (!runtimeEffectShadergraphSurfaceCardRiskBlocked(item)) return item?.previewSurfaceRenderable !== false;
  return runtimeEffectPreviewTextureUsableForSprite(item);
}

function runtimeEffectPreviewTextureUsableForLayer(item, pfxItem = null, entry = {}) {
  if (runtimeEffectPreviewTextureUsableForSprite(item)) return true;
  return (
    runtimeEffectShadergraphHasRuntimeBoundAreaFallbackMaterialEvidence(item, pfxItem, entry) ||
    runtimeEffectShadergraphHasRuntimeBoundBillboardFallbackMaterialEvidence(item, pfxItem, entry)
  );
}

function runtimeEffectEntryHasStrongSpatialEvidence(entry) {
  if (runtimeEffectBindingTargetIsEffectChannelFallback(entry)) return false;
  const target = entry?.bindingTarget || {};
  const kind = target.kind || "";
  return ["bone", "bone-name", "model-root-offset"].includes(kind);
}

function runtimeEffectEntryHasProjectileBillboardSpatialEvidence(entry) {
  if (runtimeEffectPreviewRole(entry) !== "projectile") return false;
  if (!entry?.projectile) return false;
  if (runtimeEffectBindingTargetIsEffectChannelFallback(entry)) return false;
  const target = entry?.bindingTarget || {};
  if (target.kind !== "model-root" && target.kind !== "model-root-offset") return false;
  if (!runtimeEffectInferredActionKeys(entry).size) return false;
  return runtimeEffectHasTimelineEvidence(entry);
}

function runtimeEffectEntryHasBillboardSpatialEvidence(entry) {
  return (
    runtimeEffectEntryHasStrongSpatialEvidence(entry) ||
    runtimeEffectChannelFallbackPreviewAllowed(entry) ||
    runtimeEffectEntryHasProjectileBillboardSpatialEvidence(entry)
  );
}

function runtimeEffectShadergraphHasRuntimeBoundBillboardEvidence(item, pfxItem, entry = {}) {
  if (runtimeEffectShadergraphRenderFamily(pfxItem, item) !== "billboard") return false;
  if (!runtimeEffectEntryHasBillboardSpatialEvidence(entry)) return false;
  if (item?.materialStatus !== "classified") return false;
  return (item?.roleNames || []).includes("alphaBlend");
}

function runtimeEffectShadergraphHasRenderableTextureRoleEvidence(item) {
  const roleNames = item?.roleNames || [];
  if (roleNames.includes("lookup") && !roleNames.some((role) => RUNTIME_EFFECT_RENDERABLE_TEXTURE_ROLES.has(role))) return false;
  return true;
}

function runtimeEffectShadergraphHasRuntimeBoundBillboardFallbackMaterialEvidence(item, pfxItem, entry = {}) {
  if (!runtimeEffectShadergraphHasRuntimeBoundBillboardEvidence(item, pfxItem, entry)) return false;
  if (!runtimeEffectHasTimelineEvidence(entry)) return false;
  if (runtimeEffectPreviewTextureUsableForSprite(item)) return false;
  if (item?.previewSurfaceRenderable !== true) return false;
  if (!item?.previewTexture) return false;
  if (!(item?.textureAssets || []).length) return false;
  if (!runtimeEffectShadergraphHasRenderableTextureRoleEvidence(item)) return false;
  const hasColorEvidence = (item?.inlineColors || []).length || (item?.roleNames || []).includes("emissive");
  return Boolean(hasColorEvidence);
}

function runtimeEffectAreaSurfaceHasShapeEvidence(item, pfxItem, entry = {}) {
  const surfaceRecord = runtimeEffectSurfaceRecordForShadergraph(pfxItem, item);
  if (runtimeEffectSurfaceShapeSizeScalar(surfaceRecord) !== null) return true;
  if (runtimeEffectNativeScaleScalar(entry) !== null) return true;
  if (item?.previewSurfaceRenderable === true) return true;
  return Boolean(item?.previewUvAnimation && runtimeEffectShadergraphHasResolvedUvRuntime(item));
}

function runtimeEffectAreaSurfaceShapeGapReason(item, pfxItem, entry = {}) {
  if (runtimeEffectShadergraphRenderFamily(pfxItem, item) !== "area") return "";
  if (!runtimeEffectShadergraphSurfaceCardRiskBlocked(item)) return "";
  if (runtimeEffectAreaSurfaceHasShapeEvidence(item, pfxItem, entry)) return "";
  return "missing-area-shape-evidence";
}

function runtimeEffectShadergraphHasRuntimeBoundAreaEvidence(item, pfxItem, entry = {}) {
  if (runtimeEffectShadergraphRenderFamily(pfxItem, item) !== "area") return false;
  if (!runtimeEffectEntryHasStrongSpatialEvidence(entry) && !runtimeEffectChannelFallbackAreaPreviewAllowed(entry)) return false;
  if (item?.materialStatus !== "classified") return false;
  const roleNames = item?.roleNames || [];
  if (!roleNames.includes("alphaBlend") && !roleNames.includes("alphaMask")) return false;
  const surfaceRecord = runtimeEffectSurfaceRecordForShadergraph(pfxItem, item);
  if (!runtimeEffectSurfaceRecordHasRuntimeHint(surfaceRecord)) return false;
  if (runtimeEffectShadergraphSurfaceCardRiskBlocked(item) && !runtimeEffectAreaSurfaceHasShapeEvidence(item, pfxItem, entry)) return false;
  if (!runtimeEffectInferredActionKeys(entry).size) return false;
  if (!runtimeEffectHasTimelineEvidence(entry)) return false;
  return true;
}

function runtimeEffectChannelFallbackAreaSurfaceEvidence(entry) {
  const pfxItem = entry?.pfxItem;
  if (!pfxItem) return false;
  for (const record of pfxItem.surfaceRecords || []) {
    const shadergraphItem = runtimeEffectShadergraphByPath.get(record.relativePath);
    if (runtimeEffectShadergraphRenderFamily(pfxItem, shadergraphItem) !== "area") continue;
    if (!runtimeEffectSurfaceRecordHasRuntimeHint(record)) continue;
    if (shadergraphItem?.materialStatus !== "classified") continue;
    if (!shadergraphItem?.previewTexture) continue;
    if (!runtimeEffectShadergraphHasRenderableTextureRoleEvidence(shadergraphItem)) continue;
    if (!runtimeEffectAreaSurfaceHasShapeEvidence(shadergraphItem, pfxItem, entry)) continue;
    if (!runtimeEffectShadergraphHasResolvedUvRuntime(shadergraphItem)) continue;
    const roleNames = shadergraphItem.roleNames || [];
    if (!roleNames.includes("alphaBlend") && !roleNames.includes("alphaMask")) continue;
    return true;
  }
  return false;
}

function runtimeEffectChannelFallbackAreaPreviewAllowed(entry) {
  if (!runtimeEffectChannelFallbackCaptureReady()) return false;
  if (!runtimeEffectBindingTargetIsEffectChannelFallback(entry)) return false;
  if (runtimeEffectPreviewRole(entry) === "projectile") return false;
  if (!runtimeEffectInferredActionKeys(entry).size) return false;
  if (!runtimeEffectHasTimelineEvidence(entry)) return false;
  return runtimeEffectChannelFallbackAreaSurfaceEvidence(entry);
}

function runtimeEffectShadergraphHasRuntimeBoundAreaFallbackMaterialEvidence(item, pfxItem, entry = {}) {
  if (!runtimeEffectShadergraphHasRuntimeBoundAreaEvidence(item, pfxItem, entry)) return false;
  if (runtimeEffectShadergraphSurfaceCardRiskBlocked(item)) return false;
  if (runtimeEffectPreviewTextureUsableForSprite(item)) return false;
  if (!item?.previewTexture) return false;
  if (!(item?.textureAssets || []).length) return false;
  if (!runtimeEffectShadergraphHasRenderableTextureRoleEvidence(item)) return false;
  const hasColorEvidence = (item?.inlineColors || []).length || (item?.roleNames || []).includes("emissive");
  return Boolean(hasColorEvidence);
}

function runtimeEffectShadergraphHasRuntimeBoundBeamEvidence(item, pfxItem, entry = {}) {
  if (runtimeEffectShadergraphRenderFamily(pfxItem, item) !== "beam") return false;
  if (runtimeEffectPreviewRole(entry) !== "projectile") return false;
  if (!runtimeEffectHasRequiredSpatialEvidence(entry)) return false;
  if (!runtimeEffectInferredActionKeys(entry).size) return false;
  if (!runtimeEffectHasTimelineEvidence(entry)) return false;
  if (item?.materialStatus !== "classified") return false;
  if (!runtimeEffectShadergraphHasRenderableTextureRoleEvidence(item)) return false;
  const roleNames = item?.roleNames || [];
  if (!roleNames.includes("alphaBlend") && !roleNames.includes("alphaMask")) return false;
  const surfaceRecord = runtimeEffectSurfaceRecordForShadergraph(pfxItem, item);
  return runtimeEffectSurfaceRecordHasRuntimeHint(surfaceRecord);
}

function runtimeEffectShadergraphLooksLikeEffectLayer(item, pfxItem = null, entry = {}) {
  return (
    item?.previewBlendMode === "additive" ||
    item?.materialStatus === "tinted-texture" ||
    (item?.roleNames || []).includes("emissive") ||
    runtimeEffectShadergraphHasRuntimeBoundBeamEvidence(item, pfxItem, entry) ||
    runtimeEffectShadergraphHasRuntimeBoundBillboardEvidence(item, pfxItem, entry) ||
    runtimeEffectShadergraphHasRuntimeBoundAreaEvidence(item, pfxItem, entry)
  );
}

function runtimeEffectShadergraphHasRuntimeUvEvidence(item) {
  const evidenceKind = item?.previewUvRuntimeEvidence?.kind || "";
  return evidenceKind === "pfx-surface-vertex-color-parameters" || evidenceKind === "pfx-surface-uv-parameters";
}

function runtimeEffectShadergraphHasResolvedUvRuntime(item) {
  if (item?.previewUvAnimationGapReason) return runtimeEffectShadergraphHasRuntimeUvEvidence(item);
  return true;
}

function runtimeEffectShadergraphHasRenderableSurfaceEvidence(item, pfxItem = null, entry = {}) {
  return (
    runtimeEffectShadergraphLooksLikeEffectLayer(item, pfxItem, entry) &&
    runtimeEffectShadergraphHasResolvedUvRuntime(item) &&
    (runtimeEffectPreviewTextureUsableForSprite(item) ||
      runtimeEffectShadergraphHasRuntimeBoundAreaFallbackMaterialEvidence(item, pfxItem, entry) ||
      runtimeEffectShadergraphHasRuntimeBoundBillboardFallbackMaterialEvidence(item, pfxItem, entry)) &&
    runtimeEffectShadergraphSurfacePreviewAllowed(item, pfxItem, entry)
  );
}

function runtimeEffectSurfaceRecordScore(record) {
  let score = 0;
  if (runtimeEffectSurfaceShapeSizeScalar(record) !== null) score += 1000;
  if (runtimeEffectSurfaceRuntimeHint(record, "durationSeconds") !== null) score += 100;
  if (runtimeEffectSurfaceRuntimeHint(record, "delaySeconds") !== null) score += 10;
  if (runtimeEffectSurfaceRuntimeHint(record, "rotationDegrees") !== null) score += 5;
  if ((record?.parameterProfile?.semanticSlots || []).length) score += 1;
  if ((record?.emitterRuntimeProfile?.semanticSlots || []).length) score += 1;
  return score;
}

function runtimeEffectSurfaceRecordForShadergraph(pfxItem, shadergraphItem) {
  const relativePath = shadergraphItem?.relativePath;
  if (!relativePath) return null;
  let bestRecord = null;
  let bestScore = -1;
  for (const record of pfxItem?.surfaceRecords || []) {
    if (record.relativePath !== relativePath) continue;
    const score = runtimeEffectSurfaceRecordScore(record);
    if (score <= bestScore) continue;
    bestRecord = record;
    bestScore = score;
  }
  return bestRecord;
}

function runtimeEffectShadergraphRenderFamily(pfxItem, shadergraphItem) {
  const surfaceFamily = runtimeEffectSurfaceRecordForShadergraph(pfxItem, shadergraphItem)?.prelude?.renderFamily;
  if (surfaceFamily) return surfaceFamily;
  for (const family of shadergraphItem?.pfxRenderFamilies || []) {
    if (["beam", "area", "billboard"].includes(family)) return family;
  }
  return "billboard";
}

function runtimeEffectBindingTargetIsEffectChannelFallback(entry) {
  const target = entry?.bindingTarget || {};
  return Boolean(target?.effectChannelFallback && target.kind === "model-root");
}

function runtimeEffectChannelFallbackCaptureReady() {
  return effectNativeChannelCaptureSummary?.readyForFullMappingReview === true;
}

function runtimeEffectKindredActionChannelEvidence(entry) {
  const hook = entry?.hook || entry || {};
  if (hook.resourceMatchKind !== "kindred-effect-slot-bare-action-channel") return false;
  if (hook.resourceEvidenceSource !== "kindred-effect-resource-slot") return false;
  if (hook.aliasEvidenceStrength !== "strong") return false;
  const runtimeBinding = hook.runtimeBinding || entry?.runtimeBinding || {};
  if (runtimeBinding.kind && runtimeBinding.kind !== "effect-channel") return false;
  const options = runtimeEffectNativeOptions(entry) || runtimeBinding.effectOptions || {};
  if (options.followTarget !== true && runtimeBinding.effectOptions?.followTarget !== true) return false;
  if (!runtimeEffectHasTimelineEvidence(entry)) return false;
  return runtimeEffectInferredActionKeys(entry).size > 0;
}

function runtimeEffectChannelFallbackPreviewAllowed(entry) {
  if (!runtimeEffectChannelFallbackCaptureReady()) return false;
  return (
    runtimeEffectBindingTargetIsEffectChannelFallback(entry) &&
    runtimeEffectPreviewRole(entry) === "sustain" &&
    runtimeEffectKindredActionChannelEvidence(entry)
  );
}

function runtimeEffectRenderFamilySupportedForPreview(renderFamily, entry = {}) {
  if (renderFamily === "billboard") return true;
  const text = `${entry.effectToken || ""} ${entry.hook?.token || ""} ${entry.pfxItem?.relativePath || ""}`;
  const role = runtimeEffectPreviewRole(entry);
  if (renderFamily === "beam") {
    return role === "projectile" || /beam|laser|ray|chain|tether|trail|slash/i.test(text);
  }
  if (renderFamily === "area") {
    if (runtimeEffectBindingTargetIsEffectChannelFallback(entry) && !runtimeEffectChannelFallbackAreaPreviewAllowed(entry) && role !== "sustain")
      return false;
    if (runtimeEffectEntryHasStrongSpatialEvidence(entry) && runtimeEffectInferredActionKeys(entry).size && runtimeEffectHasTimelineEvidence(entry))
      return true;
    if (runtimeEffectChannelFallbackAreaPreviewAllowed(entry)) return true;
    const bindingKind = entry.bindingTarget?.kind || "";
    if (bindingKind === "model-root" || bindingKind === "model-root-offset") return true;
    if (role === "warning") return true;
    if (role === "impact" && runtimeEffectEntryStartSeconds(entry) !== null) return true;
    return false;
  }
  return false;
}

function runtimeEffectShadergraphSupportedForPreview(shadergraphItem, pfxItem, entry = {}) {
  const renderFamily = runtimeEffectShadergraphRenderFamily(pfxItem, shadergraphItem);
  return runtimeEffectRenderFamilySupportedForPreview(renderFamily, entry);
}

function runtimeEffectPreviewShadergraphItems(shadergraphItems, pfxItem = null, entry = {}) {
  const preferred = (shadergraphItems || [])
    .filter((shadergraphItem) => runtimeEffectShadergraphLooksLikeEffectLayer(shadergraphItem, pfxItem, entry))
    .filter((shadergraphItem) => runtimeEffectShadergraphSupportedForPreview(shadergraphItem, pfxItem, entry));
  const renderable = preferred.filter((shadergraphItem) => runtimeEffectShadergraphHasRenderableSurfaceEvidence(shadergraphItem, pfxItem, entry));
  return renderable;
}

function runtimeEffectPreviewHasRenderableMaterial(shadergraphItems, pfxItem = null, entry = {}) {
  return (shadergraphItems || []).some((shadergraphItem) =>
    runtimeEffectShadergraphHasRenderableSurfaceEvidence(shadergraphItem, pfxItem, entry),
  );
}

function runtimeEffectNativeOptionArgKinds(hookOrEntry) {
  const options = runtimeEffectNativeOptions(hookOrEntry) || hookOrEntry?.runtimeBinding?.effectOptions || {};
  return uniqueSorted([
    ...(options.effectOptionArgKinds || []),
    ...(hookOrEntry?.runtimeBinding?.effectOptionArgKinds || []),
    ...(hookOrEntry?.hook?.runtimeBinding?.effectOptionArgKinds || []),
    ...(hookOrEntry?.pfxBindingProfile?.effectOptions?.effectOptionArgKinds || []),
    ...(hookOrEntry?.projectile?.runtimeBinding?.effectOptionArgKinds || []),
    ...(hookOrEntry?.projectileSourceEntry?.hook?.runtimeBinding?.effectOptionArgKinds || []),
    ...(hookOrEntry?.projectileSourceEntry?.pfxBindingProfile?.effectOptions?.effectOptionArgKinds || []),
    ...(hookOrEntry?.projectileSourceEntry?.projectile?.runtimeBinding?.effectOptionArgKinds || []),
  ]);
}

function runtimeEffectNativeOptionsHavePrimitiveNumericEvidence(hookOrEntry) {
  const argKinds = runtimeEffectNativeOptionArgKinds(hookOrEntry);
  if (!argKinds.length) return true;
  return argKinds.every((argKind) => /:(?:numeric-direct|numeric-local)$/.test(String(argKind)));
}

function runtimeEffectHookHasNativePrimitiveOptions(hookOrEntry) {
  const options = runtimeEffectNativeOptions(hookOrEntry) || hookOrEntry?.runtimeBinding?.effectOptions;
  if (!options) return false;
  if (options.visibleOrActive === false) return false;
  if (!runtimeEffectNativeOptionsHavePrimitiveNumericEvidence(hookOrEntry)) return false;
  const hasDrawableColor = Array.isArray(options.color);
  const hasDrawableScale = Number.isFinite(Number(options.scale));
  const hasDrawableFade = Number.isFinite(Number(options.fadeSeconds)) && (hasDrawableColor || hasDrawableScale);
  return (
    hasDrawableColor ||
    hasDrawableScale ||
    hasDrawableFade
  );
}

function runtimeEffectNativePrimitiveText(hookOrEntry) {
  return [
    hookOrEntry?.effectToken,
    hookOrEntry?.token,
    hookOrEntry?.hook?.effectToken,
    hookOrEntry?.hook?.token,
    hookOrEntry?.runtimeBinding?.locatorLabel,
    hookOrEntry?.hook?.runtimeBinding?.locatorLabel,
  ].filter(Boolean).join(" ");
}

function runtimeEffectNativePrimitivePreviewAllowed(hookOrEntry) {
  if (!runtimeEffectHookHasNativePrimitiveOptions(hookOrEntry)) return false;
  const text = runtimeEffectNativePrimitiveText(hookOrEntry);
  return /warning|execute|target|reticle|ring|area|zone|field|cloud|circle|pillar|edge|damagezone|explosion|buff/i.test(text);
}

function runtimeEffectNativePrimitivePfxItemForHook(hookOrEntry) {
  const token = hookOrEntry?.effectToken || hookOrEntry?.token || hookOrEntry?.hook?.effectToken || hookOrEntry?.hook?.token || "native-effect";
  return {
    relativePath: `native-option:${token}`,
    nativePrimitive: true,
    references: [],
    surfaceRecords: [],
  };
}

function runtimeEffectSurfaceRuntimeHint(record, name) {
  if (name === "delaySeconds" || name === "durationSeconds") {
    const emitterValue = record?.emitterRuntimeHints?.[name];
    if (Number.isFinite(emitterValue)) return emitterValue;
  }
  const value = record?.runtimeHints?.[name];
  return Number.isFinite(value) ? value : null;
}

function runtimeEffectSurfaceShapeSizeScalar(surfaceRecord) {
  const runtimeSize = runtimeEffectSurfaceRuntimeHint(surfaceRecord, "sizeScalar");
  if (runtimeSize !== null) return runtimeSize;
  const shapeSize = Number(surfaceRecord?.shapeProfile?.renderSizeScalar);
  return Number.isFinite(shapeSize) ? shapeSize : null;
}

function runtimeEffectEmitterVelocityHint(surfaceRecord) {
  let vectorVelocity = null;
  let damping = null;
  const slots = [];
  for (const slot of surfaceRecord?.emitterRuntimeProfile?.semanticSlots || []) {
    if (slot.targetArraySemantic !== "velocity") continue;
    const value = Number(slot.resolverCurrentCallbackConstantValue);
    if (!Number.isFinite(value)) continue;
    if (slot.name === "velocityVectorCallback") vectorVelocity = value;
    if (slot.name === "velocityDampingCallback") damping = value;
    slots.push({
      name: slot.name || "",
      value,
      source: slot.resolverCurrentCallbackConstantSource || "",
    });
  }
  if (!slots.length) return null;
  return {
    vectorVelocity,
    damping,
    static: vectorVelocity === 0,
    source: "pfx-emitter-current-callback",
    slots,
  };
}

function runtimeEffectEmitterPositionHint(surfaceRecord) {
  const slots = [];
  for (const slot of surfaceRecord?.emitterRuntimeProfile?.semanticSlots || []) {
    if (slot.targetArraySemantic !== "position") continue;
    if (slot.name === "positionVectorCallback") {
      const vector = Array.isArray(slot.resolverCurrentCallbackVectorValue)
        ? slot.resolverCurrentCallbackVectorValue.slice(0, 3).map(Number)
        : [];
      if (vector.length < 3 || vector.some((value) => !Number.isFinite(value))) continue;
      slots.push({
        name: slot.name || "",
        vector,
        source: slot.resolverCurrentCallbackConstantSource || "",
      });
    }
  }
  if (!slots.length) return null;
  return {
    vector: slots[0].vector,
    source: "pfx-emitter-current-callback",
    slots,
  };
}

function runtimeEffectEmitterPositionOffset(positionHint) {
  const vector = positionHint?.vector;
  if (!Array.isArray(vector) || vector.length < 3) return new THREE.Vector3();
  if (vector.some((value) => !Number.isFinite(Number(value)))) return new THREE.Vector3();
  return new THREE.Vector3(vector[0], vector[1], vector[2]).clampLength(0, 24);
}

function runtimeEffectEmitterVelocityOffset(velocityHint, entry, elapsedSeconds) {
  const velocity = Number(velocityHint?.vectorVelocity);
  if (!Number.isFinite(velocity) || Math.abs(velocity) <= 0.001) return new THREE.Vector3();
  const timeSeconds = runtimeEffectSurfaceTimeSeconds(entry, runtimeEffectTimelineWindow(entry), elapsedSeconds);
  const localSeconds = Math.max(0, Number(timeSeconds) || 0);
  const damping = Math.max(0, Math.min(20, Number(velocityHint?.damping) || 0));
  const dampingFactor = damping > 0.001 ? (1 - Math.exp(-damping * localSeconds)) / damping : localSeconds;
  const distance = Math.max(-48, Math.min(48, velocity * dampingFactor * 0.25));
  return new THREE.Vector3(0, distance, 0);
}

function runtimeEffectSurfaceRecordHasRuntimeHint(record) {
  return ["durationSeconds", "delaySeconds", "sizeScalar", "rotationDegrees"].some(
    (name) => runtimeEffectSurfaceRuntimeHint(record, name) !== null,
  );
}

function runtimeEffectPreviewSurfaceRecords(entry) {
  const records = entry.surfaceRecords || entry.pfxItem?.surfaceRecords || [];
  const previewPaths = new Set((entry.previewShadergraphItems || []).map((item) => item.relativePath).filter(Boolean));
  if (!records.length || !previewPaths.size) return [];
  return records.filter((record) => previewPaths.has(record.relativePath));
}

function runtimeEffectShadergraphItemsForEntry(entry) {
  return entry.previewShadergraphItems?.length ? entry.previewShadergraphItems : entry.shadergraphItems || [];
}

function runtimeEffectSurfaceRecordForLayer(entry, layerIndex) {
  const previewSurfaceRecords = runtimeEffectPreviewSurfaceRecords(entry);
  if (previewSurfaceRecords.length) return previewSurfaceRecords[layerIndex % previewSurfaceRecords.length];
  const records = entry.surfaceRecords || entry.pfxItem?.surfaceRecords || [];
  if (!records.length) return null;
  const shadergraphItems = runtimeEffectShadergraphItemsForEntry(entry);
  const shadergraphItem = shadergraphItems.length ? shadergraphItems[layerIndex % shadergraphItems.length] : null;
  if (shadergraphItem?.relativePath) {
    const exactSurfaceRecord = records.find((record) => record.relativePath === shadergraphItem.relativePath);
    if (exactSurfaceRecord) return exactSurfaceRecord;
  }
  return records[layerIndex % records.length];
}

function runtimeEffectShadergraphForLayer(entry, layerIndex) {
  const surfaceRecord = runtimeEffectSurfaceRecordForLayer(entry, layerIndex);
  if (surfaceRecord?.relativePath) {
    const matchedShadergraph = runtimeEffectShadergraphByPath.get(surfaceRecord.relativePath);
    if (matchedShadergraph) return matchedShadergraph;
  }
  const shadergraphItems = runtimeEffectShadergraphItemsForEntry(entry);
  return shadergraphItems.length ? shadergraphItems[layerIndex % shadergraphItems.length] : null;
}

function runtimeEffectFiniteTimelineWindow(window) {
  const startSeconds = Number(window?.startSeconds);
  const endSeconds = Number(window?.endSeconds);
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) return null;
  return { startSeconds, endSeconds };
}

function runtimeEffectPfxProfileTimelineWindow(entry) {
  const includePfxProfileTiming = !runtimeEffectPrimaryHookHasTimingSentinel(entry);
  const includeProjectileSourcePfxTiming = !runtimeEffectProjectileSourceHookHasTimingSentinel(entry);
  const windows = [
    ...(includePfxProfileTiming ? [entry?.pfxBindingProfile?.absoluteTimelineWindow] : []),
    ...(includeProjectileSourcePfxTiming ? [entry?.projectileSourceEntry?.pfxBindingProfile?.absoluteTimelineWindow] : []),
  ];
  for (const window of windows) {
    const normalized = runtimeEffectFiniteTimelineWindow(window);
    if (normalized) return normalized;
  }
  return null;
}

function runtimeEffectSurfaceTimelineWindow(entry) {
  const windows = [];
  const previewSurfaceRecords = runtimeEffectPreviewSurfaceRecords(entry);
  const records = previewSurfaceRecords.length ? previewSurfaceRecords : entry.surfaceRecords || entry.pfxItem?.surfaceRecords || [];
  for (const record of records) {
    const durationSeconds = runtimeEffectSurfaceRuntimeHint(record, "durationSeconds");
    if (durationSeconds === null) continue;
    const delaySeconds = runtimeEffectSurfaceRuntimeHint(record, "delaySeconds") ?? 0;
    const startSeconds = Math.max(0, delaySeconds);
    const endSeconds = startSeconds + Math.max(durationSeconds, 0.08);
    windows.push({ startSeconds, endSeconds });
  }
  if (!windows.length) return null;
  return {
    startSeconds: Math.min(...windows.map((window) => window.startSeconds)),
    endSeconds: Math.max(...windows.map((window) => window.endSeconds)),
  };
}

function runtimeEffectSurfaceHasInstantDuration(surfaceRecord) {
  const durationSeconds = runtimeEffectSurfaceRuntimeHint(surfaceRecord, "durationSeconds");
  return Number.isFinite(durationSeconds) && Math.abs(durationSeconds) <= 0.001;
}

function runtimeEffectTimelineWindowHasInstantStart(entry) {
  const previewSurfaceRecords = runtimeEffectPreviewSurfaceRecords(entry);
  const records = previewSurfaceRecords.length ? previewSurfaceRecords : entry.surfaceRecords || entry.pfxItem?.surfaceRecords || [];
  return records.some((record) => {
    if (!runtimeEffectSurfaceHasInstantDuration(record)) return false;
    const delaySeconds = runtimeEffectSurfaceRuntimeHint(record, "delaySeconds") ?? 0;
    return Math.max(0, delaySeconds) <= 0.001;
  });
}

function runtimeEffectTimelineWindow(entry) {
  const surfaceWindow = runtimeEffectSurfaceTimelineWindow(entry);
  if (surfaceWindow) return surfaceWindow;
  return runtimeEffectPfxProfileTimelineWindow(entry);
}

function runtimeEffectPathLooksSkinnedVariant(relativePath) {
  return /\/(?:S\d+|SUM|Tz|POS|DRGN|GLAD|ICE|MED|LGND|PRM|RSE|SKN|SPEC|T\d+)\//i.test(relativePath || "");
}

function runtimeEffectPfxVariantScore(pfxItem, item = activeManifestItem) {
  const pathText = String(pfxItem?.relativePath || "").toLowerCase();
  const itemText = `${item?.modelLabel || ""} ${item?.rel || ""}`.toLowerCase();
  let score = 0;
  if (runtimeEffectPathLooksSkinnedVariant(pfxItem?.relativePath) && /defaultskin|default|\/art\/[^/]+\.glb$/i.test(itemText)) score += 4;
  for (const token of itemText.split(/[^a-z0-9]+/).filter((part) => part.length >= 3)) {
    if (pathText.includes(token)) score -= 1;
  }
  if (/weapon|trail/i.test(pfxItem?.relativePath || "")) score -= 1;
  if (/impact|hit|burst|cast|warning|proj|projectile|aa|ability|recall|withdraw/i.test(pfxItem?.relativePath || "")) score -= 1;
  return score;
}

function runtimeEffectFallbackPfxItemsForItem(item = activeManifestItem) {
  const heroKey = heroKeyForItem(item);
  const indexedItems = runtimeEffectPfxByHero.get(heroKey) || [];
  if (!indexedItems.length) return [];
  const hookPaths = new Set(runtimeEffectPfxItemsForHooks(runtimeEffectHooksForItem(item), item).map((pfxItem) => pfxItem.relativePath));
  return indexedItems
    .filter((pfxItem) => !hookPaths.has(pfxItem.relativePath))
    .filter((pfxItem) => Number(pfxItem.uniqueShadergraphRefCount) > 0 || Number(pfxItem.shadergraphRefCount) > 0)
    .sort((left, right) => runtimeEffectPfxVariantScore(left, item) - runtimeEffectPfxVariantScore(right, item) || left.relativePath.localeCompare(right.relativePath));
}

function runtimeEffectFallbackBoneIndex(pfxItem, item = activeManifestItem) {
  if (/weapon|trail|slash|attack|aa/i.test(pfxItem?.relativePath || "")) {
    const weaponSlot = runtimeBindSlotsForItem(item).find(
      (slot) => slot.slotName === "Bone_Weapon" && Number.isInteger(Number(slot.resolvedBoneIndex)),
    );
    if (weaponSlot) return Number(weaponSlot.resolvedBoneIndex);
  }
  return 0;
}

function runtimeEffectAbilityKeyForSlot(slotIndex) {
  const slot = Number(slotIndex);
  return Number.isInteger(slot) && slot >= 0 && slot <= 2 ? `ability0${slot + 1}` : "";
}

function runtimeEffectAbilityKeys(entry) {
  const keys = new Set();
  const primarySlotKey = runtimeEffectAbilityKeyForSlot(entry.hook?.primaryAbilityContext?.runtimeAbilitySlotIndex);
  if (primarySlotKey) keys.add(primarySlotKey);
  const contexts = [entry.hook?.primaryAbilityContext, ...(entry.hook?.abilityContexts || [])].filter(Boolean);
  for (const context of contexts) {
    const slotKey = runtimeEffectAbilityKeyForSlot(context.runtimeAbilitySlotIndex);
    if (slotKey) keys.add(slotKey);
    const abilityName = String(context.runtimeAbilityName || "");
    const abilityLetter = abilityName.match(/__([ABC])(?:$|_)/i)?.[1]?.toUpperCase();
    if (abilityLetter) keys.add({ A: "ability01", B: "ability02", C: "ability03" }[abilityLetter]);
  }
  return keys;
}

function runtimeEffectSemanticAbilityPathActionKey(entry) {
  const nativeSemanticCalls = entry?.hook?.nativeSemanticCalls || [];
  if (!nativeSemanticCalls.includes("ability-effect-bone-hook")) return "";
  const pathText = String(entry?.pfxItem?.relativePath || "");
  const match = pathText.match(/(?:^|[\/_-])S([123])(?:[\/_-]|$)/i);
  return match ? runtimeEffectAbilityKeyForSlot(Number(match[1]) - 1) : "";
}

function runtimeEffectInferredActionKeys(entry) {
  const keys = runtimeEffectAbilityKeys(entry);
  if (Array.isArray(entry.actionKeys)) {
    for (const actionKey of entry.actionKeys) keys.add(actionKey);
  }
  const semanticPathActionKey = runtimeEffectSemanticAbilityPathActionKey(entry);
  if (semanticPathActionKey) keys.add(semanticPathActionKey);
  if (keys.size) return keys;
  const text = `${entry.effectToken || ""} ${entry.hook?.token || ""} ${entry.pfxItem?.relativePath || ""}`;
  if (/(^|[_/-])AA(?:[_/.-]|$)|basicattack/i.test(text)) {
    keys.add("attack");
    if (/crit/i.test(text)) keys.add("attack_crit");
    if (/alt/i.test(text)) keys.add("attack_alt");
  }
  if (/(^|[_/-])A(?:[_/.-]|$)/i.test(text) && !/(^|[_/-])AA(?:[_/.-]|$)/i.test(text)) keys.add("ability01");
  if (/(^|[_/-])B(?:[_/.-]|$)/i.test(text)) keys.add("ability02");
  if (/(^|[_/-])C(?:[_/.-]|$)/i.test(text)) keys.add("ability03");
  if (/ult|ultimate/i.test(text)) keys.add("ability03");
  if (/withdraw|recall/i.test(text)) keys.add("withdraw");
  return keys;
}

function runtimeEffectMatchesSelectedAnimation(entry, animation = selectedAnimation()) {
  if (!animation?.actionKey) return false;
  const allowedKeys = runtimeEffectInferredActionKeys(entry);
  if (!allowedKeys.size) return true;
  if (allowedKeys.has(animation.actionKey)) return true;
  if (animation.actionKey.startsWith("attack") && allowedKeys.has("attack")) return true;
  if (animation.actionKey.startsWith("ability01") && allowedKeys.has("ability01")) return true;
  if (animation.actionKey.startsWith("ability02") && allowedKeys.has("ability02")) return true;
  if (animation.actionKey.startsWith("ability03") && allowedKeys.has("ability03")) return true;
  return false;
}

function runtimeEffectActionKeysOverlap(left, right) {
  const leftKeys = left instanceof Set ? left : new Set(left || []);
  const rightKeys = right instanceof Set ? right : new Set(right || []);
  if (!leftKeys.size || !rightKeys.size) return true;
  for (const key of leftKeys) {
    if (rightKeys.has(key)) return true;
    if (key.startsWith("attack") && rightKeys.has("attack")) return true;
    if (key.startsWith("ability01") && rightKeys.has("ability01")) return true;
    if (key.startsWith("ability02") && rightKeys.has("ability02")) return true;
    if (key.startsWith("ability03") && rightKeys.has("ability03")) return true;
  }
  return false;
}

function runtimeEffectRequiresActionGate(entry) {
  const sourceKind = entry?.hook?.sourceKind || entry?.sourceKind || "";
  return sourceKind === "native-effect-vcall" || sourceKind === "native-effect-spawn";
}

function runtimeEffectAllowsStateOnlyNativeVcall(entry, allowedKeys) {
  const sourceKind = entry?.hook?.sourceKind || entry?.sourceKind || "";
  if (sourceKind !== "native-effect-vcall") return false;
  if (entry?.hook?.runtimeBinding?.kind !== "selected-attachment") return false;
  if (allowedKeys?.size) return false;
  if (runtimeEffectNativeOptions(entry)?.followTarget !== false) return false;
  if (!runtimeEffectEntryHasStrongSpatialEvidence(entry)) return false;
  if (!runtimeEffectHasTimelineEvidence(entry)) return false;
  const visibility = entry?.hook?.visibility || {};
  return Boolean(visibility.setsVisibleOrActive || visibility.setsEffectOption);
}

function runtimeEffectAllowsBoneBoundStateOnlyNativeVcall(entry, allowedKeys) {
  const sourceKind = entry?.hook?.sourceKind || entry?.sourceKind || "";
  if (sourceKind !== "native-effect-vcall") return false;
  if (entry?.hook?.runtimeBinding?.kind !== "bone") return false;
  if (allowedKeys?.size) return false;
  if (!runtimeEffectEntryHasStrongSpatialEvidence(entry)) return false;
  if (!runtimeEffectHasTimelineEvidence(entry)) return false;
  if (!runtimeEffectPfxRuntimeEvidence(entry).allowed) return false;

  const visibility = entry?.hook?.visibility || {};
  const buffTokens = Array.isArray(visibility.buffTokens) ? visibility.buffTokens.filter(Boolean) : [];
  if (visibility.hasCallback || buffTokens.length) return false;
  if (!(visibility.setsVisibleOrActive || visibility.setsEffectOption)) return false;

  const options = runtimeEffectNativeOptions(entry) || {};
  if (options.visibleOrActive === false) return false;
  if (options.followTarget === false) return false;
  return true;
}

function runtimeEffectRequiresStateGate(entry) {
  const buffTokens = Array.isArray(entry?.hook?.visibility?.buffTokens) ? entry.hook.visibility.buffTokens.filter(Boolean) : [];
  if (buffTokens.length) return true;
  return Boolean(
    entry?.hook?.visibility?.hasCallback &&
      (entry?.hook?.visibility?.setsVisibleOrActive || entry?.hook?.visibility?.setsEffectOption),
  );
}

function runtimeEffectRoleRequiresTimelineEvidence(entry) {
  const role = runtimeEffectPreviewRole(entry);
  return role === "impact" || role === "projectile" || role === "warning" || role === "cast";
}

function runtimeEffectHasTimelineEvidence(entry) {
  return (
    runtimeEffectEntryStartSeconds(entry) !== null ||
    runtimeEffectTimelineWindow(entry) !== null ||
    runtimeEffectNativeTimelineTimes(entry).length > 0
  );
}

function runtimeEffectDefinitionNeighborhoodHasActionResourceEvidence(entry) {
  const sourceKind = entry?.sourceKind || entry?.hook?.sourceKind || "";
  if (sourceKind !== "definition-neighborhood-pfx") return false;
  if (!entry?.pfxItem?.relativePath) return false;
  if (!runtimeEffectInferredActionKeys(entry).size) return false;
  return runtimeEffectHasTimelineEvidence(entry);
}

function runtimeEffectTimingSentinelRequiresTimelineEvidence(entry) {
  return runtimeEffectPrimaryHookHasTimingSentinel(entry) || runtimeEffectProjectileSourceHookHasTimingSentinel(entry);
}

function runtimeEffectHasRequiredTimelineEvidence(entry) {
  if (runtimeEffectDefinitionNeighborhoodHasActionResourceEvidence(entry)) return true;
  if (runtimeEffectTimingSentinelRequiresTimelineEvidence(entry) && !runtimeEffectHasTimelineEvidence(entry)) return false;
  return !runtimeEffectRoleRequiresTimelineEvidence(entry) || runtimeEffectHasTimelineEvidence(entry);
}

function runtimeEffectRoleRequiresSpatialEvidence(entry) {
  const role = runtimeEffectPreviewRole(entry);
  return role === "projectile" || role === "impact";
}

function runtimeEffectWeakSelfImpactBinding(entry) {
  if (entry?.sourceKind !== "cff0-effect-instance") return false;
  if (runtimeEffectPreviewRole(entry) !== "impact") return false;
  if (entry?.projectile || entry?.projectileSourceEntry) return false;
  const target = entry?.bindingTarget || {};
  const kind = target.kind || "";
  if (kind !== "bone" && kind !== "bone-name" && kind !== "model-root") return false;
  const boneToken = `${target.boneToken || ""} ${entry?.hook?.boneToken || ""}`;
  return /headA|spineC|Bone_CenterMass|Bone_Head|center/i.test(boneToken);
}

function runtimeEffectSpatialBlockReason(entry) {
  if (
    runtimeEffectBindingTargetIsEffectChannelFallback(entry) &&
    !runtimeEffectChannelFallbackPreviewAllowed(entry) &&
    !runtimeEffectChannelFallbackAreaPreviewAllowed(entry)
  )
    return "effect-channel-fallback";
  if (runtimeEffectWeakSelfImpactBinding(entry)) return "weak-self-impact-binding";
  return "";
}

function runtimeEffectHasRequiredSpatialEvidence(entry) {
  return !runtimeEffectSpatialBlockReason(entry);
}

function runtimeEffectPreviewAnimationBlockReason(entry, animation = selectedAnimation()) {
  const allowedKeys = runtimeEffectInferredActionKeys(entry);
  if (runtimeEffectRequiresStateGate(entry) && !allowedKeys.size) return "state-gate";
  if (!runtimeEffectHasRequiredSpatialEvidence(entry)) return "no-spatial-evidence";
  if (!runtimeEffectHasRequiredTimelineEvidence(entry)) return "no-timeline-evidence";
  if (!animation?.actionKey) return "";
  if (runtimeEffectAllowsStateOnlyNativeVcall(entry, allowedKeys)) return "";
  if (runtimeEffectAllowsBoneBoundStateOnlyNativeVcall(entry, allowedKeys)) return "";
  if (runtimeEffectRequiresActionGate(entry) && !allowedKeys.size) return "action-gate";
  if (!allowedKeys.size) return "";
  if (runtimeEffectMatchesSelectedAnimation(entry, animation)) return "";
  return "action-mismatch";
}

function runtimeEffectShouldPreviewForAnimation(entry, animation = selectedAnimation()) {
  const allowedKeys = runtimeEffectInferredActionKeys(entry);
  if (runtimeEffectRequiresStateGate(entry) && !allowedKeys.size) return false;
  if (!runtimeEffectHasRequiredSpatialEvidence(entry)) return false;
  if (!runtimeEffectHasRequiredTimelineEvidence(entry)) return false;
  if (!animation?.actionKey) return true;
  if (runtimeEffectAllowsStateOnlyNativeVcall(entry, allowedKeys)) return true;
  if (runtimeEffectAllowsBoneBoundStateOnlyNativeVcall(entry, allowedKeys)) return true;
  if (runtimeEffectRequiresActionGate(entry) && !allowedKeys.size) return false;
  if (!allowedKeys.size) return true;
  return runtimeEffectMatchesSelectedAnimation(entry, animation);
}

function runtimeEffectPathLooksImpactResource(relativePath) {
  const text = String(relativePath || "");
  return (
    /(?:^|[_/-])(?:hit|impact|imp|exp|explode|explosion)(?:[_/.-]|\d|$)/i.test(text) ||
    /[a-z0-9](?:Hit|Impact|Burst|Explosion)(?:[A-Z0-9_.-]|$)/.test(text)
  );
}

function runtimeEffectProjectileEntryEffectTokens(projectileEntry) {
  return new Set(
    [
      projectileEntry?.effectToken,
      projectileEntry?.hook?.effectToken,
      projectileEntry?.hook?.token,
      ...(projectileEntry?.projectile?.effectTokens || []),
      ...(projectileEntry?.projectile?.nativeEffectHookTokens || []),
    ].filter(Boolean),
  );
}

function runtimeEffectProjectileRuntimeCoversRelatedImpact(entry, projectileEntry) {
  if (!runtimeEffectPathLooksImpactResource(entry?.pfxItem?.relativePath)) return false;
  const projectileTokens = runtimeEffectProjectileEntryEffectTokens(projectileEntry);
  if (!projectileTokens.size) return false;
  const candidateTokens = [
    entry?.effectToken,
    entry?.hook?.effectToken,
    entry?.hook?.token,
    ...(entry?.hook?.nativeNearbyEffectTokens || []),
  ].filter(Boolean);
  return candidateTokens.some((token) => projectileTokens.has(token));
}

function runtimeEffectProjectileRuntimeCoverage(entry, animation = selectedAnimation(), item = activeManifestItem) {
  if (!runtimeEffectBindingTargetIsEffectChannelFallback(entry)) return "";
  const resourcePath = entry?.pfxItem?.relativePath || "";
  if (!resourcePath) return "";
  let hasProjectileRuntimeRoute = false;
  for (const projectileEntry of runtimeEffectDefinitionProjectileEntriesForItem(item)) {
    const exactResourceMatch = projectileEntry?.pfxItem?.relativePath === resourcePath;
    if (!exactResourceMatch && !runtimeEffectProjectileRuntimeCoversRelatedImpact(entry, projectileEntry)) continue;
    hasProjectileRuntimeRoute = true;
    if (runtimeEffectShouldPreviewForAnimation(projectileEntry, animation)) return "projectile-runtime-current-action";
  }
  return hasProjectileRuntimeRoute ? "projectile-runtime-other-action" : "";
}

function runtimeEffectProjectileRuntimeCoverageCounts(hooks = runtimeEffectHooksForItem(), animation = selectedAnimation(), item = activeManifestItem) {
  const counts = { currentAction: 0, otherAction: 0 };
  for (const hook of hooks || []) {
    const bindingTarget = runtimeEffectBindingTarget(hook, item);
    if (!bindingTarget) continue;
    const sourceKind = hook.sourceKind || "native-effect-hook";
    const effectToken = hook.effectToken || hook.token || "";
    for (const pfxItem of runtimeEffectPfxItemsForHooks([hook], item)) {
      const entry = {
        hook,
        pfxItem,
        bindingTarget,
        sourceKind,
        effectToken: effectToken || pfxItem.relativePath,
        actionKeys: hook.actionKeys || [],
      };
      const coverage = runtimeEffectProjectileRuntimeCoverage(entry, animation, item);
      if (coverage === "projectile-runtime-current-action") counts.currentAction += 1;
      if (coverage === "projectile-runtime-other-action") counts.otherAction += 1;
    }
  }
  return counts;
}

function runtimeEffectProjectileRuntimeCoverageSummary(counts) {
  const parts = [];
  if (counts?.currentAction) parts.push(`当前动作 ${counts.currentAction}`);
  if (counts?.otherAction) parts.push(`其他动作 ${counts.otherAction}`);
  return parts.length ? `projectile runtime 已接管：${parts.join("，")}` : "";
}

function runtimeEffectPreviewEntryPriority(entry, animation = selectedAnimation()) {
  const allowedKeys = runtimeEffectInferredActionKeys(entry);
  let score = 0;
  if (allowedKeys.size && runtimeEffectMatchesSelectedAnimation(entry, animation)) score -= 100;
  if (runtimeEffectEntryStartSeconds(entry) !== null) score -= 20;
  if (runtimeEffectIsProjectile(entry) || runtimeEffectIsProjectileImpact(entry)) score -= 15;
  const role = runtimeEffectPreviewRole(entry);
  if (role === "cast" || role === "impact" || role === "warning") score -= 10;
  if (runtimeEffectBindingTargetIsEffectChannelFallback(entry)) score += 18;
  if (!allowedKeys.size) score += 30;
  return score;
}

function runtimeEffectLimitedPreviewEntries(entries, animation = selectedAnimation()) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) =>
      runtimeEffectPreviewEntryPriority(left.entry, animation) - runtimeEffectPreviewEntryPriority(right.entry, animation) ||
      left.index - right.index,
    )
    .slice(0, RUNTIME_EFFECT_PREVIEW_LIMIT)
    .map((item) => item.entry);
}

function runtimeEffectWeakProjectileContextBinding(entry) {
  if (!runtimeEffectIsProjectile(entry)) return false;
  const target = entry?.bindingTarget || {};
  const boneToken = String(target.boneToken || "");
  if (target.effectChannelFallback) return true;
  if (target.kind === "model-root") return true;
  return /Bone_CenterMass|spineC|center/i.test(boneToken);
}

function runtimeEffectStrongProjectileEmitterBinding(entry) {
  if (!runtimeEffectIsProjectile(entry)) return false;
  if (runtimeEffectWeakProjectileContextBinding(entry)) return false;
  const target = entry?.bindingTarget || {};
  return target.kind === "bone" || target.kind === "bone-name" || target.kind === "model-root-offset";
}

function runtimeEffectProjectileDedupeKey(entry) {
  if (!runtimeEffectIsProjectile(entry)) return "";
  const actionKey = [...runtimeEffectInferredActionKeys(entry)].sort().join("|");
  const timingKey = runtimeEffectPreviewTimingKey(entry);
  const lateralOffset = Number(entry?.projectileLateralOffset ?? entry?.bindingTarget?.lateralOffset ?? 0);
  const lateralOffsetKey = Number.isFinite(lateralOffset) ? lateralOffset.toFixed(3) : "0.000";
  return `${entry?.pfxItem?.relativePath || ""}\t${actionKey}\t${timingKey}\t${lateralOffsetKey}`;
}

function runtimeEffectCff0DedupeKey(entry) {
  if (entry?.sourceKind !== "cff0-effect-instance") return "";
  const target = entry?.bindingTarget || {};
  const actionKey = [...runtimeEffectInferredActionKeys(entry)].sort().join("|");
  const timingKey = runtimeEffectPreviewTimingKey(entry);
  const localPositionKey = target.localPosition?.toArray?.().join(",") || "";
  const lateralOffset = Number(target.lateralOffset ?? entry?.projectileLateralOffset ?? 0);
  const lateralOffsetKey = Number.isFinite(lateralOffset) ? lateralOffset.toFixed(3) : "0.000";
  return [
    entry?.pfxItem?.relativePath || "",
    entry?.effectToken || entry?.hook?.effectToken || entry?.hook?.token || "",
    actionKey,
    timingKey,
    target.kind || "",
    target.boneIndex ?? "",
    target.boneToken || "",
    localPositionKey,
    lateralOffsetKey,
    target.effectChannelFallback ? "effect-channel" : "",
  ].join("\t");
}

function runtimeEffectNativeBoundDedupeKey(entry) {
  return runtimeEffectNativeBoundDedupeKeys(entry)[0] || "";
}

function runtimeEffectNativeBoundDedupeKeys(entry) {
  const sourceKind = entry?.sourceKind || "";
  if (sourceKind !== "cff0-effect-instance" && !sourceKind.startsWith("native-")) return [];
  if (!entry?.pfxItem?.relativePath) return [];
  const actionKeys = [...runtimeEffectInferredActionKeys(entry)].sort();
  const expandedActionKeys = actionKeys.length ? actionKeys : [""];
  const startSeconds = runtimeEffectEntryStartSeconds(entry);
  const timingKey = startSeconds !== null ? Number(startSeconds).toFixed(3) : runtimeEffectPreviewTimingKey(entry);
  return expandedActionKeys.map((actionKey) =>
    [
      entry.pfxItem.relativePath,
      entry.effectToken || entry?.hook?.effectToken || entry?.hook?.token || "",
      actionKey,
      timingKey,
    ].join("\t"),
  );
}

function runtimeEffectDedupePreviewEntries(entries) {
  const strongProjectileKeys = new Set();
  for (const entry of entries || []) {
    const key = runtimeEffectProjectileDedupeKey(entry);
    if (key && runtimeEffectStrongProjectileEmitterBinding(entry)) strongProjectileKeys.add(key);
  }
  const nativeBoundKeys = new Set();
  for (const entry of entries || []) {
    for (const nativeKey of runtimeEffectNativeBoundDedupeKeys(entry)) {
      if (entry.sourceKind !== "cff0-effect-instance") nativeBoundKeys.add(nativeKey);
    }
  }

  const cff0Keys = new Set();
  const filtered = [];
  for (const entry of entries || []) {
    const key = runtimeEffectProjectileDedupeKey(entry);
    if (strongProjectileKeys.has(key) && runtimeEffectWeakProjectileContextBinding(entry)) continue;
    if (
      entry.sourceKind === "cff0-effect-instance" &&
      runtimeEffectNativeBoundDedupeKeys(entry).some((nativeKey) => nativeBoundKeys.has(nativeKey))
    )
      continue;
    if (entry.sourceKind === "cff0-effect-instance") {
      const cff0Key = runtimeEffectCff0DedupeKey(entry);
      if (cff0Keys.has(cff0Key)) continue;
      if (cff0Key) cff0Keys.add(cff0Key);
    }
    filtered.push(entry);
  }
  return filtered;
}

function runtimeEffectDefaultProjectileBindingTarget(item = activeManifestItem) {
  const weaponSlot = runtimeBindSlotsForItem(item).find(
    (slot) => slot.slotName === "Bone_Weapon" && Number.isInteger(Number(slot.resolvedBoneIndex)),
  );
  if (weaponSlot) return { kind: "bone", boneIndex: Number(weaponSlot.resolvedBoneIndex), boneToken: "Bone_Weapon" };
  return { kind: "model-root", boneIndex: null, boneToken: "" };
}

function runtimeNativeProjectileActionMatches(row, projectile) {
  const rowKeys = new Set(row?.actionKeys || []);
  const projectileKeys = new Set(projectile?.actionKeys || []);
  if (!rowKeys.size || !projectileKeys.size) return false;
  for (const key of projectileKeys) {
    if (rowKeys.has(key)) return true;
    if (key.startsWith("attack") && rowKeys.has("attack")) return true;
    if (key.startsWith("ability01") && rowKeys.has("ability01")) return true;
    if (key.startsWith("ability02") && rowKeys.has("ability02")) return true;
    if (key.startsWith("ability03") && rowKeys.has("ability03")) return true;
  }
  return false;
}

function runtimeNativeProjectileEmitterSlotScore(row, slot) {
  const label = String(row?.emitterLabel || "").toLowerCase();
  const slotName = String(slot?.slotName || "").toLowerCase();
  let score = Number.isInteger(Number(slot?.resolvedBoneIndex)) ? 20 : 0;
  if (/right/.test(label) && /right/.test(slotName)) score += 30;
  if (/left/.test(label) && /left/.test(slotName)) score += 30;
  if (/center|body|mass/.test(label) && /center|body|mass|root/.test(slotName)) score += 30;
  if (/mouth/.test(label) && /jaw|mouth/.test(slotName)) score += 35;
  if (/mouth/.test(label) && /head/.test(slotName)) score += 15;
  if (/head|eye/.test(label) && /head|eye/.test(slotName)) score += 25;
  if (/gun|muzzle|barrel|launcher|cannon/.test(label) && /gun|muzzle|barrel|launcher|weapon|hand/.test(slotName)) score += 30;
  if (/hook|anchor|pipe/.test(label) && /hook|anchor|pipe|weapon|hand/.test(slotName)) score += 30;
  return score;
}

function runtimeNativeProjectileEmitterBindingTarget(projectile, item = activeManifestItem) {
  if (projectile?.role !== "projectile") return null;
  const row = runtimeNativeProjectileRowsForItem(item).find(
    (row) => row.emitterLabel && runtimeNativeProjectileActionMatches(row, projectile),
  );
  if (!row?.emitterLabel) return null;
  const slots = runtimeBindSlotsForItem(item)
    .map((slot, index) => ({ slot, index, definitionLabels: runtimeDefinitionLabelsForSlot(slot) }))
    .filter(({ definitionLabels }) => definitionLabels.has(row.emitterLabel));
  if (!slots.length) return null;
  slots.sort(
    (left, right) =>
      runtimeNativeProjectileEmitterSlotScore(row, right.slot) - runtimeNativeProjectileEmitterSlotScore(row, left.slot) || left.index - right.index,
  );
  const slot = slots[0].slot;
  if (Number.isInteger(Number(slot.resolvedBoneIndex))) {
    return { kind: "bone", boneIndex: Number(slot.resolvedBoneIndex), boneToken: slot.slotName, nativeProjectile: row };
  }
  return { kind: "bone-name", boneIndex: null, boneToken: slot.slotName, nativeProjectile: row };
}

function runtimeNativeProjectileNearbyBoneBindingTarget(projectile, item = activeManifestItem) {
  if (projectile?.role !== "projectile") return null;
  const slots = runtimeBindSlotsForItem(item);
  const candidates = [];
  for (const row of runtimeNativeProjectileRowsForItem(item)) {
    if (!runtimeNativeProjectileActionMatches(row, projectile)) continue;
    for (const boneToken of row.nearbyBoneTokens || []) {
      const slotIndex = slots.findIndex((slot) => slot.slotName === boneToken);
      if (slotIndex < 0) continue;
      const slot = slots[slotIndex];
      candidates.push({
        row,
        slot,
        slotIndex,
        score: runtimeNativeProjectileEmitterSlotScore(row, slot),
      });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((left, right) => right.score - left.score || left.slotIndex - right.slotIndex);
  const { row, slot } = candidates[0];
  if (Number.isInteger(Number(slot.resolvedBoneIndex))) {
    return { kind: "bone", boneIndex: Number(slot.resolvedBoneIndex), boneToken: slot.slotName, nativeProjectile: row };
  }
  return { kind: "bone-name", boneIndex: null, boneToken: slot.slotName, nativeProjectile: row };
}

function runtimeNativeProjectileSemanticEmitterBindingTarget(projectile, item = activeManifestItem) {
  if (projectile?.role !== "projectile") return null;
  const slots = runtimeBindSlotsForItem(item);
  const candidates = [];
  for (const row of runtimeNativeProjectileRowsForItem(item)) {
    if (!row.emitterLabel || !runtimeNativeProjectileActionMatches(row, projectile)) continue;
    slots.forEach((slot, slotIndex) => {
      if (runtimeNativeProjectileEmitterSlotScore(row, slot) >= RUNTIME_NATIVE_PROJECTILE_SEMANTIC_SLOT_SCORE) {
        candidates.push({
          row,
          slot,
          slotIndex,
          score: runtimeNativeProjectileEmitterSlotScore(row, slot),
        });
      }
    });
  }
  if (!candidates.length) return null;
  candidates.sort((left, right) => right.score - left.score || left.slotIndex - right.slotIndex);
  const { row, slot } = candidates[0];
  if (Number.isInteger(Number(slot.resolvedBoneIndex))) {
    return { kind: "bone", boneIndex: Number(slot.resolvedBoneIndex), boneToken: slot.slotName, nativeProjectile: row };
  }
  return { kind: "bone-name", boneIndex: null, boneToken: slot.slotName, nativeProjectile: row };
}

function runtimeEffectDefinitionProjectileBindingTarget(projectile, item = activeManifestItem) {
  if (projectile?.runtimeBinding?.kind === "model-root-offset") {
    const localPosition = Array.isArray(projectile.runtimeBinding.localPosition)
      ? new THREE.Vector3(...projectile.runtimeBinding.localPosition)
      : runtimeLocatorPositionFromManifest(projectile);
    return {
      kind: "model-root-offset",
      boneIndex: null,
      boneToken: "",
      localPosition,
      locatorLabel: projectile.runtimeBinding.locatorLabel || projectile.runtimeLocatorLabel || "",
      nativeProjectile: projectile.nativeProjectileId ? { projectileIdHex: projectile.nativeProjectileId } : null,
    };
  }
  if (projectile?.runtimeBinding?.kind === "bone") {
    if (Number.isInteger(Number(projectile.runtimeBinding.boneIndex))) {
      return {
        kind: "bone",
        boneIndex: Number(projectile.runtimeBinding.boneIndex),
        boneToken: projectile.runtimeBinding.boneToken || projectile.boneToken || "",
        nativeProjectile: projectile.nativeProjectileId ? { projectileIdHex: projectile.nativeProjectileId } : null,
      };
    }
    if (projectile.runtimeBinding.boneToken) {
      return {
        kind: "bone-name",
        boneIndex: null,
        boneToken: projectile.runtimeBinding.boneToken,
        nativeProjectile: projectile.nativeProjectileId ? { projectileIdHex: projectile.nativeProjectileId } : null,
      };
    }
  }
  if (projectile?.boneToken) {
    const slot = runtimeBindSlotsForItem(item).find(
      (slot) => slot.slotName === projectile.boneToken && Number.isInteger(Number(slot.resolvedBoneIndex)),
    );
    if (slot) return { kind: "bone", boneIndex: Number(slot.resolvedBoneIndex), boneToken: projectile.boneToken };
    return { kind: "bone-name", boneIndex: null, boneToken: projectile.boneToken };
  }
  const nativeProjectileTarget = runtimeNativeProjectileEmitterBindingTarget(projectile, item);
  if (nativeProjectileTarget) return nativeProjectileTarget;
  const nativeNearbyBoneTarget = runtimeNativeProjectileNearbyBoneBindingTarget(projectile, item);
  if (nativeNearbyBoneTarget) return nativeNearbyBoneTarget;
  const nativeSemanticEmitterTarget = runtimeNativeProjectileSemanticEmitterBindingTarget(projectile, item);
  if (nativeSemanticEmitterTarget) return nativeSemanticEmitterTarget;
  return runtimeEffectDefaultProjectileBindingTarget(item);
}

function runtimeEffectTokenForProjectile(projectile) {
  return (
    projectile?.boneEffectToken ||
    projectile?.effectTokens?.[0] ||
    projectile?.resourcePath?.split("/").pop()?.replace(/\.pfx$/i, "") ||
    projectile?.resourcePath ||
    ""
  );
}

function runtimeEffectProjectileLateralOffsets(projectile) {
  const offsets = Array.isArray(projectile?.runtimeBinding?.lateralOffsets)
    ? projectile.runtimeBinding.lateralOffsets
    : Array.isArray(projectile?.nativeProjectileLateralOffsets)
      ? projectile.nativeProjectileLateralOffsets
      : [];
  return [...new Set(offsets.map((offset) => Number(offset)).filter((offset) => Number.isFinite(offset) && Math.abs(offset) > 0.001))];
}

function runtimeEffectImpactStartSecondsForProjectileEntry(projectileEntry) {
  const timelineTimes = [
    ...(projectileEntry?.hook?.runtimeBinding?.timelineTimes || []),
    ...(projectileEntry?.projectile?.runtimeBinding?.timelineTimes || []),
  ].map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (timelineTimes.length > 1) return Math.max(...timelineTimes);
  return null;
}

function runtimeEffectRelatedImpactHooksForProjectile(projectileEntry, item = activeManifestItem) {
  const projectileTokens = runtimeEffectProjectileEntryEffectTokens(projectileEntry);
  if (!projectileTokens.size) return [];
  const projectileActionKeys = runtimeEffectInferredActionKeys(projectileEntry);
  return runtimeEffectHooksForItem(item).filter((hook) => {
    const nearbyTokens = hook.nativeNearbyEffectTokens || [];
    if (!nearbyTokens.some((token) => projectileTokens.has(token))) return false;
    if (!runtimeEffectActionKeysOverlap(projectileActionKeys, runtimeEffectInferredActionKeys({ hook, actionKeys: hook.actionKeys || [] }))) {
      return false;
    }
    return (hook.resourcePaths || []).some((resourcePath) => runtimeEffectPathLooksImpactResource(resourcePath));
  });
}

function runtimeEffectImpactEntriesForRelatedHooks(projectileEntry, item = activeManifestItem) {
  const entries = [];
  const seen = new Set();
  const impactStartSeconds = runtimeEffectImpactStartSecondsForProjectileEntry(projectileEntry);
  for (const hook of runtimeEffectRelatedImpactHooksForProjectile(projectileEntry, item)) {
    const inheritedRuntimeBinding = hook.runtimeBinding || projectileEntry.hook?.runtimeBinding || null;
    for (const pfxItem of runtimeEffectPfxItemsForHooks([hook], item)) {
      const resourcePath = pfxItem.relativePath || "";
      if (!runtimeEffectPathLooksImpactResource(resourcePath) || seen.has(resourcePath)) continue;
      seen.add(resourcePath);
      const effectToken = hook.effectToken || hook.token || resourcePath.split("/").pop()?.replace(/\.pfx$/i, "") || resourcePath;
      entries.push({
        hook: {
          ...hook,
          id: `${hook.id || effectToken}:projectile-impact:${projectileEntry.projectile?.id || projectileEntry.effectToken || resourcePath}`,
          token: effectToken,
          effectToken,
          boneToken: projectileEntry.bindingTarget?.boneToken || hook.boneToken || "",
          runtimeBinding: inheritedRuntimeBinding
            ? {
                ...inheritedRuntimeBinding,
                startSeconds: impactStartSeconds ?? inheritedRuntimeBinding.startSeconds,
              }
            : null,
        },
        projectile: null,
        projectileSourceEntry: projectileEntry,
        pfxItem,
        bindingTarget: projectileEntry.bindingTarget,
        projectileLateralOffset: projectileEntry.projectileLateralOffset || 0,
        sourceKind: "native-projectile-related-impact-hook",
        effectToken,
        actionKeys: hook.actionKeys || projectileEntry.actionKeys || [],
      });
    }
  }
  return entries;
}

function runtimeEffectImpactEntriesForProjectile(projectileEntry, item = activeManifestItem) {
  const entries = [];
  const projectile = projectileEntry?.projectile;
  if (!projectile || projectile.role !== "projectile") return entries;
  const projectiles = runtimeEffectDefinitionProjectilesForItem(item);
  for (const resourcePath of projectile.pairedImpactResourcePaths || []) {
    const pfxItem = runtimeEffectPfxByPath.get(resourcePath);
    if (!pfxItem) continue;
    const impactProjectile = projectiles.find((candidate) => candidate.resourcePath === resourcePath);
    const effectToken = runtimeEffectTokenForProjectile(impactProjectile) || resourcePath.split("/").pop()?.replace(/\.pfx$/i, "") || resourcePath;
    const inheritedRuntimeBinding = projectileEntry.hook?.runtimeBinding || null;
    const impactStartSeconds = runtimeEffectImpactStartSecondsForProjectileEntry(projectileEntry);
    entries.push({
      hook: {
        id: impactProjectile?.id || `projectile-impact:${projectile.id}:${resourcePath}`,
        token: effectToken,
        effectToken,
        boneToken: projectileEntry.bindingTarget?.boneToken || "",
        runtimeBinding: inheritedRuntimeBinding
          ? {
              ...inheritedRuntimeBinding,
              startSeconds: impactStartSeconds ?? inheritedRuntimeBinding.startSeconds,
            }
          : null,
      },
      projectile: impactProjectile || null,
      projectileSourceEntry: projectileEntry,
      pfxItem,
      bindingTarget: projectileEntry.bindingTarget,
      projectileLateralOffset: projectileEntry.projectileLateralOffset || 0,
      sourceKind: impactProjectile?.sourceKind || "definition-projectile-impact-resource",
      effectToken,
      actionKeys: impactProjectile?.actionKeys || projectileEntry.actionKeys || [],
    });
  }
  entries.push(...runtimeEffectImpactEntriesForRelatedHooks(projectileEntry, item));
  return entries;
}

function runtimeEffectDefinitionProjectileEntriesForItem(item = activeManifestItem) {
  const entries = [];
  const projectiles = runtimeEffectDefinitionProjectilesForItem(item);
  const pairedImpactResourcePaths = new Set(
    projectiles.flatMap((projectile) => (projectile.role === "projectile" ? projectile.pairedImpactResourcePaths || [] : [])),
  );
  for (const projectile of projectiles) {
    if (projectile.role === "impact" && pairedImpactResourcePaths.has(projectile.resourcePath)) continue;
    const pfxItem = runtimeEffectPfxByPath.get(projectile.resourcePath);
    if (!pfxItem) continue;
    const bindingTarget = runtimeEffectDefinitionProjectileBindingTarget(projectile, item);
    const effectToken = runtimeEffectTokenForProjectile(projectile);
    let entry = {
      hook: {
        id: projectile.id,
        token: effectToken,
        effectToken,
        boneToken: bindingTarget.boneToken,
        runtimeBinding: {
          kind: bindingTarget.kind,
          boneToken: bindingTarget.boneToken,
          localPosition: bindingTarget.localPosition ? bindingTarget.localPosition.toArray() : null,
          projectileMode: projectile.runtimeBinding?.projectileMode || "",
          lateralOffsets: projectile.runtimeBinding?.lateralOffsets || [],
          startSeconds: projectile.runtimeBinding?.startSeconds,
          timelineTimes: projectile.runtimeBinding?.timelineTimes || [],
        },
      },
      projectile,
      pfxItem,
      bindingTarget,
      projectileLateralOffset: 0,
      sourceKind: projectile.sourceKind || "definition-projectile-resource",
      effectToken,
      actionKeys: projectile.actionKeys || [],
    };
    const callbackBindingTarget = runtimeEffectProjectileCallbackBranchBindingTarget(entry, item);
    if (callbackBindingTarget) entry = runtimeEffectEntryWithBindingTarget(entry, callbackBindingTarget);
    entries.push(entry);
    for (const impactEntry of runtimeEffectImpactEntriesForProjectile(entry, item)) entries.push(impactEntry);
    for (const [offsetIndex, lateralOffset] of runtimeEffectProjectileLateralOffsets(projectile).entries()) {
      const offsetBindingTarget = { ...entry.bindingTarget, lateralOffset };
      const offsetEntry = {
        ...entry,
        hook: {
          ...entry.hook,
          id: `${entry.hook.id}:lateral:${offsetIndex}:${lateralOffset}`,
          runtimeBinding: {
            ...entry.hook.runtimeBinding,
            lateralOffset,
          },
        },
        bindingTarget: offsetBindingTarget,
        projectileLateralOffset: lateralOffset,
      };
      entries.push(offsetEntry);
      for (const impactEntry of runtimeEffectImpactEntriesForProjectile(offsetEntry, item)) entries.push(impactEntry);
    }
  }
  return entries;
}

function runtimeEffectDefinitionNeighborhoodHookScore(hook, row) {
  let score = 0;
  if (hook?.effectToken === row?.sourceEffectToken) score -= 4;
  if (hook?.effectToken === row?.token) score -= 3;
  if (hook?.token === row?.token) score -= 2;
  const startSeconds = Number(hook?.runtimeBinding?.startSeconds);
  if (Number.isFinite(startSeconds) && startSeconds >= 0) score -= 1;
  if (Number.isFinite(startSeconds) && startSeconds < 0) score += 2;
  return score;
}

function runtimeEffectDefinitionNeighborhoodRuntimeHookForResource(row, resourcePath, item = activeManifestItem) {
  const tokens = new Set([row?.sourceEffectToken, row?.token].filter(Boolean));
  const actionKeys = new Set([...(row?.actionKeys || []), ...(row?.pfxActionKeys || [])]);
  const candidates = [];
  for (const hook of runtimeEffectHooksForItem(item)) {
    if (!(hook.resourcePaths || []).includes(resourcePath)) continue;
    const hookTokens = [hook.token, hook.effectToken].filter(Boolean);
    if (tokens.size && !hookTokens.some((token) => tokens.has(token))) continue;
    if (!runtimeEffectActionKeysOverlap(actionKeys, runtimeEffectInferredActionKeys({ hook, actionKeys: hook.actionKeys || [] }))) continue;
    candidates.push({ hook, score: runtimeEffectDefinitionNeighborhoodHookScore(hook, row) });
  }
  candidates.sort((left, right) => left.score - right.score || String(left.hook?.id || "").localeCompare(String(right.hook?.id || "")));
  return candidates[0]?.hook || null;
}

function runtimeEffectDefinitionNeighborhoodEntriesForItem(item = activeManifestItem) {
  const entries = [];
  const seen = new Set();
  for (const row of runtimeEffectDefinitionNeighborhoodRowsForItem(item)) {
    const actionKeys = uniqueSorted([...(row.actionKeys || []), ...(row.pfxActionKeys || [])]);
    for (const resourcePath of row.pfxResourcePaths || []) {
      const pfxItem = runtimeEffectPfxByPath.get(resourcePath);
      if (!pfxItem) continue;
      const runtimeHook = runtimeEffectDefinitionNeighborhoodRuntimeHookForResource(row, resourcePath, item);
      const effectToken = runtimeHook?.effectToken || row.token || row.sourceEffectToken || "";
      const key = [effectToken, row.token || "", resourcePath, actionKeys.join("|")].join("\t");
      if (seen.has(key)) continue;
      seen.add(key);
      const runtimeBindingTarget = runtimeHook ? runtimeEffectBindingTarget(runtimeHook, item) : null;
      const bindingTarget =
        runtimeBindingTarget && !runtimeBindingTarget.effectChannelFallback
          ? runtimeBindingTarget
          : { kind: "model-root", boneIndex: null, boneToken: "Bone_Root" };
      entries.push({
        hook: {
          ...(runtimeHook || {}),
          id: `definition-neighborhood-pfx:${effectToken || row.token || resourcePath}:${resourcePath}`,
          token: row.token || runtimeHook?.token || effectToken || resourcePath,
          effectToken,
          boneToken: bindingTarget.boneToken,
          sourceKind: runtimeHook?.sourceKind || "definition-neighborhood-pfx",
          runtimeBinding: {
            ...(runtimeHook?.runtimeBinding || {}),
            kind: bindingTarget.kind,
            boneToken: bindingTarget.boneToken || runtimeHook?.runtimeBinding?.boneToken || "",
            localPosition: bindingTarget.localPosition ? bindingTarget.localPosition.toArray() : runtimeHook?.runtimeBinding?.localPosition || null,
            sourceFunction: row.sourceFunction || "",
            sourceLine: row.sourceLine ?? null,
            definitionNeighborhoodSourceEffectToken: row.sourceEffectToken || "",
            definitionNeighborhoodToken: row.token || "",
          },
        },
        pfxItem,
        bindingTarget,
        sourceKind: "definition-neighborhood-pfx",
        effectToken,
        actionKeys,
        definitionNeighborhoodRow: row,
      });
    }
  }
  return entries;
}

function runtimeEffectCff0ResourcePaths(row, item = activeManifestItem) {
  return uniqueSorted(
    [
      ...(row?.resolvedResourcePaths || []),
      ...(row?.resourcePaths || []),
      ...(row?.runtimeResources || []),
      ...(row?.nativeResourcePaths || []),
      ...(row?.projectileResourcePaths || []),
    ].filter(
      (resourcePath) =>
        /\.pfx$/i.test(resourcePath) &&
        runtimeEffectPfxByPath.has(resourcePath) &&
        runtimeEffectPfxResourceAllowedBySkinEffectEvidence(resourcePath, row?.effectToken, item),
    ),
  );
}

function runtimeEffectCff0ActionKeyFromLabel(value) {
  const text = String(value || "").toLowerCase();
  if (!text) return "";
  if (/withdraw|recall/.test(text)) return "withdraw";
  if (/ability0?1|(?:^|[_/-])a(?:[_/-]|$)/.test(text)) return "ability01";
  if (/ability0?2|(?:^|[_/-])b(?:[_/-]|$)/.test(text)) return "ability02";
  if (/ability0?3|(?:^|[_/-])c(?:[_/-]|$)|ult/.test(text)) return "ability03";
  if (/crit/.test(text)) return "attack_crit";
  if (/alt/.test(text) && /attack/.test(text)) return "attack_alt";
  if (/attack|basic/.test(text)) return "attack";
  return "";
}

function runtimeEffectCff0ActionKeyFromEffectToken(row) {
  const text = String(row?.effectToken || "").toLowerCase();
  if (!text) return "";
  if (/(?:^|[_/.-])(?:withdraw|recall)(?:[_/.-]|$)/.test(text)) return "withdraw";
  return "";
}

function runtimeEffectCff0ActionKeys(row) {
  const keys = [
    ...(row?.resolvedActionKeys || []),
    ...(row?.projectileActionKeys || []),
    ...(row?.nativeActionKeys || []),
    ...(row?.inheritedActionKeys || []),
  ];
  const effectTokenActionKey = runtimeEffectCff0ActionKeyFromEffectToken(row);
  if (effectTokenActionKey) keys.push(effectTokenActionKey);
  for (const label of [...(row?.resolvedActionLabels || []), ...(row?.targetAnimations || []), ...(row?.referencedAnimations || [])]) {
    const key = runtimeEffectCff0ActionKeyFromLabel(label);
    if (key) keys.push(key);
  }
  return uniqueSorted(keys.filter(Boolean));
}

function runtimeEffectCff0StartSeconds(row) {
  return uniqueSortedNumbers(
    [...(row?.resolvedStartSeconds || []), ...(row?.nativeRuntimeStartSeconds || []), ...(row?.projectileRuntimeStartSeconds || [])]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0),
  );
}

function runtimeEffectCff0BindingTokens(row) {
  return uniqueSorted(
    [
      ...(row?.resolvedBindingTargets || []),
      ...(row?.nativeBindingTargets || []),
      ...(row?.projectileBoneTokens || []),
      ...(row?.projectileEmitterLabels || []),
      ...(row?.targetBones || []),
      ...(row?.referencedBones || []),
      ...(row?.runtimeBones || []),
      ...(row?.targetBindTokens || []),
      ...(row?.referencedBindTokens || []),
      ...(row?.runtimeBindTokens || []),
    ].filter(Boolean),
  );
}

function runtimeEffectCff0ProjectileBinding(row, resourcePath, item = activeManifestItem) {
  const actionKeys = runtimeEffectCff0ActionKeys(row);
  if (!resourcePath || !actionKeys.length) return null;
  for (let projectile of runtimeEffectDefinitionProjectilesForItem(item)) {
    if (!Array.isArray(projectile.pairedImpactResourcePaths)) {
      projectile = { ...projectile, pairedImpactResourcePaths: runtimeManifestListValues(projectile.pairedImpactResourcePaths) };
    }
    const impact = projectile.pairedImpactResourcePaths.includes(resourcePath);
    if (
      (projectile.resourcePath === resourcePath || impact) &&
      runtimeNativeProjectileActionMatches({ actionKeys }, projectile)
    ) {
      const bindingTarget = runtimeEffectDefinitionProjectileBindingTarget(projectile, item);
      if (bindingTarget) return { projectile, bindingTarget, impact };
    }
  }
  return null;
}

function runtimeEffectCff0ProjectileBindingTarget(row, item = activeManifestItem) {
  for (const resourcePath of runtimeEffectCff0ResourcePaths(row, item)) {
    const binding = runtimeEffectCff0ProjectileBinding(row, resourcePath, item);
    if (binding?.bindingTarget) return binding.bindingTarget;
  }
  return null;
}

function runtimeEffectCff0ProjectileSourceEntry(cff0ProjectileBinding) {
  const projectile = cff0ProjectileBinding?.projectile || null;
  const bindingTarget = cff0ProjectileBinding?.bindingTarget || null;
  const pfxItem = runtimeEffectPfxByPath.get(projectile?.resourcePath || "") || null;
  const effectToken = runtimeEffectTokenForProjectile(projectile);
  return {
    hook: {
      id: projectile?.id || `cff0-projectile-source:${projectile?.resourcePath || effectToken}`,
      token: effectToken,
      effectToken,
      boneToken: bindingTarget?.boneToken || projectile?.boneToken || "",
      runtimeBinding: projectile?.runtimeBinding || null,
    },
    projectile,
    pfxItem,
    bindingTarget,
    projectileLateralOffset: 0,
    sourceKind: projectile?.sourceKind || "cff0-paired-projectile-source",
    effectToken,
    actionKeys: projectile?.actionKeys || [],
  };
}

function runtimeEffectCff0BindingTargetScore(target, token, row) {
  let score = 0;
  if (target?.kind === "bone") score += 100;
  if (target?.kind === "bone-name") score += 20;
  if ((row?.targetBindTokens || []).includes(token) || (row?.runtimeBindTokens || []).includes(token)) score += 20;
  if ((row?.projectileBoneTokens || []).includes(token) || (row?.projectileEmitterLabels || []).includes(token)) score += 15;
  if (/^Bone_/.test(token)) score += 5;
  if (target?.effectChannelFallback) score -= 100;
  return score;
}

function runtimeEffectCff0BindingTarget(row, item = activeManifestItem) {
  const projectileBindingTarget = runtimeEffectCff0ProjectileBindingTarget(row, item);
  if (projectileBindingTarget) return projectileBindingTarget;
  const tokens = runtimeEffectCff0BindingTokens(row);
  const candidates = [];
  for (const token of tokens) {
    if (token === "effect-channel") continue;
    const hookLike = { boneToken: token, runtimeBinding: { kind: "bone", boneToken: token } };
    const target = runtimeEffectBindingTarget(hookLike, item);
    if (target) candidates.push({ target, token, score: runtimeEffectCff0BindingTargetScore(target, token, row) });
  }
  candidates.sort((left, right) => right.score - left.score || left.token.localeCompare(right.token));
  if (candidates.length) return candidates[0].target;
  return tokens.includes("effect-channel") ? { kind: "model-root", boneIndex: null, boneToken: "", effectChannelFallback: true } : null;
}

function runtimeEffectBindingHasNegativeTimingSentinel(binding) {
  const startSeconds = Number(binding?.startSeconds);
  if (Number.isFinite(startSeconds) && startSeconds < 0) return true;
  return (binding?.timelineTimes || []).some((value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue < 0;
  });
}

function runtimeEffectPrimaryHookHasTimingSentinel(entry) {
  return runtimeEffectBindingHasNegativeTimingSentinel(entry?.hook?.runtimeBinding);
}

function runtimeEffectProjectileSourceHookHasTimingSentinel(entry) {
  return runtimeEffectBindingHasNegativeTimingSentinel(entry?.projectileSourceEntry?.hook?.runtimeBinding);
}

function runtimeEffectPreviewTimingKey(entry) {
  const includePfxProfileTiming = !runtimeEffectPrimaryHookHasTimingSentinel(entry);
  const includeProjectileSourcePfxTiming = !runtimeEffectProjectileSourceHookHasTimingSentinel(entry);
  const times = [
    entry?.hook?.runtimeBinding?.startSeconds,
    ...(includePfxProfileTiming ? [entry?.pfxBindingProfile?.startSeconds] : []),
    entry?.projectile?.runtimeBinding?.startSeconds,
    entry?.projectileSourceEntry?.hook?.runtimeBinding?.startSeconds,
    ...(includeProjectileSourcePfxTiming ? [entry?.projectileSourceEntry?.pfxBindingProfile?.startSeconds] : []),
    entry?.projectileSourceEntry?.projectile?.runtimeBinding?.startSeconds,
    ...(entry?.hook?.runtimeBinding?.timelineTimes || []),
    ...(includePfxProfileTiming ? entry?.pfxBindingProfile?.timelineTimes || [] : []),
    ...(entry?.projectile?.runtimeBinding?.timelineTimes || []),
    ...(includeProjectileSourcePfxTiming ? entry?.projectileSourceEntry?.pfxBindingProfile?.timelineTimes || [] : []),
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map((value) => value.toFixed(3));
  return [...new Set(times)].join(",");
}

function runtimeEffectCff0EntriesForItem(item = activeManifestItem) {
  const entries = [];
  const seen = new Set();
  for (const row of cff0EffectInstanceRowsForItem(item)) {
    const resourcePaths = runtimeEffectCff0ResourcePaths(row, item);
    const actionKeys = runtimeEffectCff0ActionKeys(row);
    const startTimes = runtimeEffectCff0StartSeconds(row);
    if (!resourcePaths.length || !actionKeys.length || !startTimes.length) continue;
    for (const resourcePath of resourcePaths) {
      const cff0ProjectileBinding = runtimeEffectCff0ProjectileBinding(row, resourcePath, item);
      const bindingTarget = cff0ProjectileBinding?.bindingTarget || runtimeEffectCff0BindingTarget(row, item);
      if (!bindingTarget) continue;
      for (const startSeconds of runtimeEffectCff0StartSeconds(row)) {
        const key = `${row.id || row.effectToken || ""}\t${resourcePath}\t${bindingTarget.kind}\t${bindingTarget.boneToken || ""}\t${startSeconds}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const pfxItem = runtimeEffectPfxByPath.get(resourcePath);
        if (!pfxItem) continue;
        const effectToken = row.effectToken || resourcePath.split("/").pop()?.replace(/\.pfx$/i, "") || resourcePath;
        entries.push({
          hook: {
            id: `cff0-effect-instance:${row.id || row.effectToken || resourcePath}`,
            token: effectToken,
            effectToken,
            boneToken: bindingTarget.boneToken || "",
            runtimeBinding: {
              kind: bindingTarget.kind,
              boneToken: bindingTarget.boneToken || "",
              evidence: "cff0-resolved-effect-instance",
              startSeconds,
              timelineTimes: startSeconds !== null ? [startSeconds] : [],
            },
          },
          pfxItem,
          bindingTarget,
          sourceKind: "cff0-effect-instance",
          effectToken,
          actionKeys,
          projectile: cff0ProjectileBinding?.projectile || null,
          projectileSourceEntry: cff0ProjectileBinding?.impact ? runtimeEffectCff0ProjectileSourceEntry(cff0ProjectileBinding) : null,
        });
      }
    }
  }
  return entries;
}

function runtimeEffectPreviewCandidateDiagnostics(entryContext, animation = selectedAnimation()) {
  if (!entryContext?.bindingTarget) {
    return {
      shouldPreview: false,
      nativeVisibilityAllowed: false,
      shadergraphItems: [],
      previewShadergraphItems: [],
      hasRenderableMaterial: false,
      pfxRuntimeEvidence: { allowed: false, blockReason: "missing-binding-target" },
      previewBlockReason: "missing-binding-target",
    };
  }

  const nativePrimitive = Boolean(entryContext?.pfxItem?.nativePrimitive);
  const shadergraphItems = nativePrimitive
    ? []
    : entryContext.shadergraphItems || runtimeEffectShadergraphItemsForPfx([entryContext.pfxItem]);
  const enrichedContext = { ...entryContext, shadergraphItems };
  const previewShadergraphItems = nativePrimitive
    ? []
    : entryContext.previewShadergraphItems || runtimeEffectPreviewShadergraphItems(shadergraphItems, entryContext.pfxItem, enrichedContext);
  const previewContext = { ...enrichedContext, previewShadergraphItems };
  const animationBlockReason = runtimeEffectPreviewAnimationBlockReason(previewContext, animation);
  const spatialBlockReason = runtimeEffectSpatialBlockReason(previewContext);
  const projectileRuntimeCoverage = runtimeEffectProjectileRuntimeCoverage(previewContext, animation);
  const nativeVisibilityAllowed = runtimeEffectNativeVisibilityAllowed(previewContext);
  const hasRenderableMaterial =
    nativePrimitive || runtimeEffectPreviewHasRenderableMaterial(previewShadergraphItems, entryContext.pfxItem, previewContext);
  const pfxRuntimeEvidence = runtimeEffectPfxRuntimeEvidence(previewContext);
  const shouldPreview = !animationBlockReason && nativeVisibilityAllowed && hasRenderableMaterial && pfxRuntimeEvidence.allowed;
  let previewBlockReason = "previewable";
  if (animationBlockReason === "no-spatial-evidence" && projectileRuntimeCoverage === "projectile-runtime-current-action") {
    previewBlockReason = "projectile-runtime-covered";
  } else if (animationBlockReason) previewBlockReason = animationBlockReason;
  else if (!nativeVisibilityAllowed) previewBlockReason = "native-visibility";
  else if (!hasRenderableMaterial) previewBlockReason = "no-renderable-material";
  else if (!pfxRuntimeEvidence.allowed) previewBlockReason = pfxRuntimeEvidence.blockReason;

  return {
    shouldPreview,
    animationBlockReason,
    spatialBlockReason,
    projectileRuntimeCoverage,
    nativeVisibilityAllowed,
    shadergraphItems,
    previewShadergraphItems,
    hasRenderableMaterial,
    pfxRuntimeEvidence,
    previewBlockReason,
  };
}

function runtimeEffectHookResourceDiagnostics(hook, item = activeManifestItem) {
  return (hook?.resourcePaths || []).map((resourcePath) => ({
    resourcePath,
    renderableEvidence: runtimeEffectHookHasRenderableResourceEvidence(hook),
    skinMatch: runtimeEffectResourcePathMatchesActiveSkin(hook, resourcePath, item),
    hasPfx: runtimeEffectPfxByPath.has(resourcePath),
  }));
}

function runtimeEffectHookResourceStatus(hook, item = activeManifestItem) {
  const diagnostics = runtimeEffectHookResourceDiagnostics(hook, item);
  return {
    diagnostics,
    hasRenderableEvidence: runtimeEffectHookHasRenderableResourceEvidence(hook),
    hasPfx: diagnostics.some((row) => row.hasPfx),
    hasSkinMatchedPfx: diagnostics.some((row) => row.hasPfx && row.skinMatch),
    hasSkinMismatchedPfx: diagnostics.some((row) => row.hasPfx && !row.skinMatch),
  };
}

function runtimeEffectMissingResourcePreviewBlockReason(hook, bindingTarget, item = activeManifestItem) {
  if (!bindingTarget) return "missing-binding-target";
  const status = runtimeEffectHookResourceStatus(hook, item);
  if (status.hasSkinMismatchedPfx && !status.hasSkinMatchedPfx) return "skin-mismatch";
  return "missing-pfx-resource";
}

function runtimeEffectPreviewEntries(item = activeManifestItem) {
  const entries = [];
  const seen = new Set();
  const animation = selectedAnimation();
  const pushEntry = ({
    hook,
    pfxItem,
    bindingTarget,
    effectToken,
    sourceKind,
    actionKeys = [],
    projectile = null,
    projectileSourceEntry = null,
    projectileLateralOffset = 0,
  }) => {
    const nativePrimitive = Boolean(pfxItem.nativePrimitive);
    const pfxBindingProfile = runtimeEffectPfxBindingProfileForEntry(pfxItem, hook);
    const shadergraphItems = nativePrimitive ? [] : runtimeEffectShadergraphItemsForPfx([pfxItem]);
    const entryContext = {
      hook,
      pfxItem,
      pfxBindingProfile,
      bindingTarget,
      sourceKind,
      effectToken: effectToken || pfxItem.relativePath,
      actionKeys,
      projectile,
      projectileSourceEntry,
    };
    if (!runtimeEffectNativeVisibilityAllowed(entryContext)) return null;
    const previewShadergraphItems = nativePrimitive
      ? []
      : runtimeEffectPreviewShadergraphItems(shadergraphItems, pfxItem, entryContext);
    const diagnostics = runtimeEffectPreviewCandidateDiagnostics({ ...entryContext, shadergraphItems, previewShadergraphItems }, animation);
    if (!diagnostics.shouldPreview) return null;
    const localPositionKey = bindingTarget?.localPosition?.toArray?.().join(",") || "";
    const lateralOffsetKey = Number.isFinite(Number(bindingTarget?.lateralOffset)) ? Number(bindingTarget.lateralOffset) : "";
    const timingKey = runtimeEffectPreviewTimingKey(entryContext);
    const key = `${bindingTarget?.kind || ""}\t${bindingTarget?.boneIndex ?? ""}\t${bindingTarget?.boneToken || ""}\t${localPositionKey}\t${lateralOffsetKey}\t${timingKey}\t${effectToken || ""}\t${pfxItem.relativePath}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const entry = {
      hook,
      pfxItem,
      pfxBindingProfile,
      shadergraphItems,
      previewShadergraphItems,
      bindingTarget,
      boneIndex: bindingTarget?.boneIndex ?? null,
      projectile,
      projectileSourceEntry,
      projectileLateralOffset: Number.isFinite(Number(projectileLateralOffset))
        ? Number(projectileLateralOffset)
        : lateralOffsetKey === ""
          ? 0
          : Number(lateralOffsetKey),
      sourceKind,
      effectToken: effectToken || pfxItem.relativePath,
      actionKeys,
      surfaceRecords: nativePrimitive ? [] : pfxItem.surfaceRecords || [],
      colors: nativePrimitive ? [] : runtimeEffectPreviewColors(previewShadergraphItems),
      previewTextures: nativePrimitive ? [] : runtimeEffectPreviewTextureItems(previewShadergraphItems, pfxItem, entryContext),
    };
    entries.push(entry);
    return entry;
  };
  for (const hook of runtimeEffectHooksForItem(item)) {
    const bindingTarget = runtimeEffectBindingTarget(hook, item);
    if (!bindingTarget) continue;
    const pfxItems = runtimeEffectPfxItemsForHooks([hook], item);
    for (const pfxItem of pfxItems) {
      const sourceKind = hook.sourceKind || "native-effect-hook";
      const effectToken = hook.effectToken || hook.token || pfxItem.relativePath;
      const candidateEntry = {
        hook,
        pfxItem,
        bindingTarget,
        sourceKind,
        effectToken,
        actionKeys: hook.actionKeys || [],
      };
      if (!runtimeEffectShouldPreviewForAnimation(candidateEntry, animation)) continue;
      const pushedEntry = pushEntry({
        hook,
        pfxItem,
        bindingTarget,
        sourceKind,
        effectToken,
        actionKeys: hook.actionKeys || [],
      });
      if (!pushedEntry && runtimeEffectNativePrimitivePreviewAllowed(candidateEntry)) {
        pushEntry({
          hook,
          pfxItem: runtimeEffectNativePrimitivePfxItemForHook(candidateEntry),
          bindingTarget,
          sourceKind,
          effectToken,
          actionKeys: hook.actionKeys || [],
        });
      }
    }
    if (!pfxItems.length && runtimeEffectNativePrimitivePreviewAllowed(hook)) {
      const pfxItem = runtimeEffectNativePrimitivePfxItemForHook(hook);
      const sourceKind = hook.sourceKind || "native-effect-hook";
      const effectToken = hook.effectToken || hook.token || pfxItem.relativePath;
      const candidateEntry = {
        hook,
        pfxItem,
        bindingTarget,
        sourceKind,
        effectToken,
        actionKeys: hook.actionKeys || [],
      };
      if (!runtimeEffectShouldPreviewForAnimation(candidateEntry, animation)) continue;
      pushEntry({
        hook,
        pfxItem,
        bindingTarget,
        sourceKind,
        effectToken,
        actionKeys: hook.actionKeys || [],
      });
    }
  }

  for (const entry of runtimeEffectDefinitionProjectileEntriesForItem(item)) {
    if (!runtimeEffectShouldPreviewForAnimation(entry, animation)) continue;
    pushEntry(entry);
  }

  for (const entry of runtimeEffectDefinitionNeighborhoodEntriesForItem(item)) {
    if (!runtimeEffectShouldPreviewForAnimation(entry, animation)) continue;
    pushEntry(entry);
  }

  for (const entry of runtimeEffectCff0EntriesForItem(item)) {
    if (!runtimeEffectShouldPreviewForAnimation(entry, animation)) continue;
    pushEntry(entry);
  }

  if (!ENABLE_INDEXED_PFX_EFFECT_PREVIEW) return runtimeEffectLimitedPreviewEntries(runtimeEffectDedupePreviewEntries(entries), animation);

  for (const pfxItem of runtimeEffectFallbackPfxItemsForItem(item)) {
    const effectToken = pfxItem.relativePath.split("/").pop()?.replace(/\.pfx$/i, "") || pfxItem.relativePath;
    const boneIndex = runtimeEffectFallbackBoneIndex(pfxItem, item);
    const bindingTarget = { kind: "bone", boneIndex, boneToken: boneIndex === 0 ? "Bone_Root" : "Bone_Weapon" };
    const entry = {
      hook: { id: `indexed-pfx:${pfxItem.relativePath}`, token: effectToken, effectToken, boneToken: boneIndex === 0 ? "Bone_Root" : "Bone_Weapon" },
      pfxItem,
      shadergraphItems: runtimeEffectShadergraphItemsForPfx([pfxItem]),
      bindingTarget,
      boneIndex,
      sourceKind: "indexed-pfx-resource",
      effectToken,
      colors: [],
      previewTextures: [],
    };
    if (!runtimeEffectShouldPreviewForAnimation(entry, animation)) continue;
    pushEntry({
      hook: entry.hook,
      pfxItem,
      bindingTarget,
      sourceKind: "indexed-pfx-resource",
      effectToken,
    });
    if (entries.length >= RUNTIME_EFFECT_PREVIEW_LIMIT) break;
  }
  return runtimeEffectLimitedPreviewEntries(runtimeEffectDedupePreviewEntries(entries), animation);
}

function syncEffectDiagnostics() {
  if (!effectDiagnosticSummary || !effectDiagnosticSwatches || !effectDiagnosticList) return;
  effectDiagnosticSwatches.replaceChildren();
  effectDiagnosticList.replaceChildren();

  if (!activeManifestItem) {
    if (effectDiagnosticBadge) effectDiagnosticBadge.textContent = "等待";
    effectDiagnosticSummary.textContent = "等待加载模型。";
    return;
  }

  const diagnostics = currentRuntimeEffectDiagnostics(activeManifestItem);
  const {
    hooks,
    pfxItems,
    definitionNeighborhoodRows,
    definitionNeighborhoodPfx,
    definitionNeighborhoodEntries,
    definitionNeighborhoodTimedEntries,
    cff0EffectRows,
    cff0EffectPfx,
    cff0ExpandedRows,
    cff0RuntimeResources,
    cff0NativeHookRows,
    cff0NativeActionRows,
    cff0NativeTimingRows,
    cff0ProjectileBindingRows,
    cff0ProjectileActionRows,
    cff0ProjectileBoneRows,
    cff0ProjectileTimingRows,
    cff0ResolvedResourceRows,
    cff0ResolvedActionRows,
    cff0ResolvedBindingRows,
    cff0ResolvedTimingRows,
    definitionProjectileItems,
    projectilePfxItems,
    shadergraphItems,
    textureHashes,
    materialRoles,
    inlineColors,
    unclassifiedSurfaceCount,
    surfaceRecordCount,
    pfxSurfaceRenderFamilySummary,
    pfxParameterProfileCount,
    pfxParameterProfileSummary,
    pfxEmitterRuntimeProfileCount,
    pfxEmitterRuntimeProfileSummary,
    pfxEmitterCallbackTargetSummary,
    pfxEmitterCallbackInputKindSummary,
    pfxEmitterCallbackLayoutEvidenceSummary,
    pfxEmitterResolverTableCompatibilitySummary,
    pfxEmitterCurrentBuildStatusSummary,
    pfxEmitterCurrentSemanticClassSummary,
    pfxEmitterCurrentConstantTargetSummary,
    pfxEmitterCurrentVectorTargetSummary,
    pfxEmitterPackedLiteralFloatCandidateTargetSummary,
    pfxEmitterCallbackResolutionStatusSummary,
    pfxChildEmitterRecordCount,
    pfxChildEmitterCallbackCount,
    pfxChildEmitterModeSummary,
    pfxChildEmitterCallbackResolutionStatusSummary,
    pfxChildEmitterCurrentSemanticClassSummary,
    pfxBindingProfileCount,
    pfxBindingProfileSummary,
    pfxNativeOptionSummary,
    uvGapCount,
    uvGapReasonSummary,
    uvGapInputSummary,
    uvRuntimeEvidenceCount,
    uvRuntimeEvidenceSummary,
    uvRuntimeFallbackCount,
    uvStaticPreviewCount,
    surfaceRejectCount,
    surfaceRejectSummary,
    blockedPreviewResourceCount,
    blockedPreviewSurfaceCount,
    blockedPreviewSurfaceSummary,
    projectileRuntimeCoverageSummary,
    currentActionPreviewSummary,
  } = diagnostics;

  if (effectDiagnosticBadge) {
    effectDiagnosticBadge.textContent = hooks.length
      ? `${hooks.length} 条`
      : pfxItems.length
        ? `${pfxItems.length} PFX`
        : definitionNeighborhoodRows.length
          ? `${definitionNeighborhoodRows.length} 候选`
          : `${cff0EffectRows.length} CFF0`;
  }
  if (!hooks.length && !pfxItems.length && !definitionNeighborhoodRows.length && !cff0EffectRows.length) {
    effectDiagnosticSummary.textContent = "暂无运行时特效链路。";
    return;
  }

  effectDiagnosticSummary.textContent = [
    hooks.length ? `${hooks.length} 条 native hook` : "native hook 缺失，仅诊断索引 PFX",
    currentActionPreviewSummary,
    `${pfxItems.length} 个 pfx`,
    definitionNeighborhoodRows.length ? `${definitionNeighborhoodRows.length} 条邻接 PFX 候选` : "",
    definitionNeighborhoodPfx.length ? `${definitionNeighborhoodPfx.length} 个邻接 PFX 资源` : "",
    definitionNeighborhoodEntries.length ? `${definitionNeighborhoodEntries.length} 条邻接 PFX runtime` : "",
    definitionNeighborhoodTimedEntries.length ? `${definitionNeighborhoodTimedEntries.length} 条邻接 PFX native 时机` : "",
    cff0EffectRows.length ? `${cff0EffectRows.length} 条 CFF0 实例` : "",
    cff0EffectPfx.length ? `${cff0EffectPfx.length} 个 CFF0 PFX` : "",
    cff0ExpandedRows ? `${cff0ExpandedRows} 条 CFF0 引用展开` : "",
    cff0RuntimeResources.length ? `${cff0RuntimeResources.length} 个 CFF0 runtime 资源` : "",
    cff0NativeHookRows ? `${cff0NativeHookRows} 条 CFF0 native hook` : "",
    cff0NativeActionRows ? `${cff0NativeActionRows} 条 CFF0 native action` : "",
    cff0NativeTimingRows ? `${cff0NativeTimingRows} 条 CFF0 native 时机` : "",
    cff0ProjectileBindingRows ? `${cff0ProjectileBindingRows} 条 CFF0 projectile binding` : "",
    cff0ProjectileActionRows ? `${cff0ProjectileActionRows} 条 CFF0 projectile action` : "",
    cff0ProjectileBoneRows ? `${cff0ProjectileBoneRows} 条 CFF0 projectile 发射点` : "",
    cff0ProjectileTimingRows ? `${cff0ProjectileTimingRows} 条 CFF0 projectile 时机` : "",
    cff0ResolvedResourceRows || cff0ResolvedActionRows || cff0ResolvedBindingRows || cff0ResolvedTimingRows
      ? `CFF0 resolved 覆盖：资源 ${cff0ResolvedResourceRows} / action ${cff0ResolvedActionRows} / 绑定 ${cff0ResolvedBindingRows} / 时机 ${cff0ResolvedTimingRows}`
      : "",
    `${shadergraphItems.length} 个 Surface`,
    `${surfaceRecordCount} 条 PFX Surface 记录`,
    pfxSurfaceRenderFamilySummary ? `PFX Surface 类型：${pfxSurfaceRenderFamilySummary}` : "",
    pfxParameterProfileCount
      ? `${pfxParameterProfileCount} 条 PFX 参数槽${pfxParameterProfileSummary ? `（${pfxParameterProfileSummary}）` : ""}`
      : "",
    pfxEmitterRuntimeProfileCount
      ? `${pfxEmitterRuntimeProfileCount} 条 PFX emitter Runtime${
          pfxEmitterRuntimeProfileSummary ? `（${pfxEmitterRuntimeProfileSummary}）` : ""
        }`
      : "",
    pfxEmitterCallbackTargetSummary ? `PFX callback 目标：${pfxEmitterCallbackTargetSummary}` : "",
    pfxEmitterCallbackInputKindSummary ? `PFX callback 输入：${pfxEmitterCallbackInputKindSummary}` : "",
    pfxEmitterCallbackLayoutEvidenceSummary ? `PFX callback 布局：${pfxEmitterCallbackLayoutEvidenceSummary}` : "",
    pfxEmitterResolverTableCompatibilitySummary ? `PFX resolver 表：${pfxEmitterResolverTableCompatibilitySummary}` : "",
    pfxEmitterCurrentBuildStatusSummary ? `PFX 当前表：${pfxEmitterCurrentBuildStatusSummary}` : "",
    pfxEmitterCurrentSemanticClassSummary ? `PFX callback 语义：${pfxEmitterCurrentSemanticClassSummary}` : "",
    pfxEmitterCurrentConstantTargetSummary ? `PFX callback 常量：${pfxEmitterCurrentConstantTargetSummary}` : "",
    pfxEmitterCurrentVectorTargetSummary ? `PFX callback 向量：${pfxEmitterCurrentVectorTargetSummary}` : "",
    pfxEmitterPackedLiteralFloatCandidateTargetSummary
      ? `PFX packed 数值候选：${pfxEmitterPackedLiteralFloatCandidateTargetSummary}`
      : "",
    pfxEmitterCallbackResolutionStatusSummary ? `PFX callback 解析：${pfxEmitterCallbackResolutionStatusSummary}` : "",
    pfxChildEmitterRecordCount
      ? `${pfxChildEmitterRecordCount} 条 PFX 子层 emitter / ${pfxChildEmitterCallbackCount} 个子层 callback${
          pfxChildEmitterModeSummary ? `（${pfxChildEmitterModeSummary}）` : ""
        }`
      : "",
    pfxChildEmitterCallbackResolutionStatusSummary ? `PFX 子层 callback 解析：${pfxChildEmitterCallbackResolutionStatusSummary}` : "",
    pfxChildEmitterCurrentSemanticClassSummary ? `PFX 子层 callback 语义：${pfxChildEmitterCurrentSemanticClassSummary}` : "",
    pfxBindingProfileCount
      ? `${pfxBindingProfileCount} 条 PFX 绑定证据${pfxBindingProfileSummary ? `（${pfxBindingProfileSummary}）` : ""}`
      : "",
    pfxNativeOptionSummary ? `PFX native 参数：${pfxNativeOptionSummary}` : "",
    `${textureHashes.length} 个贴图 hash`,
    `${materialRoles.length} 类材质角色`,
    `${inlineColors.length} 个内联颜色`,
    `${unclassifiedSurfaceCount} 个待归类 Surface`,
    surfaceRejectCount ? `${surfaceRejectCount} 个卡片风险已拦截${surfaceRejectSummary ? `（${surfaceRejectSummary}）` : ""}` : "",
    blockedPreviewResourceCount
      ? `${blockedPreviewResourceCount} 个 runtime 资源待定位 / ${blockedPreviewSurfaceCount} 个 Surface 已拦截${
          blockedPreviewSurfaceSummary ? `（${blockedPreviewSurfaceSummary}）` : ""
        }`
      : "",
    projectileRuntimeCoverageSummary,
    uvGapCount
      ? `${uvGapCount} 个 UV 待还原${uvGapReasonSummary ? `（${uvGapReasonSummary}${uvGapInputSummary ? `；输入 ${uvGapInputSummary}` : ""}）` : ""}`
      : "",
    uvRuntimeEvidenceCount
      ? `${uvRuntimeEvidenceCount} 个 PFX UV 参数证据${uvRuntimeEvidenceSummary ? `（${uvRuntimeEvidenceSummary}）` : ""}`
      : "",
    uvRuntimeFallbackCount ? `${uvRuntimeFallbackCount} 个 UV 动态预览` : "",
    uvStaticPreviewCount ? `${uvStaticPreviewCount} 个 UV 静态预览` : "",
    definitionProjectileItems.length ? `${definitionProjectileItems.length} 个定义 projectile` : "",
    projectilePfxItems.length ? `${projectilePfxItems.length} 个索引 projectile PFX（无发射链路）` : "",
  ].filter(Boolean).join(" / ");

  for (const color of inlineColors.slice(0, 10)) {
    const swatch = document.createElement("span");
    swatch.className = "effect-color-swatch";
    swatch.title = color;
    swatch.style.setProperty("--effect-color", color);
    effectDiagnosticSwatches.appendChild(swatch);
  }

  for (const pfxItem of pfxItems.slice(0, 6)) {
    const item = document.createElement("div");
    item.className = "effect-resource-item";
    const title = document.createElement("strong");
    title.textContent = effectResourceTitle(pfxItem);
    const detail = document.createElement("span");
    const surfaceCount = Number(pfxItem.uniqueShadergraphRefCount) || Number(pfxItem.shadergraphRefCount) || 0;
    const hookText = (pfxItem.hookEffectTokens || []).slice(0, 3).join(" / ");
    const materialStatusText = materialStatusSummaryForPfx(pfxItem);
    detail.textContent = [
      `${surfaceCount} 个 Surface`,
      materialStatusText,
      hookText,
    ].filter(Boolean).join(" | ");
    item.append(title, detail);
    effectDiagnosticList.appendChild(item);
  }
}

function isRuntimeAttachmentSlot(slot) {
  const slotName = slot?.slotName || "";
  const bindToken = slot?.bindToken || "";
  if (!slotName || !bindToken) return false;
  return !/(Head|CenterMass)/i.test(slotName) && !/(head|spine|center|root)[A-Za-z0-9_]*_bnd/i.test(bindToken);
}

function runtimeAttachmentBindSlotsForItem(item = activeManifestItem) {
  return runtimeBindSlotsForItem(item).filter(isRuntimeAttachmentSlot);
}

function runtimeResolvedAttachmentBoneIndices(item = activeManifestItem) {
  const indices = new Set();
  for (const slot of runtimeAttachmentBindSlotsForItem(item)) {
    if (slot.bindingKind && slot.bindingKind !== "skeleton-bone") continue;
    if (slot.hashResolved === false) continue;
    const boneIndex = Number(slot.resolvedBoneIndex);
    if (Number.isInteger(boneIndex) && boneIndex >= 0) indices.add(boneIndex);
  }
  const runtimeAttachmentBoneItem = runtimeAttachmentBonesItem(item);
  for (const boneIndex of runtimeAttachmentBoneItem?.translationBoneIndices || []) {
    if (Number.isInteger(boneIndex) && boneIndex >= 0) indices.add(boneIndex);
  }
  return indices;
}

function runtimeTranslationUnsafeBoneIndices(item = activeManifestItem) {
  const indices = new Set();
  const runtimeAttachmentBoneItem = runtimeAttachmentBonesItem(item);
  for (const boneIndex of runtimeAttachmentBoneItem?.unsafeTranslationBoneIndices || []) {
    if (Number.isInteger(boneIndex) && boneIndex >= 0) indices.add(boneIndex);
  }
  return indices;
}

function hasRuntimeTranslationSafeBones(item = activeManifestItem) {
  return runtimeResolvedAttachmentBoneIndices(item).size > 0;
}

function distance3Array(left, right) {
  return Math.hypot(
    (Number(left?.[0]) || 0) - (Number(right?.[0]) || 0),
    (Number(left?.[1]) || 0) - (Number(right?.[1]) || 0),
    (Number(left?.[2]) || 0) - (Number(right?.[2]) || 0),
  );
}

function runtimeNativeFrameTranslationBoneIndices() {
  const indices = new Set();
  const bones = firstActiveSkinnedSkeletonBones();
  if (!activeObject || !activeAnimationClip || !bones.length || activeAnimationClip.trackCount !== bones.length) return indices;

  const cacheKey = `${activeAnimationClipKey}\t${activeAnimationSkeletonPath}\t${bones.length}`;
  if (activeObject.userData.runtimeNativeFrameTranslationBoneIndicesKey === cacheKey) {
    return activeObject.userData.runtimeNativeFrameTranslationBoneIndices || indices;
  }

  const baseFrame = readAnimationFamily3ClipFrame(activeAnimationClip, 0);
  for (const pose of baseFrame) {
    const bone = bones[pose.boneIndex];
    if (!bone || !Array.isArray(pose.translation) || !pose.translation.every(Number.isFinite)) continue;
    const basePosition = bone.userData.basePosition || bone.position.toArray();
    if (distance3Array(basePosition, pose.translation) <= RUNTIME_NATIVE_TRANSLATION_MATCH_TOLERANCE) {
      indices.add(pose.boneIndex);
    }
  }

  activeObject.userData.runtimeNativeFrameTranslationBoneIndicesKey = cacheKey;
  activeObject.userData.runtimeNativeFrameTranslationBoneIndices = indices;
  return indices;
}

function hasRuntimeAttachmentBindSlots(item = activeManifestItem) {
  return runtimeAttachmentBindSlotsForItem(item).length > 0;
}

function hasCompleteRuntimeBindingEvidence(item = activeManifestItem) {
  const configItem = runtimeBindingConfigItem(item);
  if (Array.isArray(configItem?.slots)) {
    return configItem.slots.every((slot) => slot.bindingKind && slot.bindingKind !== "unresolved");
  }
  return Boolean(runtimeSkinGraphItem(item)?.viewerEligible);
}

function attachmentOptionLabel(attachment) {
  const source = attachment.source === "attachment-animation" ? "动作匹配" : "命名匹配";
  return `${attachment.label || attachment.rel} (${source})`;
}

function attachmentStats() {
  if (activeAttachmentObjects.length) return ` | ${activeAttachmentObjects.length} 个附属资源`;
  if (activeAttachments.length) return ` | ${activeAttachments.length} 个可选附属`;
  return "";
}

function previewEffectMaterialName(name = "") {
  return /(swipe|trail|slash|guob|rotorBladeVFX)/i.test(name) || previewAnimatedEffectMaterialName(name);
}

function previewAnimatedEffectMaterialName(name = "") {
  return /(WaterShader.*Throne|Throne.*WaterShader|poseidonThrone)/i.test(name);
}

function meshMaterialNames(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.map((material) => material?.name || "").join(" ");
}

function previewNativeScaleMaterialName(name = "") {
  return /(catherine_summer\.summer_chair_mat|hero009_pirate\.pirate_props_mat|hero019_heli\.heli_mat|hero019_heli\.hero019_rotorBladeVFX_mat)\.shadergraph/i.test(
    name,
  );
}

function nativeScaleBoneIndicesForActiveObject() {
  if (!activeObject) return new Set();
  const cached = nativeScaleBoneIndicesByObject.get(activeObject);
  if (cached) return cached;

  const boneIndices = new Set();
  if (modelSkinId(activeManifestItem) === "Skye_Skin_Bike") {
    firstActiveSkinnedSkeletonBones().forEach((_, boneIndex) => boneIndices.add(boneIndex));
  }
  activeObject.traverse((child) => {
    if (!child.isSkinnedMesh || !previewNativeScaleMaterialName(meshMaterialNames(child))) return;
    const skinIndex = child.geometry?.getAttribute("skinIndex");
    const skinWeight = child.geometry?.getAttribute("skinWeight");
    if (!skinIndex || !skinWeight) return;

    const index = child.geometry.index;
    const count = index ? index.count : skinIndex.count;
    const components = Math.min(4, skinIndex.itemSize, skinWeight.itemSize);
    for (let cursor = 0; cursor < count; cursor += 1) {
      const vertexIndex = index ? index.getX(cursor) : cursor;
      for (let component = 0; component < components; component += 1) {
        const weight = Number(attributeComponent(skinWeight, vertexIndex, component)) || 0;
        const boneIndex = Math.round(attributeComponent(skinIndex, vertexIndex, component));
        if (weight > 0.001 && Number.isInteger(boneIndex) && boneIndex >= 0) boneIndices.add(boneIndex);
      }
    }
  });

  if (heroKeyForItem(activeManifestItem) === "Hero011") {
    firstActiveSkinnedSkeletonBones().forEach((bone, boneIndex) => {
      if (HERO011_STEALTH_BOX_BONE_NAMES.has(String(bone?.name || "").toUpperCase())) boneIndices.add(boneIndex);
    });
  }

  if (heroKeyForItem(activeManifestItem) === "SAW") {
    firstActiveSkinnedSkeletonBones().forEach((bone, boneIndex) => {
      if (String(bone?.name || "").toUpperCase() === SAW_KNIFE_BONE_NAME) boneIndices.add(boneIndex);
    });
  }

  nativeScaleBoneIndicesByObject.set(activeObject, boneIndices);
  return boneIndices;
}

function skyeBikeTransitionScaleProfile() {
  if (!activeObject) return null;
  const cached = skyeBikeTransitionScaleProfileByObject.get(activeObject);
  if (cached) return cached;

  const profile = {
    motorcycleRootBoneIndex: -1,
    inheritedScaleByBoneIndex: new Map(),
    hiddenGeometryStates: [],
  };
  firstActiveSkinnedSkeletonBones().forEach((bone, boneIndex) => {
    const boneName = String(bone?.name || "").toUpperCase();
    if (boneName === SKYE_BIKE_MOTORCYCLE_ROOT_BONE_NAME) profile.motorcycleRootBoneIndex = boneIndex;
    const inheritedScale = SKYE_BIKE_MOTO_INHERITED_SCALE_BY_BONE_NAME.get(boneName);
    if (inheritedScale) profile.inheritedScaleByBoneIndex.set(boneIndex, inheritedScale);
  });

  if (
    profile.motorcycleRootBoneIndex < 0 ||
    profile.inheritedScaleByBoneIndex.size !== SKYE_BIKE_MOTO_INHERITED_SCALE_BY_BONE_NAME.size
  ) {
    return null;
  }
  activeObject.traverse((child) => {
    if (!child.isSkinnedMesh) return;
    const geometry = child.geometry;
    const originalIndex = geometry?.getIndex();
    const skinIndex = geometry?.getAttribute("skinIndex");
    const skinWeight = geometry?.getAttribute("skinWeight");
    if (!originalIndex || !skinIndex || !skinWeight) return;

    const visibleIndices = [];
    for (let cursor = 0; cursor + 2 < originalIndex.count; cursor += 3) {
      let legacyTriangle = true;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertexIndex = originalIndex.getX(cursor + corner);
        let dominantComponent = 0;
        for (let component = 1; component < Math.min(4, skinWeight.itemSize); component += 1) {
          if (attributeComponent(skinWeight, vertexIndex, component) > attributeComponent(skinWeight, vertexIndex, dominantComponent)) {
            dominantComponent = component;
          }
        }
        const boneIndex = Math.round(attributeComponent(skinIndex, vertexIndex, dominantComponent));
        if (!profile.inheritedScaleByBoneIndex.has(boneIndex)) {
          legacyTriangle = false;
          break;
        }
      }
      if (!legacyTriangle) {
        visibleIndices.push(originalIndex.getX(cursor), originalIndex.getX(cursor + 1), originalIndex.getX(cursor + 2));
      }
    }

    if (visibleIndices.length === originalIndex.count) return;
    const IndexArray = originalIndex.array.constructor;
    profile.hiddenGeometryStates.push({
      geometry,
      originalIndex,
      motorcycleIndex: new THREE.BufferAttribute(new IndexArray(visibleIndices), 1),
    });
  });
  skyeBikeTransitionScaleProfileByObject.set(activeObject, profile);
  return profile;
}

function syncSkyeBikeTransitionLegacyGeometry(profile, hidden) {
  for (const state of profile?.hiddenGeometryStates || []) {
    const targetIndex = hidden ? state.motorcycleIndex : state.originalIndex;
    if (state.geometry.getIndex() !== targetIndex) state.geometry.setIndex(targetIndex);
  }
}

function skyeBikeTransitionInheritedScaleByBoneIndex(frame, nextFrame, alpha) {
  const animationPath = selectedAnimation()?.targetRelativePath || "";
  if (modelSkinId(activeManifestItem) !== "Skye_Skin_Bike") return null;

  const profile = skyeBikeTransitionScaleProfile();
  if (!profile) return null;
  if (!SKYE_BIKE_TRANSITION_ANIMATION_PATHS.has(animationPath)) {
    syncSkyeBikeTransitionLegacyGeometry(profile, false);
    return null;
  }
  const rootIndex = profile?.motorcycleRootBoneIndex;
  if (!Number.isInteger(rootIndex) || !frame[rootIndex] || !nextFrame[rootIndex]) {
    syncSkyeBikeTransitionLegacyGeometry(profile, false);
    return null;
  }
  const motorcyclePose = interpolateNativePose(frame[rootIndex], nextFrame[rootIndex], alpha);
  const motorcycleVisible = nativeScaleVisible(motorcyclePose.scale);
  syncSkyeBikeTransitionLegacyGeometry(profile, motorcycleVisible);
  return motorcycleVisible ? profile.inheritedScaleByBoneIndex : null;
}

function isPreviewEffectMesh(mesh) {
  return previewEffectMaterialName(mesh.name || "") || previewEffectMaterialName(meshMaterialNames(mesh));
}

function attributeComponent(attribute, index, component) {
  if (component === 0) return attribute.getX(index);
  if (component === 1) return attribute.getY(index);
  if (component === 2) return attribute.getZ(index);
  if (component === 3) return attribute.getW(index);
  return 0;
}

function activeGeometryDrawRange(geometry, itemCount) {
  const start = Math.max(0, Math.min(Number(geometry?.drawRange?.start) || 0, itemCount));
  const requestedCount = Number(geometry?.drawRange?.count);
  const count = Number.isFinite(requestedCount) ? Math.max(0, Math.min(requestedCount, itemCount - start)) : itemCount - start;
  return { start, count };
}

function activeModelFormProfile(item = activeManifestItem) {
  return modelFormProfileForSkinId(modelSkinId(item));
}

function activeModelFormRuntime() {
  return activeObject?.userData?.modelFormRuntime || null;
}

function prepareActiveModelFormRuntime(item = activeManifestItem) {
  const profile = activeModelFormProfile(item);
  if (!activeObject || !isAnimationFormat() || !profile) return null;
  if (profile.strategy === "animation") return { profile, entries: [], mode: profile.defaultMode };
  if (profile.strategy !== "geometry") return null;

  const alternateHashes = new Set(profile.alternateBoneHashes);
  const bones = firstActiveSkinnedSkeletonBones();
  const boneIndexByBone = new Map();
  const alternateRootBoneIndices = new Set();
  bones.forEach((bone, boneIndex) => {
    boneIndexByBone.set(bone, boneIndex);
    if (alternateHashes.has(String(bone?.name || "").toUpperCase())) alternateRootBoneIndices.add(boneIndex);
  });
  if (alternateRootBoneIndices.size !== alternateHashes.size) return null;

  const alternateBoneIndices = new Set();
  bones.forEach((bone, boneIndex) => {
    let ancestor = bone;
    while (ancestor) {
      const ancestorIndex = boneIndexByBone.get(ancestor);
      if (alternateRootBoneIndices.has(ancestorIndex)) {
        alternateBoneIndices.add(boneIndex);
        break;
      }
      ancestor = ancestor.parent;
    }
  });

  const preparedEntries = [];
  let invalid = false;
  let primaryIndexCount = 0;
  let alternateIndexCount = 0;
  activeObject.traverse((mesh) => {
    if (invalid || !mesh.isSkinnedMesh || !mesh.geometry?.index) return;
    const split = splitModelFormIndexArrays({
      index: mesh.geometry.index,
      skinIndex: mesh.geometry.getAttribute("skinIndex"),
      skinWeight: mesh.geometry.getAttribute("skinWeight"),
      alternateBoneIndices,
    });
    if (!split) {
      invalid = true;
      return;
    }
    primaryIndexCount += split.primary.length;
    alternateIndexCount += split.alternate.length;
    preparedEntries.push({ mesh, split });
  });
  if (invalid || !preparedEntries.length || !primaryIndexCount || !alternateIndexCount) return null;

  const entries = preparedEntries.map(({ mesh, split }) => {
    mesh.geometry = mesh.geometry.clone();
    return {
      mesh,
      indices: {
        original: new THREE.BufferAttribute(split.original, 1),
        primary: new THREE.BufferAttribute(split.primary, 1),
        alternate: new THREE.BufferAttribute(split.alternate, 1),
      },
    };
  });
  return { profile, entries, mode: profile.defaultMode };
}

function syncModelFormControls() {
  const runtime = activeModelFormRuntime();
  modelFormControls.hidden = !runtime;
  modelFormSelect.disabled = !runtime;
  modelFormSelect.replaceChildren();
  if (!runtime) {
    modelFormSelect.appendChild(new Option("该模型没有可用形态", ""));
    refreshSelectMenus();
    return;
  }

  const { profile } = runtime;
  if (profile.supportsFollowAnimation) modelFormSelect.appendChild(new Option("跟随动作", MODEL_FORM_MODE.FOLLOW));
  modelFormSelect.appendChild(new Option(profile.primaryLabel, MODEL_FORM_MODE.PRIMARY));
  modelFormSelect.appendChild(new Option(profile.alternateLabel, MODEL_FORM_MODE.ALTERNATE));
  if (profile.strategy === "geometry") {
    modelFormSelect.appendChild(new Option("同时显示（原始资源）", MODEL_FORM_MODE.BOTH));
  }
  modelFormSelect.value = runtime.mode;
  refreshSelectMenus();
}

function syncModelFormGeometry() {
  const runtime = activeModelFormRuntime();
  if (!runtime) return;
  const indexKey =
    runtime.mode === MODEL_FORM_MODE.PRIMARY
      ? "primary"
      : runtime.mode === MODEL_FORM_MODE.ALTERNATE
        ? "alternate"
        : "original";
  for (const entry of runtime.entries) {
    entry.mesh.geometry.setIndex(entry.indices[indexKey]);
    entry.mesh.geometry.boundingBox = null;
    entry.mesh.geometry.boundingSphere = null;
    delete entry.mesh.userData.previewDominantSkinJointIndex;
    delete entry.mesh.userData.previewSkinJointIndices;
  }
  delete activeObject.userData.rootDirectDominantSkinJointCounts;
  nativeScaleBoneIndicesByObject.delete(activeObject);
  activeObject.updateMatrixWorld(true);
}

function selectModelFormInspectionAnimation(path) {
  if (!path) return false;
  const animationIndex = activeAnimations.findIndex((animation) => animation.targetRelativePath === path);
  if (animationIndex < 0) return false;
  animationSelect.value = String(animationIndex);
  manualAnimationTime = 0;
  poseLoopToggle.checked = true;
  poseClock.start();
  refreshSelectMenus();
  syncAnimationStats();
  return true;
}

function selectModelFormMode(mode) {
  const runtime = activeModelFormRuntime();
  if (!runtime) return;
  runtime.mode = mode;
  modelFormSelect.value = mode;
  syncModelFormGeometry();

  if (mode === MODEL_FORM_MODE.PRIMARY) {
    selectModelFormInspectionAnimation(runtime.profile.primaryAnimationPath);
  } else if (mode === MODEL_FORM_MODE.ALTERNATE) {
    selectModelFormInspectionAnimation(runtime.profile.alternateAnimationPath);
  } else if (mode === MODEL_FORM_MODE.BOTH) {
    poseLoopToggle.checked = false;
    applyAnimationPose(0);
  } else {
    syncAnimationStats();
  }

  syncPreviewEffectVisibility();
  syncBaseStats();
  frameObject(activeObject, { resetCamera: true });
  refreshSelectMenus();
}

function dominantSkinJointIndex(mesh) {
  if (Object.hasOwn(mesh.userData, "previewDominantSkinJointIndex")) return mesh.userData.previewDominantSkinJointIndex;
  const skinIndex = mesh.geometry?.getAttribute("skinIndex");
  const skinWeight = mesh.geometry?.getAttribute("skinWeight");
  if (!skinIndex || !skinWeight) {
    mesh.userData.previewDominantSkinJointIndex = null;
    return null;
  }

  const scores = new Map();
  const index = mesh.geometry.index;
  const count = index ? index.count : skinIndex.count;
  for (let cursor = 0; cursor < count; cursor += 1) {
    const vertexIndex = index ? index.getX(cursor) : cursor;
    const components = Math.min(4, skinIndex.itemSize, skinWeight.itemSize);
    for (let component = 0; component < components; component += 1) {
      const jointIndex = Math.round(attributeComponent(skinIndex, vertexIndex, component));
      const weight = Number(attributeComponent(skinWeight, vertexIndex, component)) || 0;
      if (!Number.isInteger(jointIndex) || weight <= 0) continue;
      scores.set(jointIndex, (scores.get(jointIndex) || 0) + weight);
    }
  }

  let bestJointIndex = null;
  let bestScore = 0;
  for (const [jointIndex, score] of scores) {
    if (score <= bestScore) continue;
    bestJointIndex = jointIndex;
    bestScore = score;
  }
  mesh.userData.previewDominantSkinJointIndex = bestJointIndex;
  return bestJointIndex;
}

function skinJointIndices(mesh) {
  if (mesh.userData.previewSkinJointIndices) return mesh.userData.previewSkinJointIndices;
  const skinIndex = mesh.geometry?.getAttribute("skinIndex");
  const skinWeight = mesh.geometry?.getAttribute("skinWeight");
  const indices = new Set();
  if (!skinIndex || !skinWeight) {
    mesh.userData.previewSkinJointIndices = indices;
    return indices;
  }

  const index = mesh.geometry.index;
  const count = index ? index.count : skinIndex.count;
  const components = Math.min(4, skinIndex.itemSize, skinWeight.itemSize);
  for (let cursor = 0; cursor < count; cursor += 1) {
    const vertexIndex = index ? index.getX(cursor) : cursor;
    for (let component = 0; component < components; component += 1) {
      if ((Number(attributeComponent(skinWeight, vertexIndex, component)) || 0) <= 0) continue;
      const jointIndex = Math.round(attributeComponent(skinIndex, vertexIndex, component));
      if (Number.isInteger(jointIndex) && jointIndex >= 0) indices.add(jointIndex);
    }
  }
  mesh.userData.previewSkinJointIndices = indices;
  return indices;
}

function runtimeFormBoneIndices(item = activeManifestItem) {
  if (!activeObject) return new Set();
  const cached = runtimeFormBoneIndicesByObject.get(activeObject);
  if (cached) return cached;

  const attachmentBones = runtimeAttachmentBonesItem(item);
  const indices = new Set(
    resolveFormBoneIndices({
      inferredBoneIndices: attachmentBones?.inferredTranslationBoneIndices,
      visibilityRows: runtimeAttachmentVisibilityRowsForItem(item),
      evidenceRows: attachmentBones?.evidence,
    }),
  );
  runtimeFormBoneIndicesByObject.set(activeObject, indices);
  return indices;
}

function meshMaterialNameSet(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return new Set(materials.map((material) => material?.name || "").filter(Boolean));
}

function setsIntersect(left, right) {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function runtimeFormBoneVisible(boneIndex, timeSeconds = manualAnimationTime) {
  const pose = nativeEffectPoseByBoneIndex(timeSeconds)?.get(boneIndex);
  const bone = firstActiveSkinnedSkeletonBones()[boneIndex];
  return resolveFormBoneVisibility({
    scale: pose?.scale || bone?.scale?.toArray() || [],
    translation: pose?.translation || bone?.position?.toArray() || [],
    hasScaleTrack: nativeTrackHasScaleKeys(boneIndex),
  });
}

function syncPreviewFormVisibility() {
  if (!activeObject) return;
  const modelFormRuntime = activeModelFormRuntime();
  if (
    modelFormRuntime?.profile.strategy === "geometry" &&
    modelFormRuntime.mode !== MODEL_FORM_MODE.FOLLOW
  ) {
    return;
  }
  const formBoneIndices = runtimeFormBoneIndices();
  if (!formBoneIndices.size) return;

  const visibleBoneIndices = new Set();
  for (const boneIndex of formBoneIndices) {
    if (runtimeFormBoneVisible(boneIndex)) visibleBoneIndices.add(boneIndex);
  }

  const formMeshes = [];
  const formMaterialNames = new Set();
  const activeFormMaterialNames = new Set();
  activeObject.traverse((child) => {
    if (!child.isSkinnedMesh || isPreviewEffectMesh(child)) return;
    const state = resolveFormMeshVisibility({
      meshBoneIndices: skinJointIndices(child),
      formBoneIndices,
      visibleBoneIndices,
      dominantBoneIndex: dominantSkinJointIndex(child),
    });
    if (!state) return;

    child.visible = state.visible;
    formMeshes.push(child);
    for (const name of meshMaterialNameSet(child)) {
      formMaterialNames.add(name);
      if (state.alternateActive) activeFormMaterialNames.add(name);
    }
  });

  if (!formMeshes.length) return;
  const formMeshSet = new Set(formMeshes);
  activeObject.traverse((child) => {
    if (!child.isMesh || formMeshSet.has(child) || isPreviewEffectMesh(child)) return;
    const materialNames = meshMaterialNameSet(child);
    if (!setsIntersect(materialNames, formMaterialNames)) return;
    child.visible = !setsIntersect(materialNames, activeFormMaterialNames);
  });
}

function nativeTrackHasScaleKeys(boneIndex) {
  const mask = activeAnimationClip?.trackMasks?.[boneIndex];
  return Number.isInteger(mask) && (mask & NATIVE_SCALE_MASK) !== 0;
}

function nativeEffectPoseByBoneIndex(timeSeconds = manualAnimationTime) {
  if (!activeAnimationClip) return null;
  const poseKey = `${activeAnimationClipKey}\t${Number(timeSeconds).toFixed(4)}`;
  if (activeEffectScalePoseKey !== poseKey) {
    activeEffectScalePoseKey = poseKey;
    activeEffectScalePose = nativeClipPoseByBoneIndex(activeAnimationClip, timeSeconds);
  }
  return activeEffectScalePose;
}

function nativeScaleVisible(scale) {
  if (!Array.isArray(scale) || !scale.length) return false;
  const maxScale = Math.max(...scale.map((value) => Math.abs(Number(value) || 0)));
  return maxScale >= PREVIEW_EFFECT_SCALE_VISIBLE_THRESHOLD;
}

function runtimeAttachmentVisibilityBoneVisible(boneIndex, timeSeconds = manualAnimationTime, animation = selectedAnimation()) {
  if (!Number.isInteger(boneIndex) || !animation) return null;
  const rows = runtimeAttachmentVisibilityRowsForAnimation(animation).filter((row) => Number(row.boneIndex) === boneIndex);
  if (!rows.length) return null;
  const duration = animationDuration(animation);
  const localTime = duration > 0 ? (((Number(timeSeconds) || 0) % duration) + duration) % duration : Math.max(0, Number(timeSeconds) || 0);
  for (const row of rows) {
    if (row.visibilityStatus === "hidden-scale-track") continue;
    if (row.visibilityStatus === "always-visible-scale-track") return true;
    for (const window of row.visibleWindows || []) {
      const startSeconds = Number(window.startSeconds);
      const endSeconds = Number(window.endSeconds);
      if (Number.isFinite(startSeconds) && Number.isFinite(endSeconds) && localTime >= startSeconds && localTime < endSeconds) return true;
    }
  }
  return false;
}

function animatedEffectMeshVisible(mesh) {
  const boneIndex = dominantSkinJointIndex(mesh);
  if (!Number.isInteger(boneIndex)) return false;
  if (runtimeFormBoneIndices().has(boneIndex)) return runtimeFormBoneVisible(boneIndex);
  const manifestVisible = runtimeAttachmentVisibilityBoneVisible(boneIndex);
  if (manifestVisible != null) return manifestVisible;
  if (!nativeTrackHasScaleKeys(boneIndex)) return false;
  const pose = nativeEffectPoseByBoneIndex();
  return nativeScaleVisible(pose?.get(boneIndex)?.scale);
}

function syncPreviewEffectVisibility() {
  if (!activeObject) return;
  syncPreviewFormVisibility();
  activeObject.traverse((child) => {
    if (child.isMesh && isPreviewEffectMesh(child)) {
      const boneIndex = dominantSkinJointIndex(child);
      const isFormDrivenMesh = runtimeFormBoneIndices().has(boneIndex);
      const isActionDrivenEmbeddedMesh = previewAnimatedEffectMaterialName(child.name || "") || previewAnimatedEffectMaterialName(meshMaterialNames(child));
      child.visible = (isFormDrivenMesh || isActionDrivenEmbeddedMesh || effectsToggle.checked) && animatedEffectMeshVisible(child);
    }
  });
  for (const preview of activeRuntimeEffectObjects) {
    const activity = runtimeEffectPreviewActivity(preview.userData.entry, runtimeEffectElapsed);
    preview.visible = effectsToggle.checked && activity.opacity > 0.02;
  }
}

function renderStats() {
  modelStats.textContent = [activeBaseStatsText, activeAnimationStatsText].filter(Boolean).join(" | ");
}

function syncBaseStats() {
  if (!activeObject) return;
  const stats = meshStats(activeObject);
  const sizeText = activeSourceSize == null ? "" : ` | ${formatBytes(activeSourceSize)}`;
  activeBaseStatsText = `${stats.vertices.toLocaleString()} 顶点 | ${stats.triangles.toLocaleString()} 三角面${sizeText}`;
  renderStats();
  syncEffectDiagnostics();
}

function animationBindingKey(item) {
  return item?.rel || "";
}

function animationActionKeyLabel(actionKey) {
  const key = String(actionKey || "");
  if (key.startsWith("ability01")) return "一技能";
  if (key.startsWith("ability02")) return "二技能";
  if (key.startsWith("ability03")) return "三技能";
  if (key === "attack_alt") return "变式普攻";
  if (key === "attack_crit") return "暴击";
  if (key.startsWith("attack")) return "普攻";
  if (key === "withdraw") return "回城";
  return "";
}

function animationOptionLabel(animation) {
  const label = animation.label || animation.targetRelativePath || "Animation";
  const duration = animation.duration == null ? "" : `${Number(animation.duration).toFixed(2)} 秒`;
  const fps = animation.fps == null ? "" : `${animation.fps} 帧/秒`;
  const source =
    animation.bindingSource === "skin" || animation.bindingSource === "specific"
      ? "皮肤动作"
      : animation.bindingSource === "base"
        ? "基础动作"
        : animation.bindingSource;
  const suffix = [duration, fps, source].filter(Boolean).join(" ");
  const localizedLabel = localizeAnimationName(label);
  const actionPrefix = animationActionKeyLabel(animation.actionKey);
  const displayLabel = actionPrefix && !localizedLabel.includes(actionPrefix) ? `${actionPrefix} / ${localizedLabel}` : localizedLabel;
  return suffix ? `${displayLabel} (${suffix})` : displayLabel;
}

function defaultAnimationIndex(animations) {
  const exactIdle = animations.findIndex((animation) => animation.label === "Idle" && animation.actionKey === "idle");
  if (exactIdle >= 0) return exactIdle;

  const pathIdle = animations.findIndex((animation) => /(^|[._/-])idle\.anim$/i.test(animation.targetRelativePath || ""));
  if (pathIdle >= 0) return pathIdle;

  const actionIdle = animations.findIndex((animation) => animation.actionKey === "idle");
  if (actionIdle >= 0) return actionIdle;

  const idleLike = animations.findIndex((animation) => /(^|[_\s-])idle($|[_\s-])/i.test(animation.label || ""));
  return idleLike >= 0 ? idleLike : 0;
}

function selectedAnimation() {
  return activeAnimations[Number(animationSelect.value)] || null;
}

function decodeFloat16(value) {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function parseAnimationFamily3Clip(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 36) throw new Error("animation buffer too small");
  const entryCount = view.getUint32(0, true);
  if (entryCount < 1) throw new Error("animation has no entries");
  const clipDuration = view.getFloat32(4, true);
  const samplerFamily = view.getUint32(8, true);
  const payloadSize = view.getUint32(12, true);
  const payloadOffset = 16;
  const payloadEnd = payloadOffset + payloadSize;
  if (samplerFamily !== 3) throw new Error(`unsupported sampler family ${samplerFamily}`);
  if (payloadEnd > view.byteLength) throw new Error("animation payload out of range");

  const fps = view.getFloat32(payloadOffset, true);
  const frameCount = view.getUint32(payloadOffset + 4, true);
  const trackCount = view.getUint32(payloadOffset + 8, true);
  const frameStrideHalfWords = view.getUint32(payloadOffset + 12, true);
  const trackMaskOffset = payloadOffset + 20;
  const trackValueOffsetOffset = trackMaskOffset + trackCount * 2 + 2;
  const basePoseOffset = trackValueOffsetOffset + trackCount * 2;
  const frameDataOffset = basePoseOffset + trackCount * 48;

  const trackMasks = [];
  const trackValueOffsets = [];
  for (let index = 0; index < trackCount; index += 1) {
    trackMasks.push(view.getUint16(trackMaskOffset + index * 2, true));
    trackValueOffsets.push(view.getUint16(trackValueOffsetOffset + index * 2, true));
  }

  return {
    view,
    clipDuration,
    samplerFamily,
    fps,
    frameCount,
    trackCount,
    frameStrideHalfWords,
    trackMasks,
    trackValueOffsets,
    basePoseOffset,
    frameDataOffset,
  };
}

function readAnimationFamily3ClipFrame(clip, frameIndex) {
  const frame = Math.max(0, Math.min(clip.frameCount - 1, frameIndex));
  const frameBaseOffset = frame === 0 ? null : clip.frameDataOffset + (frame - 1) * clip.frameStrideHalfWords * 2;
  const componentIndexes = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10];
  const poses = [];

  for (let trackIndex = 0; trackIndex < clip.trackCount; trackIndex += 1) {
    const values = [];
    const baseOffset = clip.basePoseOffset + trackIndex * 48;
    for (let index = 0; index < 12; index += 1) {
      values.push(clip.view.getFloat32(baseOffset + index * 4, true));
    }

    const mask = clip.trackMasks[trackIndex];
    if (frameBaseOffset != null && mask !== 0) {
      let cursor = frameBaseOffset + clip.trackValueOffsets[trackIndex] * 2;
      for (let bit = 0; bit < componentIndexes.length; bit += 1) {
        if ((mask & (1 << bit)) === 0) continue;
        values[componentIndexes[bit]] = decodeFloat16(clip.view.getUint16(cursor, true));
        cursor += 2;
      }
    }

    poses.push({
      boneIndex: trackIndex,
      rotation: values.slice(0, 4),
      translation: values.slice(4, 7),
      scale: values.slice(8, 11),
    });
  }

  return poses;
}

function interpolateNativePose(left, right, alpha) {
  const inverseAlpha = 1 - alpha;
  const sign =
    left.rotation[0] * right.rotation[0] +
      left.rotation[1] * right.rotation[1] +
      left.rotation[2] * right.rotation[2] +
      left.rotation[3] * right.rotation[3] <
    0
      ? -1
      : 1;
  const rotationValues = left.rotation.map((value, index) => inverseAlpha * value + alpha * sign * right.rotation[index]);
  const rotation = new THREE.Quaternion().fromArray(rotationValues);
  if (rotation.lengthSq() > 0.000001) rotation.normalize();
  else rotation.set(0, 0, 0, 1);
  return {
    boneIndex: left.boneIndex,
    rotation: rotation.toArray(),
    translation: lerpArray(left.translation, right.translation, alpha),
    scale: lerpArray(left.scale, right.scale, alpha),
  };
}

function firstActiveSkinnedSkeletonBones() {
  let bones = null;
  activeObject?.traverse((child) => {
    if (bones || !child.isSkinnedMesh || !child.skeleton?.bones?.length) return;
    bones = child.skeleton.bones;
  });
  return bones || [];
}

function rootDirectDominantSkinJointCounts() {
  if (activeObject?.userData.rootDirectDominantSkinJointCounts) return activeObject.userData.rootDirectDominantSkinJointCounts;
  const counts = new Map();
  activeObject?.traverse((child) => {
    const skinIndex = child.geometry?.getAttribute?.("skinIndex");
    const skinWeight = child.geometry?.getAttribute?.("skinWeight");
    if (!child.isSkinnedMesh || !skinIndex || !skinWeight) return;
    const index = child.geometry.index;
    const count = index ? index.count : skinIndex.count;
    for (let cursor = 0; cursor < count; cursor += 1) {
      const vertexIndex = index ? index.getX(cursor) : cursor;
      let dominantJointIndex = null;
      let dominantWeight = 0;
      for (let component = 0; component < Math.min(4, skinIndex.itemSize, skinWeight.itemSize); component += 1) {
        const jointIndex = Math.round(attributeComponent(skinIndex, vertexIndex, component));
        const weight = Number(attributeComponent(skinWeight, vertexIndex, component)) || 0;
        if (weight <= dominantWeight) continue;
        dominantJointIndex = jointIndex;
        dominantWeight = weight;
      }
      if (dominantJointIndex == null) continue;
      counts.set(dominantJointIndex, (counts.get(dominantJointIndex) || 0) + 1);
    }
  });
  if (activeObject) activeObject.userData.rootDirectDominantSkinJointCounts = counts;
  return counts;
}

function isRootDirectAttachmentTranslationBone(bone, boneIndexByBone, dominantJointCounts) {
  if (boneIndexByBone.get(bone?.parent) !== 0) return false;
  const childBoneCount = bone.children.filter((child) => boneIndexByBone.has(child)).length;
  if (childBoneCount > 1) return false;
  const boneIndex = boneIndexByBone.get(bone);
  const rootOffset = Math.hypot(Number(bone.position?.x) || 0, Number(bone.position?.z) || 0);
  return rootOffset >= ROOT_DIRECT_WEAPON_TRANSLATION_OFFSET || (dominantJointCounts.get(boneIndex) || 0) >= ROOT_DIRECT_ATTACHMENT_DOMINANT_VERTICES;
}

function expandedTranslationSafeBones(translationSafeBones) {
  const runtimeBoneIndices = runtimeResolvedAttachmentBoneIndices();
  const runtimeNativeFrameBoneIndices = runtimeNativeFrameTranslationBoneIndices();
  const bones = firstActiveSkinnedSkeletonBones();
  if (!bones.length) {
    const expanded = new Set(translationSafeBones || []);
    for (const boneIndex of runtimeBoneIndices) expanded.add(boneIndex);
    for (const boneIndex of runtimeNativeFrameBoneIndices) expanded.add(boneIndex);
    return expanded;
  }

  const expanded = new Set(translationSafeBones || []);
  const boneIndexByBone = new Map();
  bones.forEach((bone, index) => boneIndexByBone.set(bone, index));
  for (const boneIndex of runtimeBoneIndices) expanded.add(boneIndex);
  for (const boneIndex of runtimeNativeFrameBoneIndices) expanded.add(boneIndex);

  const initialSafeBoneIndices = new Set(expanded);
  for (const boneIndex of initialSafeBoneIndices) {
    let bone = bones[boneIndex];
    while (bone?.parent) {
      const parentIndex = boneIndexByBone.get(bone.parent);
      if (parentIndex == null || parentIndex === 0) break;
      if (bone.parent.parent && boneIndexByBone.get(bone.parent.parent) === 0) break;
      expanded.add(parentIndex);
      bone = bones[parentIndex];
    }
  }

  const dominantJointCounts = rootDirectDominantSkinJointCounts();
  bones.forEach((bone, boneIndex) => {
    if (isRootDirectAttachmentTranslationBone(bone, boneIndexByBone, dominantJointCounts)) expanded.add(boneIndex);
  });

  return expanded;
}

function nativeAnimationPoseByBoneIndex(timeSeconds, requestedTranslationMode = nativeTranslationMode) {
  const mapping = selectedAnimationMapping();
  if (!activeAnimationClip || !mapping || activeAnimationClip.trackCount !== mapping.boneCount) return null;
  const effectiveTranslationMode = nativeTranslationModeForMapping(mapping, requestedTranslationMode);
  const resolvedTranslationMode =
    effectiveTranslationMode === "dynamic" ? dynamicNativeTranslationModeForTime(timeSeconds) : effectiveTranslationMode;
  let translationSafeBones = new Set(
    Array.isArray(mapping.nativeFrameBoneIndices) ? mapping.nativeFrameBoneIndices : [],
  );
  translationSafeBones = expandedTranslationSafeBones(translationSafeBones);
  const translationUnsafeBones = runtimeTranslationUnsafeBoneIndices();
  const nativeScaleBones = nativeScaleBoneIndicesForActiveObject();
  const framePosition = (timeSeconds * activeAnimationClip.fps) % activeAnimationClip.frameCount;
  const frameIndex = Math.floor(framePosition);
  const nextFrameIndex = Math.min(frameIndex + 1, activeAnimationClip.frameCount - 1);
  const alpha = framePosition - frameIndex;
  const frame = readAnimationFamily3ClipFrame(activeAnimationClip, frameIndex);
  const nextFrame = readAnimationFamily3ClipFrame(activeAnimationClip, nextFrameIndex);
  const skyeBikeInheritedScales = skyeBikeTransitionInheritedScaleByBoneIndex(frame, nextFrame, alpha);
  const poseByIndex = new Map();

  for (let index = 0; index < frame.length; index += 1) {
    const pose = interpolateNativePose(frame[index], nextFrame[index], alpha);
    if (!shouldApplyNativeTranslation(resolvedTranslationMode, translationSafeBones, translationUnsafeBones, pose.boneIndex)) {
      pose.translation = null;
    }
    const inheritedScale = skyeBikeInheritedScales?.get(pose.boneIndex);
    if (inheritedScale) pose.scale = inheritedScale;
    if (!nativeScaleBones.has(pose.boneIndex)) pose.scale = null;
    if (pose.rotation.every(Number.isFinite)) poseByIndex.set(pose.boneIndex, pose);
  }

  return poseByIndex;
}

function nativeClipPoseByBoneIndex(clip, timeSeconds) {
  if (!clip?.trackCount || !clip?.frameCount || !clip?.fps) return null;
  const duration = Math.max(Number(clip.clipDuration) || 0, 0);
  const safeTime = duration > 0 ? ((timeSeconds % duration) + duration) % duration : Math.max(0, Number(timeSeconds) || 0);
  const framePosition = (safeTime * clip.fps) % clip.frameCount;
  const frameIndex = Math.floor(framePosition);
  const nextFrameIndex = Math.min(frameIndex + 1, clip.frameCount - 1);
  const alpha = framePosition - frameIndex;
  const frame = readAnimationFamily3ClipFrame(clip, frameIndex);
  const nextFrame = readAnimationFamily3ClipFrame(clip, nextFrameIndex);
  const poseByIndex = new Map();

  for (let index = 0; index < frame.length; index += 1) {
    const pose = interpolateNativePose(frame[index], nextFrame[index], alpha);
    if (pose.rotation.every(Number.isFinite)) poseByIndex.set(pose.boneIndex, pose);
  }

  return poseByIndex;
}

function clearActiveAnimationClip() {
  activeAnimationClipKey = "";
  activeAnimationClip = null;
  activeAnimationClipLoading = false;
  activeAnimationClipError = "";
  activeEffectScalePoseKey = "";
  activeEffectScalePose = null;
}

function requestAnimationClip(animation) {
  const key = animation?.targetRelativePath || "";
  if (!key || activeAnimationClipKey === key) return;
  activeAnimationClipKey = key;
  activeAnimationClip = null;
  activeAnimationClipError = "";
  activeAnimationClipLoading = true;
  activeEffectScalePoseKey = "";
  activeEffectScalePose = null;

  fetch(buildResourcePath(key))
    .then((response) => {
      if (!response.ok) throw new Error(`${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => {
      if (activeAnimationClipKey !== key) return;
      activeAnimationClip = parseAnimationFamily3Clip(buffer);
    })
    .catch((error) => {
      if (activeAnimationClipKey !== key) return;
      activeAnimationClipError = error.message;
    })
    .finally(() => {
      if (activeAnimationClipKey !== key) return;
      activeAnimationClipLoading = false;
      refreshAutoNativeTranslationMode();
      syncAnimationStats();
    });
}

function animationBoneMappingKey(animation) {
  return `${animation?.targetRelativePath || ""}\t${activeAnimationSkeletonPath}`;
}

function selectedAnimationMapping(animation = selectedAnimation()) {
  return animationBoneMappings.get(animationBoneMappingKey(animation)) || null;
}

function autoNativeTranslationKey() {
  return `${activeIdentity}\t${activeAnimationClipKey}\t${activeAnimationSkeletonPath}`;
}

function hasMeaningfulNativeTranslationSafeCoverage(mapping) {
  const safeCount = Array.isArray(mapping?.nativeFrameBoneIndices) ? mapping.nativeFrameBoneIndices.length : 0;
  const boneCount = Number(mapping?.boneCount) || 0;
  return boneCount > 0 && safeCount >= Math.ceil(boneCount * MIN_NATIVE_TRANSLATION_COVERAGE);
}

function hasExpandedNativeTranslationSafeCoverage(mapping) {
  return hasMeaningfulNativeTranslationSafeCoverage(mapping) || hasRuntimeTranslationSafeBones();
}

function hasRuntimeNativeTranslationControl(mapping = selectedAnimationMapping()) {
  return ENABLE_RUNTIME_NATIVE_TRANSLATION_TAKEOVER && hasCompleteRuntimeBindingEvidence() && (Number(mapping?.boneCount) || 0) > 0;
}

function fallbackAutoNativeTranslationMode(mapping) {
  return hasExpandedNativeTranslationSafeCoverage(mapping) ? "safe" : "all";
}

function nativeTranslationModeForMapping(mapping, requestedMode = nativeTranslationMode) {
  if (requestedMode !== "auto") return requestedMode;
  return autoNativeTranslationModes.get(autoNativeTranslationKey()) || fallbackAutoNativeTranslationMode(mapping);
}

function shouldWaitForNativeAnimationPose() {
  return activeAnimationClipLoading && Boolean(selectedAnimationMapping());
}

function queueFrameAfterAnimationPose(object, resetCamera) {
  pendingAnimationPoseFrameObject = object || null;
  pendingAnimationPoseFrameResetCamera = Boolean(resetCamera);
}

function frameActiveObjectAfterPendingAnimationPose() {
  if (!pendingAnimationPoseFrameObject) return false;
  if (pendingAnimationPoseFrameObject !== activeObject) {
    pendingAnimationPoseFrameObject = null;
    pendingAnimationPoseFrameResetCamera = false;
    return false;
  }
  if (shouldWaitForNativeAnimationPose()) return false;

  const resetCamera = pendingAnimationPoseFrameResetCamera;
  pendingAnimationPoseFrameObject = null;
  pendingAnimationPoseFrameResetCamera = false;
  frameObject(activeObject, { resetCamera });
  return true;
}

function chooseAutoNativeTranslationMode(bindMax, allMax, safeMax, noneMax, fallbackMode) {
  if (!Number.isFinite(bindMax) || bindMax <= 0 || !Number.isFinite(allMax)) return fallbackMode;
  const maxAllowed = bindMax * AUTO_NATIVE_TRANSLATION_MAX_RATIO;
  const safeFits = Number.isFinite(safeMax) && safeMax <= maxAllowed;
  const noneFits = Number.isFinite(noneMax) && noneMax <= maxAllowed;
  const safeNearNone = Number.isFinite(safeMax) && Number.isFinite(noneMax) && safeMax <= noneMax * AUTO_NATIVE_TRANSLATION_SAFE_OVER_NONE_RATIO;
  if (allMax <= maxAllowed) return "all";
  if (safeFits && safeMax < allMax) return "safe";
  if (safeNearNone && safeMax <= allMax) return "safe";
  if (noneFits && noneMax < allMax && (!Number.isFinite(safeMax) || noneMax <= safeMax)) return "none";
  if (Number.isFinite(safeMax) && safeMax < allMax) return "safe";
  if (Number.isFinite(noneMax) && noneMax < allMax && (!Number.isFinite(safeMax) || noneMax <= safeMax)) return "none";
  if (Number.isFinite(safeMax) && allMax <= safeMax) return "all";
  return "safe";
}

function nativeTranslationSafeActsLikeNone(safeMax, noneMax) {
  if (!Number.isFinite(safeMax) || !Number.isFinite(noneMax) || safeMax <= 0 || noneMax <= 0) return false;
  return (
    safeMax <= noneMax * AUTO_NATIVE_TRANSLATION_SAFE_EQUALS_NONE_RATIO &&
    noneMax <= safeMax * AUTO_NATIVE_TRANSLATION_SAFE_EQUALS_NONE_RATIO
  );
}

function nativeTranslationAllEdgeIsSafe(allEdgeRatio, safeEdgeRatio, noneEdgeRatio) {
  if (!Number.isFinite(allEdgeRatio)) return false;
  if (allEdgeRatio <= AUTO_NATIVE_TRANSLATION_EDGE_MAX_RATIO) return true;
  const baselines = [safeEdgeRatio, noneEdgeRatio].filter((value) => Number.isFinite(value) && value > 0);
  const baseline = baselines.length ? Math.min(...baselines) : NaN;
  return Number.isFinite(baseline) && allEdgeRatio <= baseline * AUTO_NATIVE_TRANSLATION_EDGE_WORSE_RATIO;
}

function chooseSampledNativeTranslationMode(
  bindMax,
  allMax,
  safeMax,
  noneMax,
  fallbackMode,
  allEdgeRatio,
  safeEdgeRatio,
  noneEdgeRatio,
  safeHasCoverage,
) {
  const allEdgeIsSafe = nativeTranslationAllEdgeIsSafe(allEdgeRatio, safeEdgeRatio, noneEdgeRatio);
  const safeActsLikeNone = nativeTranslationSafeActsLikeNone(safeMax, noneMax);
  if (!safeHasCoverage && safeActsLikeNone) return "all";
  if (allEdgeIsSafe) return "all";
  if (
    safeHasCoverage &&
    Number.isFinite(safeMax) &&
    Number.isFinite(allMax) &&
    safeMax <= allMax * AUTO_NATIVE_TRANSLATION_SAFE_PREFERRED_RATIO
  ) {
    return "safe";
  }
  if (sampleNativeTranslationModeChanges()) return "dynamic";
  if (safeActsLikeNone && allMax <= bindMax * AUTO_NATIVE_TRANSLATION_RIGID_MAX_RATIO) return "all";
  return chooseAutoNativeTranslationMode(bindMax, allMax, safeMax, noneMax, fallbackMode);
}

function shouldApplyNativeTranslation(mode, translationSafeBones, translationUnsafeBones, boneIndex) {
  if (translationUnsafeBones?.has(boneIndex) === true) return false;
  if (mode === "none") return false;
  if (mode === "safe") return translationSafeBones?.has(boneIndex) === true;
  return true;
}

function syncAnimationStats() {
  const animation = selectedAnimation();
  if (animation) requestAnimationClip(animation);
  activeAnimationStatsText = animation ? `动作 ${animationOptionLabel(animation)}` : "";
  syncRuntimeEffectPreviews();
  if (animation) applyAnimationAtTime(manualAnimationTime);
  else {
    applyAnimationPose(activePoseBlend);
    syncPreviewEffectVisibility();
    syncTimelineControls();
  }
  renderStats();
  if (activeObject) {
    frameActiveObjectAfterPendingAnimationPose();
    scheduleAutoFrameIfCanvasBlank(activeObject);
  }
}

function syncAnimationSelect(item) {
  clearActiveAnimationClip();
  manualAnimationTime = 0;
  const binding = isAnimationFormat() ? animationBindings.get(animationBindingKey(item)) : null;
  activeAnimationSkeletonPath = binding?.skeletonPath || "";
  activeAnimations = (binding?.animations || []).filter((animation) => animation.trackMatchesSkeleton);
  animationSelect.replaceChildren();

  if (!activeAnimations.length) {
    animationSelect.appendChild(new Option("没有可用动作", ""));
    activeAnimationSkeletonPath = "";
    activeAnimationStatsText = "";
    applyAnimationPose();
    renderStats();
    syncFormatControls();
    syncTimelineControls();
    syncBaseStats();
    return;
  }

  activeAnimations.forEach((animation, index) => {
    animationSelect.appendChild(new Option(animationOptionLabel(animation), String(index)));
  });
  animationSelect.value = String(defaultAnimationIndex(activeAnimations));
  poseClock.start();
  syncFormatControls();
  syncAnimationStats();
  syncBaseStats();
}

function syncCharacters() {
  const selected = characterSelect.value;
  const characters = [...new Set(currentManifest().map(heroKeyForItem))].sort((left, right) =>
    displayHeroName(left).localeCompare(displayHeroName(right)),
  );

  characterSelect.replaceChildren(new Option("全部英雄", ""));
  heroSearchOptions.replaceChildren();
  searchOptionToHero = new Map();
  heroSearchItems = [];
  for (const character of characters) {
    characterSelect.appendChild(new Option(displayCharacter(character), character));
    const aliases = [displayCharacter(character), ...heroSearchAliases(character)];
    heroSearchItems.push({
      key: character,
      label: displayCharacter(character),
      aliases,
      searchIndex: buildSearchIndex(aliases),
    });
    for (const alias of aliases) {
      searchOptionToHero.set(normalizeSearchValue(alias), character);
    }
  }

  const exactSearchHero = searchOptionToHero.get(normalizeSearchValue(searchInput.value));
  characterSelect.value = exactSearchHero || (characters.includes(selected) ? selected : "");
  heroCombobox?.setItems(filteredHeroSearchItems(searchInput.value));
}

function resize() {
  const rect = viewport.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  composer.setSize(rect.width, rect.height);
  bloomPass.setSize(rect.width, rect.height);
  camera.aspect = rect.width / Math.max(rect.height, 1);
  camera.updateProjectionMatrix();
}

const MATERIAL_TEXTURE_KEYS = [
  "map",
  "alphaMap",
  "aoMap",
  "bumpMap",
  "clearcoatMap",
  "clearcoatNormalMap",
  "clearcoatRoughnessMap",
  "displacementMap",
  "emissiveMap",
  "envMap",
  "gradientMap",
  "iridescenceMap",
  "iridescenceThicknessMap",
  "lightMap",
  "matcap",
  "metalnessMap",
  "normalMap",
  "roughnessMap",
  "sheenColorMap",
  "sheenRoughnessMap",
  "specularColorMap",
  "specularIntensityMap",
  "specularMap",
  "thicknessMap",
  "transmissionMap",
];

function disposeTextureLikeValue(value, disposedTextures) {
  if (!value) return;
  if (value.isTexture) {
    disposeTextureResource(value, disposedTextures);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) disposeTextureLikeValue(item, disposedTextures);
    return;
  }
  if (typeof value !== "object") return;
  for (const nested of Object.values(value)) {
    if (nested?.isTexture || Array.isArray(nested)) disposeTextureLikeValue(nested, disposedTextures);
  }
}

function disposeTextureResource(texture, disposedTextures) {
  if (!texture?.isTexture || disposedTextures.has(texture)) return;
  disposedTextures.add(texture);
  for (const value of Object.values(texture.userData || {})) disposeTextureLikeValue(value, disposedTextures);
  texture.dispose();
}

function disposeMaterialTextures(material, disposedTextures) {
  if (!material) return;
  for (const key of MATERIAL_TEXTURE_KEYS) {
    const texture = material[key];
    disposeTextureResource(texture, disposedTextures);
  }
  for (const uniform of Object.values(material.uniforms || {})) {
    disposeTextureLikeValue(uniform?.value, disposedTextures);
  }
  for (const value of Object.values(material.userData || {})) {
    disposeTextureLikeValue(value, disposedTextures);
  }
}

function disposeObject(object) {
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  const disposedTextures = new Set();
  object.traverse((child) => {
    if (child.geometry && !disposedGeometries.has(child.geometry)) {
      disposedGeometries.add(child.geometry);
      child.geometry.dispose();
    }
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material || disposedMaterials.has(material)) continue;
        disposedMaterials.add(material);
        disposeMaterialTextures(material, disposedTextures);
        material.dispose();
      }
    }
  });
}

function disposeSkeleton() {
  if (!activeSkeleton) return;
  if (activeSkeleton.parent) activeSkeleton.parent.remove(activeSkeleton);
  disposeObject(activeSkeleton);
  activeSkeleton = null;
}

function clearAttachmentObjects() {
  for (const object of activeAttachmentObjects) {
    if (object.parent) object.parent.remove(object);
    disposeObject(object);
  }
  activeAttachmentObjects = [];
}

function clearRuntimeEffectObjects() {
  for (const object of activeRuntimeEffectObjects) {
    if (object.userData.particleEffect) object.userData.particleEffect.dispose();
    if (object.parent) object.parent.remove(object);
    disposeObject(object);
  }
  activeRuntimeEffectObjects = [];
  if (runtimeParticleFxRoot) {
    if (runtimeParticleFxRoot.parent) runtimeParticleFxRoot.parent.remove(runtimeParticleFxRoot);
    runtimeParticleFxRoot = null;
  }
}

function runtimeEffectPreviewStats() {
  return activeRuntimeEffectObjects.length ? ` | ${activeRuntimeEffectObjects.length} 个运行时特效预览` : "";
}

function runtimeEffectPreviewSpriteTexture() {
  if (runtimeEffectPreviewTexture) return runtimeEffectPreviewTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.34, "rgba(255,255,255,0.72)");
  gradient.addColorStop(0.72, "rgba(255,255,255,0.18)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  runtimeEffectPreviewTexture = new THREE.CanvasTexture(canvas);
  runtimeEffectPreviewTexture.name = "runtime_effect_preview_radial";
  runtimeEffectPreviewTexture.colorSpace = THREE.SRGBColorSpace;
  runtimeEffectPreviewTexture.needsUpdate = true;
  return runtimeEffectPreviewTexture;
}

function runtimeEffectNativePrimitiveKind(entry) {
  const text = runtimeEffectNativePrimitiveText(entry);
  if (/warning|execute|target|reticle|ring|circle/i.test(text)) return "ring";
  return "area";
}

function runtimeEffectNativePrimitiveRingTexture() {
  if (runtimeEffectNativePrimitiveRingTextureCache) return runtimeEffectNativePrimitiveRingTextureCache;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createRadialGradient(64, 64, 28, 64, 64, 62);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.42, "rgba(255,255,255,0.05)");
  gradient.addColorStop(0.62, "rgba(255,255,255,0.82)");
  gradient.addColorStop(0.78, "rgba(255,255,255,0.38)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255,255,255,0.92)";
  context.lineWidth = 4;
  context.beginPath();
  context.arc(64, 64, 43, 0, Math.PI * 2);
  context.stroke();
  runtimeEffectNativePrimitiveRingTextureCache = new THREE.CanvasTexture(canvas);
  runtimeEffectNativePrimitiveRingTextureCache.name = "runtime_effect_native_primitive_ring";
  runtimeEffectNativePrimitiveRingTextureCache.colorSpace = THREE.SRGBColorSpace;
  runtimeEffectNativePrimitiveRingTextureCache.needsUpdate = true;
  return runtimeEffectNativePrimitiveRingTextureCache;
}

function runtimeEffectNativePrimitivePreviewTexture(entry) {
  if (runtimeEffectNativePrimitiveKind(entry) === "ring") return runtimeEffectNativePrimitiveRingTexture();
  return runtimeEffectPreviewSpriteTexture();
}

function runtimeEffectPreviewTextureForEntry(entry, layerIndex) {
  if (entry?.pfxItem?.nativePrimitive) return runtimeEffectNativePrimitivePreviewTexture(entry);
  if (!entry.previewTextures?.length) return runtimeEffectPreviewSpriteTexture();
  const texturePath = entry.previewTextures[layerIndex % entry.previewTextures.length];
  if (!runtimeEffectPreviewTextures.has(texturePath)) {
    const texture = runtimeEffectTextureLoader.load(texturePath);
    texture.name = `runtime_effect_preview_${texturePath}`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    runtimeEffectPreviewTextures.set(texturePath, texture);
  }
  return runtimeEffectPreviewTextures.get(texturePath);
}

function runtimeEffectPreviewDistortionTextureForUvAnimation(uvAnimation) {
  const texturePath = uvAnimation?.distortionTexture || "";
  if (!texturePath) return null;
  if (!runtimeEffectDistortionTextures.has(texturePath)) {
    const texture = runtimeEffectTextureLoader.load(texturePath);
    texture.name = `runtime_effect_distortion_${texturePath}`;
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    runtimeEffectDistortionTextures.set(texturePath, texture);
  }
  return runtimeEffectDistortionTextures.get(texturePath);
}

function runtimeEffectPreviewAmplitudeMaskTextureForUvAnimation(uvAnimation) {
  const texturePath = uvAnimation?.amplitudeMaskTexture || "";
  if (!texturePath) return null;
  if (!runtimeEffectDistortionTextures.has(texturePath)) {
    const texture = runtimeEffectTextureLoader.load(texturePath);
    texture.name = `runtime_effect_distortion_mask_${texturePath}`;
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    runtimeEffectDistortionTextures.set(texturePath, texture);
  }
  return runtimeEffectDistortionTextures.get(texturePath);
}

function runtimeEffectPreviewRotationTextureForUvAnimation(uvAnimation) {
  const texturePath = uvAnimation?.rotationTexture || "";
  if (!texturePath) return null;
  if (!runtimeEffectDistortionTextures.has(texturePath)) {
    const texture = runtimeEffectTextureLoader.load(texturePath);
    texture.name = `runtime_effect_rotation_${texturePath}`;
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    runtimeEffectDistortionTextures.set(texturePath, texture);
  }
  return runtimeEffectDistortionTextures.get(texturePath);
}

function runtimeEffectPreviewWarpTextureForUvAnimation(uvAnimation) {
  const texturePath = uvAnimation?.warpTexture || "";
  if (!texturePath) return null;
  if (!runtimeEffectDistortionTextures.has(texturePath)) {
    const texture = runtimeEffectTextureLoader.load(texturePath);
    texture.name = `runtime_effect_warp_${texturePath}`;
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    runtimeEffectDistortionTextures.set(texturePath, texture);
  }
  return runtimeEffectDistortionTextures.get(texturePath);
}

function runtimeEffectPreviewFieldTextureForUvAnimation(uvAnimation) {
  const texturePath = uvAnimation?.fieldTexture || "";
  if (!texturePath) return null;
  if (!runtimeEffectDistortionTextures.has(texturePath)) {
    const texture = runtimeEffectTextureLoader.load(texturePath);
    texture.name = `runtime_effect_offset_field_${texturePath}`;
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    runtimeEffectDistortionTextures.set(texturePath, texture);
  }
  return runtimeEffectDistortionTextures.get(texturePath);
}

function runtimeEffectPreviewScaleTextureForUvAnimation(uvAnimation) {
  const texturePath = uvAnimation?.scaleTexture || "";
  if (!texturePath) return null;
  if (!runtimeEffectDistortionTextures.has(texturePath)) {
    const texture = runtimeEffectTextureLoader.load(texturePath);
    texture.name = `runtime_effect_scale_${texturePath}`;
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    runtimeEffectDistortionTextures.set(texturePath, texture);
  }
  return runtimeEffectDistortionTextures.get(texturePath);
}

function runtimeEffectPreviewScaleMaskTextureForUvAnimation(uvAnimation) {
  const texturePath = uvAnimation?.scaleMaskTexture || "";
  if (!texturePath) return null;
  if (!runtimeEffectDistortionTextures.has(texturePath)) {
    const texture = runtimeEffectTextureLoader.load(texturePath);
    texture.name = `runtime_effect_scale_mask_${texturePath}`;
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    runtimeEffectDistortionTextures.set(texturePath, texture);
  }
  return runtimeEffectDistortionTextures.get(texturePath);
}

function runtimeEffectDeclareFragmentUniforms(shader, declarations) {
  const declarationText = declarations.trim();
  if (!declarationText) return;
  shader.fragmentShader = `${declarationText}\n${shader.fragmentShader}`;
}

function applyRuntimeEffectSampledDistortionShader(material, uvAnimation) {
  if (uvAnimation?.mode !== "sampledDistort") return material;
  const distortionMap = runtimeEffectPreviewDistortionTextureForUvAnimation(uvAnimation);
  if (!distortionMap) return material;
  const amplitudeMaskMap = runtimeEffectPreviewAmplitudeMaskTextureForUvAnimation(uvAnimation);
  const axis = uvAnimation.axis || [1, 1];
  const offset = uvAnimation.offset || [0, 0];
  const fallbackChannel = ["x", "y", "z", "w"].includes(uvAnimation.distortionChannel) ? uvAnimation.distortionChannel : "x";
  const distortionChannels = Array.isArray(uvAnimation.distortionChannels)
    ? uvAnimation.distortionChannels
    : [fallbackChannel, fallbackChannel];
  const channelX = distortionChannels[0];
  const channelY = distortionChannels[1];
  const amplitudeMaskChannel = ["x", "y", "z", "w"].includes(uvAnimation.amplitudeMaskChannel)
    ? uvAnimation.amplitudeMaskChannel
    : "x";
  const center = uvAnimation.center || [0.5, 0.5];
  const uniforms = {
    sampledDistortionMap: { value: distortionMap },
    sampledDistortionMaskMap: { value: amplitudeMaskMap || distortionMap },
    sampledDistortionMaskEnabled: { value: amplitudeMaskMap ? 1 : 0 },
    sampledDistortionAxis: { value: new THREE.Vector2(Number(axis[0]) || 0, Number(axis[1]) || 0) },
    sampledDistortionOffset: { value: new THREE.Vector2(Number(offset[0]) || 0, Number(offset[1]) || 0) },
    sampledDistortionCenter: { value: new THREE.Vector2(Number(center[0]) || 0.5, Number(center[1]) || 0.5) },
    sampledDistortionBias: { value: Number(uvAnimation.distortionBias) || 0 },
    sampledDistortionScale: { value: Number(uvAnimation.distortionScale) || 0 },
    sampledDistortionAmplitude: { value: 0 },
    sampledDistortionPhase: { value: 0 },
    sampledDistortionWave: { value: 1 },
    sampledDistortionRotation: { value: 0 },
    sampledDistortionRotateEnabled: { value: 0 },
  };
  material.userData.sampledDistortionUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    runtimeEffectDeclareFragmentUniforms(
      shader,
      `
uniform sampler2D sampledDistortionMap;
uniform sampler2D sampledDistortionMaskMap;
uniform float sampledDistortionMaskEnabled;
uniform vec2 sampledDistortionAxis;
uniform vec2 sampledDistortionOffset;
uniform vec2 sampledDistortionCenter;
uniform float sampledDistortionBias;
uniform float sampledDistortionScale;
uniform float sampledDistortionAmplitude;
uniform float sampledDistortionPhase;
uniform float sampledDistortionWave;
uniform float sampledDistortionRotation;
uniform float sampledDistortionRotateEnabled;
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
#ifdef USE_MAP
  vec4 sampledDistortionTexel = texture2D(sampledDistortionMap, vMapUv);
  vec2 sampledDistortionValue = vec2(sampledDistortionTexel.${channelX}, sampledDistortionTexel.${channelY});
  float sampledDistortionMask = mix(1.0, texture2D(sampledDistortionMaskMap, vMapUv).${amplitudeMaskChannel}, sampledDistortionMaskEnabled);
  vec2 sampledDistortedUv = vMapUv + sampledDistortionOffset + sampledDistortionAxis * ((sampledDistortionValue + vec2(sampledDistortionBias)) * sampledDistortionScale * sampledDistortionAmplitude * sampledDistortionMask * sampledDistortionWave);
  vec2 sampledCenteredUv = sampledDistortedUv - sampledDistortionCenter;
  float sampledRotationCos = cos(sampledDistortionRotation);
  float sampledRotationSin = sin(sampledDistortionRotation);
  vec2 sampledRotatedUv = vec2(
    sampledRotationCos * sampledCenteredUv.x - sampledRotationSin * sampledCenteredUv.y,
    sampledRotationSin * sampledCenteredUv.x + sampledRotationCos * sampledCenteredUv.y
  ) + sampledDistortionCenter;
  vec4 sampledDiffuseColor = texture2D(map, mix(sampledDistortedUv, sampledRotatedUv, sampledDistortionRotateEnabled));
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
      `.trim(),
    );
    material.userData.sampledDistortionShader = shader;
  };
  material.needsUpdate = true;
  return material;
}

function applyRuntimeEffectSampledRotationShader(material, uvAnimation) {
  if (uvAnimation?.mode !== "sampledRotate") return material;
  const rotationMap = runtimeEffectPreviewRotationTextureForUvAnimation(uvAnimation);
  if (!rotationMap) return material;
  const center = uvAnimation.center || [0.5, 0.5];
  const preRotationAxis = uvAnimation.preRotationAxis || [0, 0];
  const rotationChannel = ["x", "y", "z", "w"].includes(uvAnimation.rotationChannel) ? uvAnimation.rotationChannel : "x";
  const uniforms = {
    sampledRotationMap: { value: rotationMap },
    sampledRotationCenter: { value: new THREE.Vector2(Number(center[0]) || 0.5, Number(center[1]) || 0.5) },
    sampledRotationPreAxis: { value: new THREE.Vector2(Number(preRotationAxis[0]) || 0, Number(preRotationAxis[1]) || 0) },
    sampledRotationScale: { value: Number(uvAnimation.rotationScale) || 0 },
    sampledRotationAmplitude: { value: 0 },
  };
  material.userData.sampledRotationUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    runtimeEffectDeclareFragmentUniforms(
      shader,
      `
uniform sampler2D sampledRotationMap;
uniform vec2 sampledRotationCenter;
uniform vec2 sampledRotationPreAxis;
uniform float sampledRotationScale;
uniform float sampledRotationAmplitude;
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
#ifdef USE_MAP
  vec4 sampledRotationTexel = texture2D(sampledRotationMap, vMapUv);
  float sampledRotationAngle = sampledRotationTexel.${rotationChannel} * sampledRotationScale * sampledRotationAmplitude;
  vec2 sampledRotationBaseUv = vMapUv + sampledRotationPreAxis * sampledRotationAngle - sampledRotationCenter;
  float sampledRotationCos = cos(sampledRotationAngle);
  float sampledRotationSin = sin(sampledRotationAngle);
  vec2 sampledRotatedUv = vec2(
    sampledRotationCos * sampledRotationBaseUv.x - sampledRotationSin * sampledRotationBaseUv.y,
    sampledRotationSin * sampledRotationBaseUv.x + sampledRotationCos * sampledRotationBaseUv.y
  ) + sampledRotationCenter;
  vec4 sampledDiffuseColor = texture2D(map, sampledRotatedUv);
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
      `.trim(),
    );
    material.userData.sampledRotationShader = shader;
  };
  material.needsUpdate = true;
  return material;
}

function applyRuntimeEffectSampledWarpShader(material, uvAnimation) {
  if (uvAnimation?.mode !== "sampledWarp") return material;
  const warpMap = runtimeEffectPreviewWarpTextureForUvAnimation(uvAnimation);
  const distortionMap = runtimeEffectPreviewDistortionTextureForUvAnimation(uvAnimation);
  if (!warpMap || !distortionMap) return material;
  const baseRepeat = uvAnimation.baseRepeat || [1, 1];
  const distortionRepeat = uvAnimation.distortionRepeat || [1, 1];
  const uvScaleRepeat = uvAnimation.uvScaleRepeat || [1, 1];
  const distortionChannels = Array.isArray(uvAnimation.distortionChannels) ? uvAnimation.distortionChannels : ["x", "y"];
  const channelX = ["x", "y", "z", "w"].includes(distortionChannels[0]) ? distortionChannels[0] : "x";
  const channelY = ["x", "y", "z", "w"].includes(distortionChannels[1]) ? distortionChannels[1] : "y";
  const weightChannel = ["x", "y", "z", "w"].includes(uvAnimation.distortionWeightChannel)
    ? uvAnimation.distortionWeightChannel
    : "z";
  const uniforms = {
    sampledWarpMap: { value: warpMap },
    sampledWarpDistortionMap: { value: distortionMap },
    sampledWarpBaseRepeat: { value: new THREE.Vector2(Number(baseRepeat[0]) || 1, Number(baseRepeat[1]) || 1) },
    sampledWarpDistortionRepeat: { value: new THREE.Vector2(Number(distortionRepeat[0]) || 1, Number(distortionRepeat[1]) || 1) },
    sampledWarpUvScaleRepeat: { value: new THREE.Vector2(Number(uvScaleRepeat[0]) || 1, Number(uvScaleRepeat[1]) || 1) },
    sampledWarpRuntimeOffset: { value: new THREE.Vector2(0, 0) },
    sampledWarpDistortionValueScale: { value: Number(uvAnimation.distortionValueScale) || 1 },
    sampledWarpDistortionBias: { value: Number(uvAnimation.distortionBias) || 0 },
    sampledWarpDistortionScale: { value: Number(uvAnimation.distortionScale) || 1 },
  };
  material.userData.sampledWarpUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    runtimeEffectDeclareFragmentUniforms(
      shader,
      `
uniform sampler2D sampledWarpMap;
uniform sampler2D sampledWarpDistortionMap;
uniform vec2 sampledWarpBaseRepeat;
uniform vec2 sampledWarpDistortionRepeat;
uniform vec2 sampledWarpUvScaleRepeat;
uniform vec2 sampledWarpRuntimeOffset;
uniform float sampledWarpDistortionValueScale;
uniform float sampledWarpDistortionBias;
uniform float sampledWarpDistortionScale;
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
#ifdef USE_MAP
  vec2 sampledWarpBaseUv = vMapUv * sampledWarpBaseRepeat;
  vec2 sampledWarpDistortionUv = vMapUv * sampledWarpDistortionRepeat;
  vec4 sampledWarpDistortionTexel = texture2D(sampledWarpDistortionMap, sampledWarpDistortionUv);
  vec2 sampledWarpWeighted = vec2(sampledWarpDistortionTexel.${channelX}, sampledWarpDistortionTexel.${channelY}) * sampledWarpDistortionTexel.${weightChannel};
  vec2 sampledWarpValue = ((sampledWarpWeighted * sampledWarpDistortionValueScale) + vec2(sampledWarpDistortionBias)) * sampledWarpDistortionScale;
  vec2 sampledWarpUvScale = vMapUv * sampledWarpUvScaleRepeat;
  vec2 sampledWarpUv = sampledWarpBaseUv + sampledWarpUvScale * sampledWarpValue + sampledWarpRuntimeOffset;
  vec4 sampledDiffuseColor = texture2D(sampledWarpMap, sampledWarpUv);
  vec4 sampledMaskColor = texture2D(map, vMapUv);
  sampledDiffuseColor.a *= sampledMaskColor.a;
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
      `.trim(),
    );
    material.userData.sampledWarpShader = shader;
  };
  material.needsUpdate = true;
  return material;
}

function applyRuntimeEffectSampledOffsetFieldShader(material, uvAnimation) {
  if (uvAnimation?.mode !== "sampledOffsetField") return material;
  const fieldMap = runtimeEffectPreviewFieldTextureForUvAnimation(uvAnimation);
  const distortionMap = runtimeEffectPreviewDistortionTextureForUvAnimation(uvAnimation);
  if (!fieldMap || !distortionMap) return material;
  const baseRepeat = uvAnimation.baseRepeat || [1, 1];
  const distortionRepeat = uvAnimation.distortionRepeat || [1, 1];
  const distortionChannels = Array.isArray(uvAnimation.distortionChannels) ? uvAnimation.distortionChannels : ["x", "y"];
  const channelX = ["x", "y", "z", "w"].includes(distortionChannels[0]) ? distortionChannels[0] : "x";
  const channelY = ["x", "y", "z", "w"].includes(distortionChannels[1]) ? distortionChannels[1] : "y";
  const bendX = uvAnimation.uvBend?.x || { uOffset: 0, uScale: 0, vOffset: 0, vScale: 0 };
  const uniforms = {
    sampledOffsetFieldMap: { value: fieldMap },
    sampledOffsetFieldDistortionMap: { value: distortionMap },
    sampledOffsetFieldBaseRepeat: { value: new THREE.Vector2(Number(baseRepeat[0]) || 1, Number(baseRepeat[1]) || 1) },
    sampledOffsetFieldDistortionRepeat: { value: new THREE.Vector2(Number(distortionRepeat[0]) || 1, Number(distortionRepeat[1]) || 1) },
    sampledOffsetFieldRuntimeOffset: { value: new THREE.Vector2(0, 0) },
    sampledOffsetFieldBendX: {
      value: new THREE.Vector4(Number(bendX.uOffset) || 0, Number(bendX.uScale) || 0, Number(bendX.vOffset) || 0, Number(bendX.vScale) || 0),
    },
    sampledOffsetFieldDistortionBias: { value: Number(uvAnimation.distortionBias) || 0 },
    sampledOffsetFieldDistortionScale: { value: Number(uvAnimation.distortionScale) || 1 },
  };
  material.userData.sampledOffsetFieldUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    runtimeEffectDeclareFragmentUniforms(
      shader,
      `
uniform sampler2D sampledOffsetFieldMap;
uniform sampler2D sampledOffsetFieldDistortionMap;
uniform vec2 sampledOffsetFieldBaseRepeat;
uniform vec2 sampledOffsetFieldDistortionRepeat;
uniform vec2 sampledOffsetFieldRuntimeOffset;
uniform vec4 sampledOffsetFieldBendX;
uniform float sampledOffsetFieldDistortionBias;
uniform float sampledOffsetFieldDistortionScale;
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
#ifdef USE_MAP
  vec2 sampledOffsetFieldBaseUv = vMapUv * sampledOffsetFieldBaseRepeat;
  vec2 sampledOffsetFieldDistortionUv = vMapUv * sampledOffsetFieldDistortionRepeat;
  vec4 sampledOffsetFieldDistortionTexel = texture2D(sampledOffsetFieldDistortionMap, sampledOffsetFieldDistortionUv);
  vec2 sampledOffsetFieldDistortion = (vec2(sampledOffsetFieldDistortionTexel.${channelX}, sampledOffsetFieldDistortionTexel.${channelY}) + vec2(sampledOffsetFieldDistortionBias)) * sampledOffsetFieldDistortionScale;
  float sampledOffsetFieldBend = ((vMapUv.x + sampledOffsetFieldBendX.x) * sampledOffsetFieldBendX.y) * ((vMapUv.y + sampledOffsetFieldBendX.z) * sampledOffsetFieldBendX.w);
  vec2 sampledOffsetFieldUv = sampledOffsetFieldBaseUv + sampledOffsetFieldDistortion + vec2(sampledOffsetFieldBend, 0.0) + sampledOffsetFieldRuntimeOffset;
  vec4 sampledDiffuseColor = texture2D(sampledOffsetFieldMap, sampledOffsetFieldUv);
  vec4 sampledMaskColor = texture2D(map, vMapUv);
  sampledDiffuseColor.a *= sampledMaskColor.a;
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
      `.trim(),
    );
    material.userData.sampledOffsetFieldShader = shader;
  };
  material.needsUpdate = true;
  return material;
}

function applyRuntimeEffectSampledCenterScaleDistortShader(material, uvAnimation) {
  if (uvAnimation?.mode !== "sampledCenterScaleDistort") return material;
  const fieldMap = runtimeEffectPreviewFieldTextureForUvAnimation(uvAnimation);
  const distortionMap = runtimeEffectPreviewDistortionTextureForUvAnimation(uvAnimation);
  const maskMap = runtimeEffectPreviewAmplitudeMaskTextureForUvAnimation(uvAnimation);
  if (!fieldMap || !distortionMap || !maskMap) return material;
  const distortionChannels = Array.isArray(uvAnimation.distortionChannels) ? uvAnimation.distortionChannels : ["x", "y"];
  const channelX = ["x", "y", "z", "w"].includes(distortionChannels[0]) ? distortionChannels[0] : "x";
  const channelY = ["x", "y", "z", "w"].includes(distortionChannels[1]) ? distortionChannels[1] : "y";
  const center = uvAnimation.center || [0.5, 0.5];
  const maskRepeat = uvAnimation.amplitudeMaskRepeat || [1, 1];
  const maskOffset = uvAnimation.amplitudeMaskOffset || [0, 0];
  const maskSmoothstep = uvAnimation.amplitudeMaskSmoothstep || [0, 1];
  const uniforms = {
    sampledCenterScaleDistortMap: { value: fieldMap },
    sampledCenterScaleDistortDistortionMap: { value: distortionMap },
    sampledCenterScaleDistortMaskMap: { value: maskMap },
    sampledCenterScaleDistortCenter: { value: new THREE.Vector2(Number(center[0]) || 0.5, Number(center[1]) || 0.5) },
    sampledCenterScaleDistortMaskRepeat: { value: new THREE.Vector2(Number(maskRepeat[0]) || 1, Number(maskRepeat[1]) || 1) },
    sampledCenterScaleDistortMaskOffset: { value: new THREE.Vector2(Number(maskOffset[0]) || 0, Number(maskOffset[1]) || 0) },
    sampledCenterScaleDistortMaskSmoothstep: { value: new THREE.Vector2(Number(maskSmoothstep[0]) || 0, Number(maskSmoothstep[1]) || 1) },
    sampledCenterScaleDistortCenterScale: { value: 1 },
    sampledCenterScaleDistortDistortionBias: { value: Number(uvAnimation.distortionBias) || 0 },
    sampledCenterScaleDistortDistortionScale: { value: Number(uvAnimation.distortionScale) || 1 },
    sampledCenterScaleDistortAmplitude: { value: 0 },
  };
  material.userData.sampledCenterScaleDistortUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    runtimeEffectDeclareFragmentUniforms(
      shader,
      `
uniform sampler2D sampledCenterScaleDistortMap;
uniform sampler2D sampledCenterScaleDistortDistortionMap;
uniform sampler2D sampledCenterScaleDistortMaskMap;
uniform vec2 sampledCenterScaleDistortCenter;
uniform vec2 sampledCenterScaleDistortMaskRepeat;
uniform vec2 sampledCenterScaleDistortMaskOffset;
uniform vec2 sampledCenterScaleDistortMaskSmoothstep;
uniform float sampledCenterScaleDistortCenterScale;
uniform float sampledCenterScaleDistortDistortionBias;
uniform float sampledCenterScaleDistortDistortionScale;
uniform float sampledCenterScaleDistortAmplitude;
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
#ifdef USE_MAP
  vec2 sampledCenterScaleDistortDistortionUv = ((vMapUv - sampledCenterScaleDistortCenter) * sampledCenterScaleDistortCenterScale) + sampledCenterScaleDistortCenter;
  vec4 sampledCenterScaleDistortDistortionTexel = texture2D(sampledCenterScaleDistortDistortionMap, sampledCenterScaleDistortDistortionUv);
  vec2 sampledCenterScaleDistortMaskUv = vMapUv * sampledCenterScaleDistortMaskRepeat + sampledCenterScaleDistortMaskOffset;
  float sampledCenterScaleDistortMaskRaw = texture2D(sampledCenterScaleDistortMaskMap, sampledCenterScaleDistortMaskUv).x;
  float sampledCenterScaleDistortMask = smoothstep(sampledCenterScaleDistortMaskSmoothstep.x, sampledCenterScaleDistortMaskSmoothstep.y, sampledCenterScaleDistortMaskRaw);
  vec2 sampledCenterScaleDistortValue = vec2(sampledCenterScaleDistortDistortionTexel.${channelX}, sampledCenterScaleDistortDistortionTexel.${channelY});
  vec2 sampledCenterScaleDistortOffset = (sampledCenterScaleDistortValue + vec2(sampledCenterScaleDistortDistortionBias)) * sampledCenterScaleDistortDistortionScale * sampledCenterScaleDistortAmplitude * sampledCenterScaleDistortMask;
  vec2 sampledCenterScaleDistortUv = vMapUv + sampledCenterScaleDistortOffset;
  vec4 sampledDiffuseColor = texture2D(sampledCenterScaleDistortMap, sampledCenterScaleDistortUv);
  vec4 sampledMaskColor = texture2D(map, vMapUv);
  sampledDiffuseColor.a *= sampledMaskColor.a;
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
      `.trim(),
    );
    material.userData.sampledCenterScaleDistortShader = shader;
  };
  material.needsUpdate = true;
  return material;
}

function applyRuntimeEffectSampledScaleRotateShader(material, uvAnimation) {
  if (uvAnimation?.mode !== "sampledScaleRotate") return material;
  const fieldMap = runtimeEffectPreviewFieldTextureForUvAnimation(uvAnimation);
  const scaleMap = runtimeEffectPreviewScaleTextureForUvAnimation(uvAnimation);
  const maskMap = runtimeEffectPreviewScaleMaskTextureForUvAnimation(uvAnimation);
  if (!fieldMap || !scaleMap || !maskMap) return material;
  const center = uvAnimation.center || [0.5, 0.5];
  const scaleRepeat = uvAnimation.scaleRepeat || [1, 1];
  const scaleOffset = uvAnimation.scaleOffset || [0, 0];
  const maskRepeat = uvAnimation.scaleMaskRepeat || [1, 1];
  const maskOffset = uvAnimation.scaleMaskOffset || [0, 0];
  const maskSmoothstep = uvAnimation.scaleMaskSmoothstep || [0, 1];
  const scaleChannel = ["x", "y", "z", "w"].includes(uvAnimation.scaleSamplerChannel) ? uvAnimation.scaleSamplerChannel : "x";
  const maskChannel = ["x", "y", "z", "w"].includes(uvAnimation.scaleMaskChannel) ? uvAnimation.scaleMaskChannel : "x";
  const uniforms = {
    sampledScaleRotateMap: { value: fieldMap },
    sampledScaleRotateScaleMap: { value: scaleMap },
    sampledScaleRotateMaskMap: { value: maskMap },
    sampledScaleRotateCenter: { value: new THREE.Vector2(Number(center[0]) || 0.5, Number(center[1]) || 0.5) },
    sampledScaleRotateScaleRepeat: { value: new THREE.Vector2(Number(scaleRepeat[0]) || 1, Number(scaleRepeat[1]) || 1) },
    sampledScaleRotateScaleOffset: { value: new THREE.Vector2(Number(scaleOffset[0]) || 0, Number(scaleOffset[1]) || 0) },
    sampledScaleRotateMaskRepeat: { value: new THREE.Vector2(Number(maskRepeat[0]) || 1, Number(maskRepeat[1]) || 1) },
    sampledScaleRotateMaskOffset: { value: new THREE.Vector2(Number(maskOffset[0]) || 0, Number(maskOffset[1]) || 0) },
    sampledScaleRotateMaskSmoothstep: { value: new THREE.Vector2(Number(maskSmoothstep[0]) || 0, Number(maskSmoothstep[1]) || 1) },
    sampledScaleRotateScaleBase: { value: Number(uvAnimation.scaleBase) || 1 },
    sampledScaleRotateSamplerBias: { value: Number(uvAnimation.scaleSamplerBias) || 0 },
    sampledScaleRotateSamplerScale: { value: Number(uvAnimation.scaleSamplerScale) || 1 },
    sampledScaleRotateScaleAmplitude: { value: 0 },
    sampledScaleRotateRotation: { value: 0 },
  };
  material.userData.sampledScaleRotateUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    runtimeEffectDeclareFragmentUniforms(
      shader,
      `
uniform sampler2D sampledScaleRotateMap;
uniform sampler2D sampledScaleRotateScaleMap;
uniform sampler2D sampledScaleRotateMaskMap;
uniform vec2 sampledScaleRotateCenter;
uniform vec2 sampledScaleRotateScaleRepeat;
uniform vec2 sampledScaleRotateScaleOffset;
uniform vec2 sampledScaleRotateMaskRepeat;
uniform vec2 sampledScaleRotateMaskOffset;
uniform vec2 sampledScaleRotateMaskSmoothstep;
uniform float sampledScaleRotateScaleBase;
uniform float sampledScaleRotateSamplerBias;
uniform float sampledScaleRotateSamplerScale;
uniform float sampledScaleRotateScaleAmplitude;
uniform float sampledScaleRotateRotation;
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
#ifdef USE_MAP
  vec2 sampledScaleRotateScaleUv = vMapUv * sampledScaleRotateScaleRepeat + sampledScaleRotateScaleOffset;
  float sampledScaleRotateScaleRaw = texture2D(sampledScaleRotateScaleMap, sampledScaleRotateScaleUv).${scaleChannel};
  vec2 sampledScaleRotateMaskUv = vMapUv * sampledScaleRotateMaskRepeat + sampledScaleRotateMaskOffset;
  float sampledScaleRotateMaskRaw = texture2D(sampledScaleRotateMaskMap, sampledScaleRotateMaskUv).${maskChannel};
  float sampledScaleRotateMask = smoothstep(sampledScaleRotateMaskSmoothstep.x, sampledScaleRotateMaskSmoothstep.y, sampledScaleRotateMaskRaw);
  float sampledScaleRotateScale = sampledScaleRotateScaleBase + ((sampledScaleRotateScaleRaw * sampledScaleRotateSamplerScale) + sampledScaleRotateSamplerBias) * sampledScaleRotateMask * sampledScaleRotateScaleAmplitude;
  vec2 sampledScaleRotateCenteredUv = (vMapUv - sampledScaleRotateCenter) * sampledScaleRotateScale;
  float sampledScaleRotateCos = cos(sampledScaleRotateRotation);
  float sampledScaleRotateSin = sin(sampledScaleRotateRotation);
  vec2 sampledScaleRotateUv = vec2(
    sampledScaleRotateCos * sampledScaleRotateCenteredUv.x - sampledScaleRotateSin * sampledScaleRotateCenteredUv.y,
    sampledScaleRotateSin * sampledScaleRotateCenteredUv.x + sampledScaleRotateCos * sampledScaleRotateCenteredUv.y
  ) + sampledScaleRotateCenter;
  vec4 sampledDiffuseColor = texture2D(sampledScaleRotateMap, sampledScaleRotateUv);
  vec4 sampledMaskColor = texture2D(map, vMapUv);
  sampledDiffuseColor.a *= sampledMaskColor.a;
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
      `.trim(),
    );
    material.userData.sampledScaleRotateShader = shader;
  };
  material.needsUpdate = true;
  return material;
}

function runtimeEffectRuntimeUvFallbackForLayer(entry, layerIndex) {
  const shadergraphItem = runtimeEffectShadergraphForLayer(entry, layerIndex);
  if (!shadergraphItem?.previewUvAnimationGapReason) return null;
  if (
    shadergraphItem.previewUvAnimationGapReason === "trig-rotated-uv" &&
    shadergraphItem.previewUvRuntimeEvidence?.kind === "pfx-surface-vertex-color-parameters"
  ) {
    const offsets = (shadergraphItem.previewUvRuntimeEvidence.parameterSampleOffsets || []).map(Number).filter(Number.isFinite);
    const vertexColorInputs = shadergraphItem.previewUvRuntimeEvidence.vertexColorInputs || [];
    if (!offsets.length || !vertexColorInputs.length) return null;
    const phaseScale = Math.max(0.35, Math.min(1.35, offsets.length / 6));
    return {
      mode: "rotate",
      center: [0.5, 0.5],
      rotationOffset: 0,
      rotationSpeed: -Math.PI * 2,
      phaseScale,
      runtimeEvidenceKind: "pfx-surface-vertex-color-parameters",
    };
  }
  if (
    shadergraphItem.previewUvAnimationGapReason === "sampled-uv-distortion" &&
    shadergraphItem.previewUvRuntimeEvidence?.kind === "pfx-surface-vertex-color-parameters"
  ) {
    const offsets = (shadergraphItem.previewUvRuntimeEvidence.parameterSampleOffsets || []).map(Number).filter(Number.isFinite);
    const vertexColorInputs = shadergraphItem.previewUvRuntimeEvidence.vertexColorInputs || [];
    if (!offsets.length || !vertexColorInputs.length) return null;
    const phaseScale = Math.max(0.35, Math.min(1.65, offsets.length / 5));
    const amplitude = Math.max(0.008, Math.min(0.045, offsets.length * 0.004));
    return {
      mode: "distort",
      offset: [0, 0],
      amplitude,
      phaseScale,
      runtimeEvidenceKind: "pfx-surface-vertex-color-parameters",
    };
  }
  if (shadergraphItem.previewUvRuntimeEvidence?.kind !== "pfx-surface-uv-parameters") return null;
  const offsets = (shadergraphItem.previewUvRuntimeEvidence.parameterSampleOffsets || []).map(Number).filter(Number.isFinite);
  if (!offsets.length) return null;
  const phaseScale = Math.max(0.35, Math.min(2, offsets.length / 4));
  return {
    mode: "scroll",
    speed: [0.035, 0.02],
    offset: [0, 0],
    phaseScale,
    runtimeEvidenceKind: "pfx-surface-uv-parameters",
  };
}

function runtimeEffectUvAnimationLinearTerms(value) {
  const components = Array.isArray(value) ? value : [[], []];
  const normalized = [];
  for (let index = 0; index < 2; index += 1) {
    const terms = Array.isArray(components[index]) ? components[index] : [];
    const component = terms.map((term) => ({
      source: String(term?.source || ""),
      scale: Number(term?.scale),
    }));
    if (!component.every((term) => /^var\d+\.[xyzw]$/.test(term.source) && Number.isFinite(term.scale))) return null;
    normalized.push(component);
  }
  return normalized;
}

function runtimeEffectPreviewUvAnimationForLayer(entry, layerIndex) {
  const uvAnimation = runtimeEffectShadergraphForLayer(entry, layerIndex)?.previewUvAnimation;
  if (!uvAnimation?.mode) return runtimeEffectRuntimeUvFallbackForLayer(entry, layerIndex);
  if (uvAnimation.mode === "flipbook") {
    if (!Array.isArray(uvAnimation.repeat) || uvAnimation.repeat.length < 2) return null;
    const repeat = uvAnimation.repeat.map((value) => Number(value));
    const frameColumns = Number(uvAnimation.frameColumns);
    const frameRows = Number(uvAnimation.frameRows);
    const frameCount = Number(uvAnimation.frameCount);
    if (!repeat.every((value) => Number.isFinite(value) && value > 0 && value <= 1)) return null;
    if (!Number.isInteger(frameColumns) || !Number.isInteger(frameRows) || !Number.isInteger(frameCount)) return null;
    return { ...uvAnimation, repeat, frameColumns, frameRows, frameCount };
  }
  if (uvAnimation.mode === "scroll") {
    if (!Array.isArray(uvAnimation.speed) || uvAnimation.speed.length < 2) return null;
    const speed = uvAnimation.speed.map((value) => Number(value));
    const offset = Array.isArray(uvAnimation.offset) ? uvAnimation.offset.map((value) => Number(value)) : [0, 0];
    const repeat = Array.isArray(uvAnimation.repeat) ? uvAnimation.repeat.map((value) => Number(value)) : null;
    if (!speed.every(Number.isFinite) || !offset.every(Number.isFinite)) return null;
    if (repeat && !repeat.every((value) => Number.isFinite(value) && value > 0)) return null;
    return repeat ? { ...uvAnimation, speed, offset, repeat } : { ...uvAnimation, speed, offset };
  }
  if (uvAnimation.mode === "centerScale") {
    if (!Array.isArray(uvAnimation.speed) || uvAnimation.speed.length < 2) return null;
    const speed = uvAnimation.speed.map((value) => Number(value));
    const offset = Array.isArray(uvAnimation.offset) ? uvAnimation.offset.map((value) => Number(value)) : [0, 0];
    const center = Array.isArray(uvAnimation.center) ? uvAnimation.center.map((value) => Number(value)) : [0.5, 0.5];
    const phaseInputOffset = Number(uvAnimation.phaseInputOffset || 0);
    const phaseInputScale = Number(Object.hasOwn(uvAnimation, "phaseInputScale") ? uvAnimation.phaseInputScale : 1);
    const phasePower = Number(uvAnimation.phasePower || 1);
    if (
      !speed.every(Number.isFinite) ||
      !offset.every(Number.isFinite) ||
      center.length < 2 ||
      !center.every(Number.isFinite) ||
      !Number.isFinite(phaseInputOffset) ||
      !Number.isFinite(phaseInputScale) ||
      !Number.isFinite(phasePower)
    ) {
      return null;
    }
    return { ...uvAnimation, speed, offset, center, phaseInputOffset, phaseInputScale, phasePower };
  }
  if (uvAnimation.mode === "scaleOffset") {
    const repeat = Array.isArray(uvAnimation.repeat) ? uvAnimation.repeat.map((value) => Number(value)) : [1, 1];
    const offset = Array.isArray(uvAnimation.offset) ? uvAnimation.offset.map((value) => Number(value)) : [0, 0];
    const repeatTerms = runtimeEffectUvAnimationLinearTerms(uvAnimation.repeatTerms);
    const offsetTerms = runtimeEffectUvAnimationLinearTerms(uvAnimation.offsetTerms);
    if (
      repeat.length < 2 ||
      offset.length < 2 ||
      !repeat.every(Number.isFinite) ||
      !offset.every(Number.isFinite) ||
      !repeatTerms ||
      !offsetTerms
    ) {
      return null;
    }
    return { ...uvAnimation, repeat, offset, repeatTerms, offsetTerms };
  }
  if (uvAnimation.mode === "rotate") {
    const center = Array.isArray(uvAnimation.center) ? uvAnimation.center.map((value) => Number(value)) : [0.5, 0.5];
    const repeat = Array.isArray(uvAnimation.repeat) ? uvAnimation.repeat.map((value) => Number(value)) : [1, 1];
    const repeatTerms = runtimeEffectUvAnimationLinearTerms(uvAnimation.repeatTerms);
    const rotationSpeed = Number(uvAnimation.rotationSpeed);
    const rotationOffset = Number(uvAnimation.rotationOffset || 0);
    const rotationPhaseTerms = Array.isArray(uvAnimation.rotationPhaseTerms)
      ? uvAnimation.rotationPhaseTerms.map((term) => ({
          source: String(term?.source || ""),
          scale: Number(term?.scale),
        }))
      : [];
    const preRotationOffset = Array.isArray(uvAnimation.preRotationOffset)
      ? uvAnimation.preRotationOffset.map((value) => Number(value))
      : [0, 0];
    const preRotationOffsetSpeed = Array.isArray(uvAnimation.preRotationOffsetSpeed)
      ? uvAnimation.preRotationOffsetSpeed.map((value) => Number(value))
      : [0, 0];
    const preRotationOffsetTerms = runtimeEffectUvAnimationLinearTerms(uvAnimation.preRotationOffsetTerms);
    if (
      center.length < 2 ||
      repeat.length < 2 ||
      !center.every(Number.isFinite) ||
      !repeat.every(Number.isFinite) ||
      !repeatTerms ||
      preRotationOffset.length < 2 ||
      !preRotationOffset.every(Number.isFinite) ||
      preRotationOffsetSpeed.length < 2 ||
      !preRotationOffsetSpeed.every(Number.isFinite) ||
      !preRotationOffsetTerms ||
      !rotationPhaseTerms.every((term) => /^var\d+\.[xyzw]$/.test(term.source) && Number.isFinite(term.scale)) ||
      !Number.isFinite(rotationSpeed) ||
      !Number.isFinite(rotationOffset)
    ) {
      return null;
    }
    return {
      ...uvAnimation,
      center,
      rotationSpeed,
      rotationOffset,
      repeat,
      repeatTerms,
      preRotationOffset,
      preRotationOffsetTerms,
      preRotationOffsetSpeed,
      rotationPhaseTerms,
      flipX: Boolean(uvAnimation.flipX),
      flipY: Boolean(uvAnimation.flipY),
    };
  }
  if (uvAnimation.mode === "distort") {
    const offset = Array.isArray(uvAnimation.offset) ? uvAnimation.offset.map((value) => Number(value)) : [0, 0];
    const amplitude = Number(uvAnimation.amplitude);
    if (!offset.every(Number.isFinite) || !Number.isFinite(amplitude) || amplitude <= 0) return null;
    return { ...uvAnimation, offset, amplitude };
  }
  if (uvAnimation.mode === "sampledDistort") {
    const validDistortionChannels = ["x", "y", "z", "w"];
    const axis = Array.isArray(uvAnimation.axis) ? uvAnimation.axis.map((value) => Number(value)) : [1, 1];
    const offset = Array.isArray(uvAnimation.offset) ? uvAnimation.offset.map((value) => Number(value)) : [0, 0];
    const offsetSpeed = Array.isArray(uvAnimation.offsetSpeed) ? uvAnimation.offsetSpeed.map((value) => Number(value)) : [0, 0];
    const center = Array.isArray(uvAnimation.center) ? uvAnimation.center.map((value) => Number(value)) : [0.5, 0.5];
    const fallbackChannel = validDistortionChannels.includes(uvAnimation.distortionChannel) ? uvAnimation.distortionChannel : "x";
    const distortionChannels = Array.isArray(uvAnimation.distortionChannels)
      ? uvAnimation.distortionChannels.map((channel) => String(channel)).slice(0, 2)
      : [fallbackChannel, fallbackChannel];
    const amplitudeMaskChannel = validDistortionChannels.includes(uvAnimation.amplitudeMaskChannel)
      ? uvAnimation.amplitudeMaskChannel
      : "";
    const distortionScale = Number(uvAnimation.distortionScale);
    const distortionBias = Number(uvAnimation.distortionBias || 0);
    const rotationOffset = Number(uvAnimation.rotationOffset || 0);
    const rotationSpeed = Number(uvAnimation.rotationSpeed || 0);
    const rotationPhaseSource = String(uvAnimation.rotationPhaseSource || "");
    if (
      axis.length < 2 ||
      offset.length < 2 ||
      offsetSpeed.length < 2 ||
      center.length < 2 ||
      distortionChannels.length < 2 ||
      !axis.every(Number.isFinite) ||
      !offset.every(Number.isFinite) ||
      !offsetSpeed.every(Number.isFinite) ||
      !center.every(Number.isFinite) ||
      !distortionChannels.every((channel) => validDistortionChannels.includes(channel)) ||
      !Number.isFinite(distortionScale) ||
      !Number.isFinite(distortionBias) ||
      !Number.isFinite(rotationOffset) ||
      !Number.isFinite(rotationSpeed)
    ) {
      return null;
    }
    return { ...uvAnimation, axis, offset, offsetSpeed, center, distortionScale, distortionBias, distortionChannels, amplitudeMaskChannel, rotationOffset, rotationSpeed, rotationPhaseSource };
  }
  if (uvAnimation.mode === "sampledWarp") {
    const validChannels = ["x", "y", "z", "w"];
    const baseRepeat = Array.isArray(uvAnimation.baseRepeat) ? uvAnimation.baseRepeat.map((value) => Number(value)) : [1, 1];
    const distortionRepeat = Array.isArray(uvAnimation.distortionRepeat)
      ? uvAnimation.distortionRepeat.map((value) => Number(value))
      : [1, 1];
    const uvScaleRepeat = Array.isArray(uvAnimation.uvScaleRepeat) ? uvAnimation.uvScaleRepeat.map((value) => Number(value)) : [1, 1];
    const distortionChannels = Array.isArray(uvAnimation.distortionChannels)
      ? uvAnimation.distortionChannels.map((channel) => String(channel)).slice(0, 2)
      : ["x", "y"];
    const distortionWeightChannel = validChannels.includes(uvAnimation.distortionWeightChannel)
      ? uvAnimation.distortionWeightChannel
      : "z";
    const distortionValueScale = Number(uvAnimation.distortionValueScale);
    const distortionBias = Number(uvAnimation.distortionBias);
    const distortionScale = Number(uvAnimation.distortionScale);
    const runtimeOffsetBias = Array.isArray(uvAnimation.runtimeOffsetBias)
      ? uvAnimation.runtimeOffsetBias.map((value) => Number(value))
      : [0, 0];
    const runtimeOffsetScale = Array.isArray(uvAnimation.runtimeOffsetScale)
      ? uvAnimation.runtimeOffsetScale.map((value) => Number(value))
      : [0, 0];
    if (
      baseRepeat.length < 2 ||
      distortionRepeat.length < 2 ||
      uvScaleRepeat.length < 2 ||
      runtimeOffsetBias.length < 2 ||
      runtimeOffsetScale.length < 2 ||
      distortionChannels.length < 2 ||
      !baseRepeat.every(Number.isFinite) ||
      !distortionRepeat.every(Number.isFinite) ||
      !uvScaleRepeat.every(Number.isFinite) ||
      !runtimeOffsetBias.every(Number.isFinite) ||
      !runtimeOffsetScale.every(Number.isFinite) ||
      !distortionChannels.every((channel) => validChannels.includes(channel)) ||
      !Number.isFinite(distortionValueScale) ||
      !Number.isFinite(distortionBias) ||
      !Number.isFinite(distortionScale)
    ) {
      return null;
    }
    return { ...uvAnimation, baseRepeat, distortionRepeat, uvScaleRepeat, distortionChannels, distortionWeightChannel, distortionValueScale, distortionBias, distortionScale, runtimeOffsetBias, runtimeOffsetScale };
  }
  if (uvAnimation.mode === "sampledOffsetField") {
    const validChannels = ["x", "y", "z", "w"];
    const baseRepeat = Array.isArray(uvAnimation.baseRepeat) ? uvAnimation.baseRepeat.map((value) => Number(value)) : [1, 1];
    const distortionRepeat = Array.isArray(uvAnimation.distortionRepeat)
      ? uvAnimation.distortionRepeat.map((value) => Number(value))
      : [1, 1];
    const distortionChannels = Array.isArray(uvAnimation.distortionChannels)
      ? uvAnimation.distortionChannels.map((channel) => String(channel)).slice(0, 2)
      : ["x", "y"];
    const runtimeOffsetAxis = Array.isArray(uvAnimation.runtimeOffsetAxis)
      ? uvAnimation.runtimeOffsetAxis.map((value) => Number(value))
      : [0, 0];
    const uvBend = uvAnimation.uvBend || {};
    const bendX = uvBend.x || {};
    const normalizedBendX = {
      uOffset: Number(bendX.uOffset || 0),
      uScale: Number(bendX.uScale || 0),
      vOffset: Number(bendX.vOffset || 0),
      vScale: Number(bendX.vScale || 0),
    };
    const distortionBias = Number(uvAnimation.distortionBias);
    const distortionScale = Number(uvAnimation.distortionScale);
    if (
      baseRepeat.length < 2 ||
      distortionRepeat.length < 2 ||
      runtimeOffsetAxis.length < 2 ||
      distortionChannels.length < 2 ||
      !baseRepeat.every(Number.isFinite) ||
      !distortionRepeat.every(Number.isFinite) ||
      !runtimeOffsetAxis.every(Number.isFinite) ||
      !distortionChannels.every((channel) => validChannels.includes(channel)) ||
      !Object.values(normalizedBendX).every(Number.isFinite) ||
      !Number.isFinite(distortionBias) ||
      !Number.isFinite(distortionScale)
    ) {
      return null;
    }
    return {
      ...uvAnimation,
      baseRepeat,
      distortionRepeat,
      distortionChannels,
      runtimeOffsetAxis,
      uvBend: { x: normalizedBendX, y: null },
      distortionBias,
      distortionScale,
    };
  }
  if (uvAnimation.mode === "sampledCenterScaleDistort") {
    const validChannels = ["x", "y", "z", "w"];
    const center = Array.isArray(uvAnimation.center) ? uvAnimation.center.map((value) => Number(value)) : [0.5, 0.5];
    const distortionChannels = Array.isArray(uvAnimation.distortionChannels)
      ? uvAnimation.distortionChannels.map((channel) => String(channel)).slice(0, 2)
      : ["x", "y"];
    const amplitudeMaskRepeat = Array.isArray(uvAnimation.amplitudeMaskRepeat)
      ? uvAnimation.amplitudeMaskRepeat.map((value) => Number(value))
      : [1, 1];
    const amplitudeMaskOffset = Array.isArray(uvAnimation.amplitudeMaskOffset)
      ? uvAnimation.amplitudeMaskOffset.map((value) => Number(value))
      : [0, 0];
    const amplitudeMaskSmoothstep = Array.isArray(uvAnimation.amplitudeMaskSmoothstep)
      ? uvAnimation.amplitudeMaskSmoothstep.map((value) => Number(value))
      : [0, 1];
    const centerScaleInputOffset = Number(uvAnimation.centerScaleInputOffset || 0);
    const centerScaleInputScale = Number(Object.hasOwn(uvAnimation, "centerScaleInputScale") ? uvAnimation.centerScaleInputScale : 1);
    const centerScalePower = Number(uvAnimation.centerScalePower || 1);
    const distortionBias = Number(uvAnimation.distortionBias);
    const distortionScale = Number(uvAnimation.distortionScale);
    const centerScaleSource = String(uvAnimation.centerScaleSource || "");
    const amplitudeSource = String(uvAnimation.amplitudeSource || "");
    if (
      center.length < 2 ||
      distortionChannels.length < 2 ||
      amplitudeMaskRepeat.length < 2 ||
      amplitudeMaskOffset.length < 2 ||
      amplitudeMaskSmoothstep.length < 2 ||
      !center.every(Number.isFinite) ||
      !distortionChannels.every((channel) => validChannels.includes(channel)) ||
      !amplitudeMaskRepeat.every(Number.isFinite) ||
      !amplitudeMaskOffset.every(Number.isFinite) ||
      !amplitudeMaskSmoothstep.every(Number.isFinite) ||
      !Number.isFinite(centerScaleInputOffset) ||
      !Number.isFinite(centerScaleInputScale) ||
      !Number.isFinite(centerScalePower) ||
      !Number.isFinite(distortionBias) ||
      !Number.isFinite(distortionScale) ||
      !/^var\d+\.[xyzw]$/.test(centerScaleSource) ||
      !/^var\d+\.[xyzw]$/.test(amplitudeSource)
    ) {
      return null;
    }
    return {
      ...uvAnimation,
      center,
      distortionChannels,
      amplitudeMaskRepeat,
      amplitudeMaskOffset,
      amplitudeMaskSmoothstep,
      centerScaleInputOffset,
      centerScaleInputScale,
      centerScalePower,
      distortionBias,
      distortionScale,
      centerScaleSource,
      amplitudeSource,
    };
  }
  if (uvAnimation.mode === "sampledScaleRotate") {
    const validChannels = ["x", "y", "z", "w"];
    const center = Array.isArray(uvAnimation.center) ? uvAnimation.center.map((value) => Number(value)) : [0.5, 0.5];
    const scaleRepeat = Array.isArray(uvAnimation.scaleRepeat) ? uvAnimation.scaleRepeat.map((value) => Number(value)) : [1, 1];
    const scaleOffset = Array.isArray(uvAnimation.scaleOffset) ? uvAnimation.scaleOffset.map((value) => Number(value)) : [0, 0];
    const scaleMaskRepeat = Array.isArray(uvAnimation.scaleMaskRepeat)
      ? uvAnimation.scaleMaskRepeat.map((value) => Number(value))
      : [1, 1];
    const scaleMaskOffset = Array.isArray(uvAnimation.scaleMaskOffset)
      ? uvAnimation.scaleMaskOffset.map((value) => Number(value))
      : [0, 0];
    const scaleMaskSmoothstep = Array.isArray(uvAnimation.scaleMaskSmoothstep)
      ? uvAnimation.scaleMaskSmoothstep.map((value) => Number(value))
      : [0, 1];
    const scaleSamplerChannel = validChannels.includes(uvAnimation.scaleSamplerChannel) ? uvAnimation.scaleSamplerChannel : "x";
    const scaleMaskChannel = validChannels.includes(uvAnimation.scaleMaskChannel) ? uvAnimation.scaleMaskChannel : "x";
    const scaleBase = Number(uvAnimation.scaleBase);
    const scaleSamplerBias = Number(uvAnimation.scaleSamplerBias || 0);
    const scaleSamplerScale = Number(uvAnimation.scaleSamplerScale);
    const rotationOffset = Number(uvAnimation.rotationOffset || 0);
    const rotationSpeed = Number(uvAnimation.rotationSpeed);
    const scaleAmplitudeSource = String(uvAnimation.scaleAmplitudeSource || "");
    const rotationSource = String(uvAnimation.rotationSource || "");
    if (
      center.length < 2 ||
      scaleRepeat.length < 2 ||
      scaleOffset.length < 2 ||
      scaleMaskRepeat.length < 2 ||
      scaleMaskOffset.length < 2 ||
      scaleMaskSmoothstep.length < 2 ||
      !center.every(Number.isFinite) ||
      !scaleRepeat.every(Number.isFinite) ||
      !scaleOffset.every(Number.isFinite) ||
      !scaleMaskRepeat.every(Number.isFinite) ||
      !scaleMaskOffset.every(Number.isFinite) ||
      !scaleMaskSmoothstep.every(Number.isFinite) ||
      !Number.isFinite(scaleBase) ||
      !Number.isFinite(scaleSamplerBias) ||
      !Number.isFinite(scaleSamplerScale) ||
      !Number.isFinite(rotationOffset) ||
      !Number.isFinite(rotationSpeed) ||
      !/^var\d+\.[xyzw]$/.test(scaleAmplitudeSource) ||
      !/^var\d+\.[xyzw]$/.test(rotationSource)
    ) {
      return null;
    }
    return {
      ...uvAnimation,
      center,
      scaleRepeat,
      scaleOffset,
      scaleMaskRepeat,
      scaleMaskOffset,
      scaleMaskSmoothstep,
      scaleSamplerChannel,
      scaleMaskChannel,
      scaleBase,
      scaleSamplerBias,
      scaleSamplerScale,
      rotationOffset,
      rotationSpeed,
      scaleAmplitudeSource,
      rotationSource,
    };
  }
  if (uvAnimation.mode === "sampledRotate") {
    const validRotationChannels = ["x", "y", "z", "w"];
    const center = Array.isArray(uvAnimation.center) ? uvAnimation.center.map((value) => Number(value)) : [0.5, 0.5];
    const preRotationAxis = Array.isArray(uvAnimation.preRotationAxis)
      ? uvAnimation.preRotationAxis.map((value) => Number(value))
      : [0, 0];
    const rotationScale = Number(uvAnimation.rotationScale);
    const rotationChannel = validRotationChannels.includes(uvAnimation.rotationChannel) ? uvAnimation.rotationChannel : "x";
    if (
      center.length < 2 ||
      preRotationAxis.length < 2 ||
      !center.every(Number.isFinite) ||
      !preRotationAxis.every(Number.isFinite) ||
      !Number.isFinite(rotationScale)
    ) {
      return null;
    }
    return { ...uvAnimation, center, preRotationAxis, rotationScale, rotationChannel };
  }
  return null;
}

function runtimeEffectPreviewLayerTextureForEntry(entry, layerIndex) {
  const uvAnimation = runtimeEffectPreviewUvAnimationForLayer(entry, layerIndex);
  if (!uvAnimation) return runtimeEffectPreviewTextureForEntry(entry, layerIndex);
  if (!entry.previewLayerTextures) entry.previewLayerTextures = new Map();
  const repeatKey = uvAnimation.repeat ? `:${uvAnimation.repeat.join(",")}` : "";
  const uvKey = uvAnimation.mode === "flipbook"
    ? `${uvAnimation.repeat.join(",")}:${uvAnimation.frameCount}`
    : uvAnimation.mode === "rotate"
      ? `${uvAnimation.center.join(",")}:${uvAnimation.repeat.join(",")}:${uvAnimation.repeatTerms.map((terms) => terms.map((term) => `${term.source}:${term.scale}`).join(",")).join("|")}:${uvAnimation.rotationOffset}:${uvAnimation.rotationSpeed}:${(uvAnimation.rotationPhaseTerms || []).map((term) => `${term.source}:${term.scale}`).join(",")}:${uvAnimation.preRotationOffset?.join(",")}:${uvAnimation.preRotationOffsetTerms.map((terms) => terms.map((term) => `${term.source}:${term.scale}`).join(",")).join("|")}:${uvAnimation.preRotationOffsetSpeed?.join(",")}:${uvAnimation.flipX}:${uvAnimation.flipY}`
    : uvAnimation.mode === "distort"
      ? `${uvAnimation.offset.join(",")}:${uvAnimation.amplitude}`
    : uvAnimation.mode === "sampledDistort"
      ? `${uvAnimation.axis.join(",")}:${uvAnimation.offset.join(",")}:${uvAnimation.offsetSpeed.join(",")}:${uvAnimation.center.join(",")}:${uvAnimation.rotationOffset}:${uvAnimation.rotationSpeed}:${uvAnimation.rotationPhaseSource}:${uvAnimation.distortionBias}:${uvAnimation.distortionScale}:${uvAnimation.distortionSampler}:${uvAnimation.distortionChannel}:${uvAnimation.distortionChannels.join(",")}:${uvAnimation.amplitudeMaskChannel}:${uvAnimation.amplitudeMaskTexture || ""}:${uvAnimation.distortionTexture || ""}`
    : uvAnimation.mode === "sampledRotate"
      ? `${uvAnimation.center.join(",")}:${uvAnimation.preRotationAxis.join(",")}:${uvAnimation.rotationScale}:${uvAnimation.rotationChannel}:${uvAnimation.rotationSampler}:${uvAnimation.rotationTexture || ""}`
    : uvAnimation.mode === "sampledWarp"
      ? `${uvAnimation.baseRepeat.join(",")}:${uvAnimation.distortionRepeat.join(",")}:${uvAnimation.uvScaleRepeat.join(",")}:${uvAnimation.distortionChannels.join(",")}:${uvAnimation.distortionWeightChannel}:${uvAnimation.distortionValueScale}:${uvAnimation.distortionBias}:${uvAnimation.distortionScale}:${uvAnimation.runtimeOffsetBias.join(",")}:${uvAnimation.runtimeOffsetScale.join(",")}:${uvAnimation.distortionTexture || ""}:${uvAnimation.warpTexture || ""}`
    : uvAnimation.mode === "sampledOffsetField"
      ? `${uvAnimation.baseRepeat.join(",")}:${uvAnimation.distortionRepeat.join(",")}:${uvAnimation.distortionChannels.join(",")}:${uvAnimation.distortionBias}:${uvAnimation.distortionScale}:${uvAnimation.runtimeOffsetAxis.join(",")}:${uvAnimation.uvBend.x.uOffset}:${uvAnimation.uvBend.x.uScale}:${uvAnimation.uvBend.x.vOffset}:${uvAnimation.uvBend.x.vScale}:${uvAnimation.distortionTexture || ""}:${uvAnimation.fieldTexture || ""}`
    : uvAnimation.mode === "sampledCenterScaleDistort"
      ? `${uvAnimation.center.join(",")}:${uvAnimation.distortionChannels.join(",")}:${uvAnimation.centerScaleInputOffset}:${uvAnimation.centerScaleInputScale}:${uvAnimation.centerScalePower}:${uvAnimation.distortionBias}:${uvAnimation.distortionScale}:${uvAnimation.amplitudeMaskRepeat.join(",")}:${uvAnimation.amplitudeMaskOffset.join(",")}:${uvAnimation.amplitudeMaskSmoothstep.join(",")}:${uvAnimation.distortionTexture || ""}:${uvAnimation.amplitudeMaskTexture || ""}:${uvAnimation.fieldTexture || ""}`
    : uvAnimation.mode === "sampledScaleRotate"
      ? `${uvAnimation.center.join(",")}:${uvAnimation.scaleRepeat.join(",")}:${uvAnimation.scaleOffset.join(",")}:${uvAnimation.scaleMaskRepeat.join(",")}:${uvAnimation.scaleMaskOffset.join(",")}:${uvAnimation.scaleMaskSmoothstep.join(",")}:${uvAnimation.scaleSamplerChannel}:${uvAnimation.scaleMaskChannel}:${uvAnimation.scaleBase}:${uvAnimation.scaleSamplerBias}:${uvAnimation.scaleSamplerScale}:${uvAnimation.rotationOffset}:${uvAnimation.rotationSpeed}:${uvAnimation.fieldTexture || ""}:${uvAnimation.scaleTexture || ""}:${uvAnimation.scaleMaskTexture || ""}`
    : uvAnimation.mode === "scaleOffset"
      ? `${uvAnimation.repeat.join(",")}:${uvAnimation.offset.join(",")}:${uvAnimation.repeatTerms.map((terms) => terms.map((term) => `${term.source}:${term.scale}`).join(",")).join("|")}:${uvAnimation.offsetTerms.map((terms) => terms.map((term) => `${term.source}:${term.scale}`).join(",")).join("|")}`
    : uvAnimation.mode === "centerScale"
      ? `${uvAnimation.center.join(",")}:${uvAnimation.speed.join(",")}:${uvAnimation.offset.join(",")}:${uvAnimation.phaseInputOffset}:${uvAnimation.phaseInputScale}:${uvAnimation.phasePower}`
      : `${uvAnimation.speed.join(",")}:${uvAnimation.offset.join(",")}${repeatKey}`;
  const key = `${layerIndex}:${uvAnimation.mode}:${uvKey}`;
  if (!entry.previewLayerTextures.has(key)) {
    const texture = runtimeEffectPreviewTextureForEntry(entry, layerIndex).clone();
    texture.name = `runtime_effect_preview_uv_${key}`;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (uvAnimation.repeat) texture.repeat.set(uvAnimation.repeat[0], uvAnimation.repeat[1]);
    if (texture.image) texture.needsUpdate = true;
    entry.previewLayerTextures.set(key, texture);
  }
  return entry.previewLayerTextures.get(key);
}

function runtimeEffectPreviewAlphaMapForEntry(entry, layerIndex) {
  const shadergraphItem = runtimeEffectShadergraphForLayer(entry, layerIndex);
  if (
    !(
      runtimeEffectPreviewTextureNeedsAlphaMap(shadergraphItem) ||
      runtimeEffectPreviewTextureNeedsRuntimeAlphaMap(shadergraphItem, entry.pfxItem, entry)
    )
  )
    return null;
  return runtimeEffectPreviewLayerTextureForEntry(entry, layerIndex);
}

function runtimeEffectLayerCount(entry) {
  const colors = (entry.colors || []).filter((color) => !/^#0{6}$/i.test(color));
  const colorCount = colors.length;
  const textureCount = entry.previewTextures?.length || 0;
  const surfaceRecordCount = runtimeEffectPreviewSurfaceRecords(entry).length;
  return Math.max(1, Math.min(RUNTIME_EFFECT_PREVIEW_MAX_LAYERS, Math.max(colorCount, textureCount, surfaceRecordCount)));
}

function runtimeEffectNonNegativeTimingValues(values = []) {
  return [...new Set(
    values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .map((value) => Number(value.toFixed(4))),
  )];
}

function runtimeEffectPfxBindingProfileTimingScore(profile, hook) {
  let score = 0;
  const hookStartSeconds = Number(hook?.runtimeBinding?.startSeconds);
  const profileStartSeconds = Number(profile?.startSeconds);
  if (Number.isFinite(hookStartSeconds) && hookStartSeconds >= 0 && Number.isFinite(profileStartSeconds) && profileStartSeconds >= 0) {
    score += Math.abs(hookStartSeconds - profileStartSeconds) <= 0.001 ? -4 : 2;
  }

  const hookTimes = runtimeEffectNonNegativeTimingValues(hook?.runtimeBinding?.timelineTimes || []);
  const profileTimes = runtimeEffectNonNegativeTimingValues(profile?.timelineTimes || []);
  for (const hookTime of hookTimes) {
    const matched = profileTimes.some((profileTime) => Math.abs(profileTime - hookTime) <= 0.001);
    score += matched ? -1 : 1;
  }
  return score;
}

function runtimeEffectPfxBindingProfileActionScore(profile, actionKeys) {
  const profileActions = (profile?.actionKeys || []).filter(Boolean);
  if (!actionKeys?.size) return profileActions.length ? 0.25 : 0;
  if (!profileActions.length) return 0;
  const matchedActionCount = profileActions.filter((actionKey) => actionKeys.has(actionKey)).length;
  if (!matchedActionCount) return 0;
  const extraActionCount = profileActions.filter((actionKey) => !actionKeys.has(actionKey)).length;
  return extraActionCount * 0.25;
}

function runtimeEffectPfxBindingProfileBoneScore(profile, hookBoneToken) {
  const profileBoneToken = profile?.boneToken || "";
  if (hookBoneToken) return profileBoneToken === hookBoneToken ? -2 : 0;
  return profileBoneToken ? 0.5 : -0.5;
}

function runtimeEffectPfxBindingProfileOptionValueScore(profileValue, hookValue) {
  if (profileValue == null) return 0.5;
  if (typeof profileValue === "number" || typeof hookValue === "number") {
    const profileNumber = Number(profileValue);
    const hookNumber = Number(hookValue);
    if (!Number.isFinite(profileNumber) || !Number.isFinite(hookNumber)) return 0;
    return Math.abs(profileNumber - hookNumber) <= 0.001 ? -1 : 1;
  }
  return profileValue === hookValue ? -1 : 1;
}

function runtimeEffectOptionOffsetValues(options = {}) {
  const offsetValues = options?.offsetValues;
  return offsetValues && typeof offsetValues === "object" && !Array.isArray(offsetValues) ? offsetValues : {};
}

function runtimeEffectOffsetValueVector(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((entry) => Number(entry))
    .filter(Number.isFinite)
    .map((entry) => Number(entry.toFixed(4)));
}

function runtimeEffectOffsetValueVectorsMatch(profileValue, hookValue) {
  const profileVector = runtimeEffectOffsetValueVector(profileValue);
  const hookVector = runtimeEffectOffsetValueVector(hookValue);
  if (!profileVector.length || profileVector.length !== hookVector.length) return false;
  return profileVector.every((entry, index) => Math.abs(entry - hookVector[index]) <= 0.001);
}

function runtimeEffectPfxBindingProfileOffsetValueScore(profile, hook) {
  const hookOptions = hook?.runtimeBinding?.effectOptions || {};
  const profileOptions = profile?.effectOptions || {};
  const hookOffsetValues = runtimeEffectOptionOffsetValues(hookOptions);
  const profileOffsetValues = runtimeEffectOptionOffsetValues(profileOptions);
  let score = 0;
  for (const [offset, hookValues] of Object.entries(hookOffsetValues)) {
    if (!runtimeEffectOffsetValueVector(hookValues).length) continue;
    if (!(offset in profileOffsetValues)) {
      score += 0.25;
      continue;
    }
    score += runtimeEffectOffsetValueVectorsMatch(profileOffsetValues[offset], hookValues) ? -0.75 : 0.75;
  }
  return score;
}

function runtimeEffectPfxBindingProfileOptionScore(profile, hook) {
  const hookOptions = hook?.runtimeBinding?.effectOptions || {};
  const profileOptions = profile?.effectOptions || {};
  let score = 0;
  for (const optionKey of ["visibleOrActive", "followTarget"]) {
    if (!(optionKey in hookOptions)) continue;
    score += runtimeEffectPfxBindingProfileOptionValueScore(profileOptions[optionKey], hookOptions[optionKey]);
  }
  score += runtimeEffectPfxBindingProfileOffsetValueScore(profile, hook);
  return score;
}

function runtimeEffectPfxBindingProfileForEntry(pfxItem, hook) {
  const token = hook?.token || "";
  const effectToken = hook?.effectToken || hook?.token || "";
  const actionKeys = new Set(hook?.actionKeys || []);
  const sourceKind = hook?.sourceKind || "";
  const hookBoneToken = hook?.runtimeBinding?.boneToken || hook?.boneToken || "";
  const candidates = [];
  for (const profile of pfxItem?.hookBindingProfiles || []) {
    if (!(profile.effectToken === effectToken || profile.token === effectToken || profile.token === token)) continue;
    let score = 0;
    if (sourceKind && profile.sourceKind === sourceKind) score -= 2;
    score += runtimeEffectPfxBindingProfileBoneScore(profile, hookBoneToken);
    for (const actionKey of profile.actionKeys || []) {
      if (actionKeys.has(actionKey)) score -= 1;
    }
    score += runtimeEffectPfxBindingProfileActionScore(profile, actionKeys);
    score += runtimeEffectPfxBindingProfileTimingScore(profile, hook);
    score += runtimeEffectPfxBindingProfileOptionScore(profile, hook);
    candidates.push({ profile, score });
  }
  candidates.sort((left, right) => left.score - right.score);
  return candidates[0]?.profile || null;
}

function mergeRuntimeEffectNativeOptions(...optionSources) {
  let merged = {};
  for (const options of optionSources.filter(Boolean).reverse()) {
    merged = { ...merged, ...options };
  }
  return Object.keys(merged).length ? merged : null;
}

function runtimeEffectNativeOptions(entry) {
  return mergeRuntimeEffectNativeOptions(
    entry?.hook?.runtimeBinding?.effectOptions ||
      null,
    entry?.pfxBindingProfile?.effectOptions || null,
    entry?.projectile?.runtimeBinding?.effectOptions || null,
    entry?.projectileSourceEntry?.hook?.runtimeBinding?.effectOptions || null,
    entry?.projectileSourceEntry?.pfxBindingProfile?.effectOptions || null,
    entry?.projectileSourceEntry?.projectile?.runtimeBinding?.effectOptions || null,
  );
}

function runtimeEffectPfxNativeOptionRuntimeHintValue(entry, semantic) {
  const semanticKey = String(semantic || "").trim();
  if (!semanticKey) return null;
  const optionSources = [
    entry?.pfxBindingProfile?.effectOptions,
    entry?.projectileSourceEntry?.pfxBindingProfile?.effectOptions,
  ].filter(Boolean);
  for (const options of optionSources) {
    const matches = [
      ...(options.effectOptionRuntimeHintMatches || []),
      ...(options.effectOptionUnknownRuntimeHintMatches || []),
    ];
    for (const match of matches) {
      const parsed = String(match).match(/^(0x[0-9a-f]+):([^:]+):([-+]?(?:\d+\.?\d*|\.\d+))/i);
      if (!parsed || parsed[2] !== semanticKey) continue;
      const offset = parsed[1].toLowerCase();
      const value = Number(parsed[3]);
      if (!Number.isFinite(value)) continue;
      const offsetValues = options?.offsetValues || {};
      const offsetValue = offsetValues?.[offset] ?? offsetValues?.[offset.toUpperCase()];
      if (!runtimeEffectOffsetValueVectorsMatch(offsetValue, [value])) continue;
      return value;
    }
  }
  return null;
}

function runtimeEffectNativeVisibilityAllowed(entry) {
  const options = runtimeEffectNativeOptions(entry);
  return options?.visibleOrActive !== false;
}

function runtimeEffectNativeColorHex(entry) {
  const color = runtimeEffectNativeOptions(entry)?.color;
  if (!Array.isArray(color) || color.length < 3) return "";
  const normalized = color.slice(0, 3).map((value) => Math.max(0, Math.min(1, Number(value) || 0)));
  return `#${new THREE.Color(normalized[0], normalized[1], normalized[2]).getHexString().toUpperCase()}`;
}

function runtimeEffectNativeScaleScalar(entry) {
  const scale = Number(runtimeEffectNativeOptions(entry)?.scale ?? runtimeEffectPfxNativeOptionRuntimeHintValue(entry, "sizeScalar"));
  if (!Number.isFinite(scale)) return null;
  return Math.max(0.02, Math.min(4.5, Math.abs(scale)));
}

function runtimeEffectNativeFadeSeconds(entry) {
  const fadeSeconds = Number(runtimeEffectNativeOptions(entry)?.fadeSeconds);
  if (!Number.isFinite(fadeSeconds)) return null;
  return Math.max(0.08, Math.min(4, Math.abs(fadeSeconds)));
}

function runtimeEffectPreviewColors(shadergraphItems) {
  const seen = new Set();
  const colors = [];
  for (const shadergraphItem of shadergraphItems || []) {
    for (const color of shadergraphItem.inlineColors || []) {
      const hex = String(color.hex || "").toUpperCase();
      if (!hex || /^#0{6}$/i.test(hex) || seen.has(hex)) continue;
      seen.add(hex);
      colors.push(hex);
    }
  }
  return colors;
}

function runtimeEffectShadergraphLayerColors(shadergraphItem) {
  const seen = new Set();
  const colors = [];
  for (const color of shadergraphItem?.inlineColors || []) {
    const hex = String(color.hex || "").toUpperCase();
    if (!hex || /^#0{6}$/i.test(hex) || seen.has(hex)) continue;
    seen.add(hex);
    colors.push(hex);
  }
  return colors;
}

function runtimeEffectLayerColor(entry, layerIndex, palette) {
  const nativeColor = runtimeEffectNativeColorHex(entry);
  if (nativeColor) return nativeColor;
  const shadergraphColors = runtimeEffectShadergraphLayerColors(runtimeEffectShadergraphForLayer(entry, layerIndex));
  if (shadergraphColors.length) return shadergraphColors[0];
  const colors = (palette || []).filter((color) => !/^#0{6}$/i.test(color));
  return colors.length ? colors[layerIndex % colors.length] : RUNTIME_EFFECT_PREVIEW_DEFAULT_COLOR;
}

function runtimeEffectLayerColors(entry) {
  const nativeColor = runtimeEffectNativeColorHex(entry);
  const colors = (entry.colors || []).filter((color) => !/^#0{6}$/i.test(color));
  const palette = nativeColor
    ? [nativeColor, ...colors.filter((color) => color.toUpperCase() !== nativeColor)]
    : colors.length
      ? colors
      : [RUNTIME_EFFECT_PREVIEW_DEFAULT_COLOR];
  return Array.from({ length: runtimeEffectLayerCount(entry) }, (_, index) => runtimeEffectLayerColor(entry, index, palette));
}

function runtimeEffectLayerSizeScalar(surfaceRecord) {
  const sizeScalar = runtimeEffectSurfaceShapeSizeScalar(surfaceRecord);
  if (!Number.isFinite(sizeScalar)) return null;
  return Math.max(0.02, Math.min(4.5, Math.abs(sizeScalar)));
}

function runtimeEffectLayerRenderFamily(entry, layerIndex) {
  if (entry?.pfxItem?.nativePrimitive) {
    const options = runtimeEffectNativeOptions(entry);
    const text = runtimeEffectNativePrimitiveText(entry);
    if (/beam|laser|ray|line/i.test(text)) return "beam";
    if (/warning|execute|target|reticle|ring|area|zone|field|cloud|circle|pillar|edge|damagezone/i.test(text) || Number(options?.scale) >= 3) {
      return "area";
    }
  }
  const surfaceRecord = runtimeEffectSurfaceRecordForLayer(entry, layerIndex);
  const shadergraphFamily = runtimeEffectShadergraphRenderFamily(entry.pfxItem, runtimeEffectShadergraphForLayer(entry, layerIndex));
  return surfaceRecord?.prelude?.renderFamily || shadergraphFamily || "billboard";
}

function runtimeEffectLayerFrameAspectRatio(entry, layerIndex, uvAnimation) {
  const repeat = uvAnimation?.repeat;
  if (!Array.isArray(repeat) || repeat.length < 2) return null;
  const widthRatio = Number(repeat[0]);
  const heightRatio = Number(repeat[1]);
  if (!Number.isFinite(widthRatio) || !Number.isFinite(heightRatio) || widthRatio <= 0 || heightRatio <= 0) return null;
  const frameAspect = uvAnimation.repeat[0] / uvAnimation.repeat[1];

  const textureAsset = runtimeEffectShadergraphForLayer(entry, layerIndex)?.textureAssets?.[0] || null;
  const textureWidth = Number(textureAsset?.width);
  const textureHeight = Number(textureAsset?.height);
  const textureAspect =
    Number.isFinite(textureWidth) && Number.isFinite(textureHeight) && textureWidth > 0 && textureHeight > 0
      ? textureWidth / textureHeight
      : 1;
  return Math.max(0.25, Math.min(4, textureAspect * frameAspect));
}

function runtimeEffectApplyLayerAspectRatio(width, height, aspectRatio) {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return { width, height };
  const area = Math.max(width * height, 1);
  return {
    width: Math.sqrt(area * aspectRatio),
    height: Math.sqrt(area / aspectRatio),
  };
}

function runtimeEffectAreaOrientationEuler(surfaceRecord) {
  const orientationCode = Number(surfaceRecord?.prelude?.orientationCode);
  switch (orientationCode) {
    case 0:
      return { x: 0, y: 0, z: 0 };
    case 1:
      return { x: 0, y: Math.PI, z: 0 };
    case 2:
      return { x: 0, y: Math.PI / 2, z: 0 };
    case 3:
      return { x: 0, y: -Math.PI / 2, z: 0 };
    case 4:
      return { x: -Math.PI / 2, y: 0, z: 0 };
    case 5:
      return { x: Math.PI / 2, y: 0, z: 0 };
    default:
      return { x: -Math.PI / 2, y: 0, z: 0 };
  }
}

function runtimeEffectLayerSpec(entry, layerIndex, color) {
  const token = entry.effectToken || "";
  const weapon = /weapon/i.test(token);
  const impact = /impact/i.test(token);
  const surfaceRecord = runtimeEffectSurfaceRecordForLayer(entry, layerIndex);
  const shadergraphItem = runtimeEffectShadergraphForLayer(entry, layerIndex);
  const uvAnimation = runtimeEffectPreviewUvAnimationForLayer(entry, layerIndex);
  const previewBlendMode = shadergraphItem?.previewBlendMode || "additive";
  const previewOpacity = Number.isFinite(shadergraphItem?.previewOpacity) ? shadergraphItem.previewOpacity : null;
  const rotationDegrees = runtimeEffectSurfaceRuntimeHint(surfaceRecord, "rotationDegrees");
  const surfaceSize = runtimeEffectLayerSizeScalar(surfaceRecord);
  const nativeSize = runtimeEffectNativeScaleScalar(entry);
  const renderFamily = runtimeEffectLayerRenderFamily(entry, layerIndex);
  const area = renderFamily === "area";
  const beam = renderFamily === "beam";
  const size = nativeSize ?? surfaceSize ?? (weapon ? 2.2 : impact ? 2 : 1.6);
  const hasRuntimeSize = nativeSize !== null || surfaceSize !== null;
  const widthUnit = area ? 34 : beam ? 1.6 : weapon ? 18 : impact ? 28 : 24;
  const heightUnit = area ? 34 : beam ? 38 : weapon ? 48 : impact ? 28 : 30;
  const minWidth = hasRuntimeSize ? (beam ? 1 : area ? 1.5 : 2) : (beam ? 4 : 12);
  const minHeight = hasRuntimeSize ? (beam ? 4 : area ? 1.5 : 2) : (beam ? 36 : 14);
  const baseWidth = Math.max(minWidth, Math.min(area ? 140 : beam ? 18 : 96, size * widthUnit));
  const baseHeight = Math.max(minHeight, Math.min(area ? 140 : beam ? 180 : 140, size * heightUnit));
  const aspectRatio = renderFamily === "billboard" ? runtimeEffectLayerFrameAspectRatio(entry, layerIndex, uvAnimation) : null;
  const layerSize = runtimeEffectApplyLayerAspectRatio(baseWidth, baseHeight, aspectRatio);
  const baseOpacity = Math.max(0.18, (beam ? 0.42 : impact ? 0.58 : 0.48) - layerIndex * 0.1);
  const layerScale = 1 + layerIndex * 0.28;
  const offsetY = area
    ? 1.2 + layerIndex * 0.5
    : beam
      ? baseHeight * 0.5 + layerIndex * 2
      : weapon
        ? baseHeight * 0.45 + layerIndex * 10
        : Math.max(8, baseHeight * 0.12) + layerIndex * 6;
  return {
    color,
    renderFamily,
    blendMode: previewBlendMode,
    uvAnimation,
    width: layerSize.width * layerScale,
    height: layerSize.height * layerScale,
    offsetY,
    opacity: previewOpacity === null ? baseOpacity : Math.min(baseOpacity, previewOpacity),
    rotation: Number.isFinite(rotationDegrees) ? THREE.MathUtils.degToRad(rotationDegrees) : layerIndex * Math.PI * 0.35,
    orientation: area ? runtimeEffectAreaOrientationEuler(surfaceRecord) : { x: 0, y: 0, z: 0 },
    spinSpeed: (beam ? 0 : area ? 0 : weapon ? 0.9 : 1.5) * (layerIndex % 2 ? -1 : 1),
    pulseSpeed: (beam ? 0.8 : area ? 1.1 : 2.1) + layerIndex * 0.65,
    pulseAmount: (beam ? 0.03 : area ? 0.04 : 0.12) + layerIndex * 0.03,
    phase: layerIndex * 1.7,
    surfaceRecord,
  };
}

function runtimeEffectLayerBlending(spec) {
  return spec.blendMode === "alpha" ? THREE.NormalBlending : THREE.AdditiveBlending;
}

function runtimeEffectLayerAlphaTest(spec) {
  if (spec.renderFamily === "area") return spec.blendMode === "alpha" ? 0.08 : 0.025;
  if (spec.renderFamily === "beam") return 0.025;
  return spec.blendMode === "alpha" ? 0.08 : 0.025;
}

function runtimeEffectPreviewRole(entry) {
  const text = `${entry.effectToken || ""} ${entry.hook?.token || ""} ${entry.pfxItem?.relativePath || ""}`;
  if (/impact|burst|hit|explosion|(?:^|[_/-])exp(?:[_/.-]|\d|$)|(?:^|[_/-])imp(?:[_/.-]|$)/i.test(text)) return "impact";
  if (/cast/i.test(text)) return "cast";
  if (/warning/i.test(text)) return "warning";
  if (RUNTIME_EFFECT_PROJECTILE_PATTERN.test(text)) return "projectile";
  if (/weapon|trail|buff|state|aura|shield/i.test(text)) return "sustain";
  return "sustain";
}

function runtimeEffectIsProjectile(entry) {
  return runtimeEffectPreviewRole(entry) === "projectile";
}

function runtimeEffectIsProjectileImpact(entry) {
  return Boolean(entry?.projectileSourceEntry) && runtimeEffectPreviewRole(entry) === "impact";
}

function runtimeEffectUsesWorldSnapshot(entry) {
  if (runtimeEffectNativeOptions(entry)?.followTarget !== false) return false;
  const bindingKind = entry?.bindingTarget?.kind || "";
  if (bindingKind !== "bone" && bindingKind !== "bone-name" && bindingKind !== "model-root" && bindingKind !== "model-root-offset")
    return false;
  if (runtimeEffectIsProjectile(entry) || runtimeEffectIsProjectileImpact(entry)) return false;
  if (runtimeEffectPreviewRole(entry) === "sustain") return false;
  return runtimeEffectEntryStartSeconds(entry) !== null || runtimeEffectTimelineWindow(entry) !== null;
}

function runtimeEffectWindowOpacity(position, start, end) {
  if (position < start || position > end) return 0;
  const span = Math.max(end - start, 0.001);
  const progress = (position - start) / span;
  return Math.sin(progress * Math.PI);
}

function runtimeEffectInstantWindowOpacity(position, start, end) {
  if (position < start || position > end) return 0;
  const span = Math.max(end - start, 0.001);
  const progress = (position - start) / span;
  return Math.max(0, 1 - progress);
}

function runtimeEffectPfxTimeSeconds(role, pfxWindow, elapsedSeconds) {
  const animation = selectedAnimation();
  const duration = animationDuration(animation);
  const windowExceedsAnimation = duration > 0 && pfxWindow.endSeconds > duration + 0.05;
  if (role === "sustain" && !windowExceedsAnimation) return manualAnimationTime;
  if (!windowExceedsAnimation && duration > 0 && pfxWindow.startSeconds <= duration) return manualAnimationTime;
  const loopSeconds = Math.max(pfxWindow.endSeconds + 0.12, 0.4);
  return ((Number(elapsedSeconds) || 0) % loopSeconds);
}

function runtimeEffectEntryStartSeconds(entry) {
  const includePfxProfileTiming = !runtimeEffectPrimaryHookHasTimingSentinel(entry);
  const includeProjectileSourcePfxTiming = !runtimeEffectProjectileSourceHookHasTimingSentinel(entry);
  const matchedDelaySeconds =
    runtimeEffectSurfaceTimelineWindow(entry) === null && runtimeEffectPfxProfileTimelineWindow(entry) === null
      ? runtimeEffectPfxNativeOptionRuntimeHintValue(entry, "delaySeconds")
      : null;
  const candidates = [
    entry?.hook?.runtimeBinding?.startSeconds,
    matchedDelaySeconds,
    ...(includePfxProfileTiming ? [entry?.pfxBindingProfile?.startSeconds] : []),
    entry?.projectile?.runtimeBinding?.startSeconds,
    entry?.projectileSourceEntry?.hook?.runtimeBinding?.startSeconds,
    ...(includeProjectileSourcePfxTiming ? [entry?.projectileSourceEntry?.pfxBindingProfile?.startSeconds] : []),
    entry?.projectileSourceEntry?.projectile?.runtimeBinding?.startSeconds,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function runtimeEffectNativeTimelineLocalSeconds(entry) {
  const nativeStartSeconds = runtimeEffectEntryStartSeconds(entry);
  if (nativeStartSeconds === null) return null;
  return manualAnimationTime - nativeStartSeconds;
}

function runtimeEffectNativeTimelineTimes(entry) {
  const includePfxProfileTiming = !runtimeEffectPrimaryHookHasTimingSentinel(entry);
  const includeProjectileSourcePfxTiming = !runtimeEffectProjectileSourceHookHasTimingSentinel(entry);
  const timelineTimes = [
    ...(entry?.hook?.runtimeBinding?.timelineTimes || []),
    ...(includePfxProfileTiming ? entry?.pfxBindingProfile?.timelineTimes || [] : []),
    ...(entry?.projectile?.runtimeBinding?.timelineTimes || []),
    ...(entry?.projectileSourceEntry?.hook?.runtimeBinding?.timelineTimes || []),
    ...(includeProjectileSourcePfxTiming ? entry?.projectileSourceEntry?.pfxBindingProfile?.timelineTimes || [] : []),
    ...(entry?.projectileSourceEntry?.projectile?.runtimeBinding?.timelineTimes || []),
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return [...new Set(timelineTimes)].sort((left, right) => left - right);
}

function runtimeEffectNativeTimelineSpanSeconds(entry) {
  const timelineTimes = runtimeEffectNativeTimelineTimes(entry);
  if (timelineTimes.length < 2) return null;
  const spanSeconds = Math.max(...timelineTimes) - Math.min(...timelineTimes);
  return spanSeconds > 0.001 ? spanSeconds : null;
}

function runtimeEffectNativeTimelineDurationSeconds(entry, fallbackSeconds = 0.65) {
  const role = runtimeEffectPreviewRole(entry);
  const nativeTimelineSpan = runtimeEffectNativeTimelineSpanSeconds(entry);
  if ((role === "projectile" || role === "impact") && nativeTimelineSpan !== null) return Math.max(0.08, nativeTimelineSpan);
  const nativeFadeSeconds = runtimeEffectNativeFadeSeconds(entry);
  if (nativeFadeSeconds !== null) return nativeFadeSeconds;
  const pfxWindow = runtimeEffectTimelineWindow(entry);
  if (pfxWindow) return Math.max(0.08, pfxWindow.endSeconds);
  const profileWindow = runtimeEffectPfxProfileTimelineWindow(entry);
  if (profileWindow) return Math.max(0.08, profileWindow.endSeconds - profileWindow.startSeconds);
  const matchedDurationSeconds = runtimeEffectPfxNativeOptionRuntimeHintValue(entry, "durationSeconds");
  if (matchedDurationSeconds !== null) return Math.max(0.08, Math.min(4, Math.abs(matchedDurationSeconds)));
  const animation = selectedAnimation();
  const animationSeconds = animationDuration(animation);
  const nativeStartSeconds = runtimeEffectEntryStartSeconds(entry);
  if (animationSeconds > 0 && nativeStartSeconds !== null && animationSeconds > nativeStartSeconds) {
    return Math.max(0.18, Math.min(fallbackSeconds, animationSeconds - nativeStartSeconds));
  }
  return fallbackSeconds;
}

function runtimeEffectHasExplicitLifetime(entry) {
  return (
    runtimeEffectNativeTimelineSpanSeconds(entry) !== null ||
    runtimeEffectNativeFadeSeconds(entry) !== null ||
    runtimeEffectTimelineWindow(entry) !== null
  );
}

function runtimeEffectNativeTimelineActivity(entry) {
  const pfxWindow = runtimeEffectTimelineWindow(entry);
  const localSeconds = runtimeEffectNativeTimelineLocalSeconds(entry);
  if (localSeconds === null) return null;
  const role = runtimeEffectPreviewRole(entry);
  if (role === "sustain" && !runtimeEffectHasExplicitLifetime(entry)) {
    return { opacity: localSeconds >= 0 ? 1 : 0, scale: 1 };
  }
  const durationSeconds = runtimeEffectNativeTimelineDurationSeconds(entry, role === "impact" ? 0.38 : 0.65);
  const opacity = pfxWindow
    ? runtimeEffectTimelineWindowHasInstantStart(entry)
      ? runtimeEffectInstantWindowOpacity(localSeconds, pfxWindow.startSeconds, pfxWindow.endSeconds)
      : runtimeEffectWindowOpacity(localSeconds, pfxWindow.startSeconds, pfxWindow.endSeconds)
    : runtimeEffectWindowOpacity(localSeconds, 0, durationSeconds);
  return { opacity, scale: 0.9 + opacity * 0.25 };
}

function runtimeEffectSurfaceTimeSeconds(entry, pfxWindow, elapsedSeconds) {
  const nativeLocalSeconds = runtimeEffectNativeTimelineLocalSeconds(entry);
  if (nativeLocalSeconds !== null) return nativeLocalSeconds;
  const role = runtimeEffectPreviewRole(entry);
  if (pfxWindow) return runtimeEffectPfxTimeSeconds(role, pfxWindow, elapsedSeconds);
  const animation = selectedAnimation();
  const animationSeconds = animationDuration(animation);
  if (animationSeconds > 0) return manualAnimationTime;
  return Number(elapsedSeconds) || 0;
}

function runtimeEffectSurfaceLayerActivity(surfaceRecord, entry, elapsedSeconds) {
  const durationSeconds = runtimeEffectSurfaceRuntimeHint(surfaceRecord, "durationSeconds");
  const delaySeconds = runtimeEffectSurfaceRuntimeHint(surfaceRecord, "delaySeconds") ?? 0;
  const startSeconds = Math.max(0, delaySeconds);
  const pfxWindow = runtimeEffectTimelineWindow(entry);
  const timeSeconds = runtimeEffectSurfaceTimeSeconds(entry, pfxWindow, elapsedSeconds);
  if (durationSeconds === null && delaySeconds > 0) {
    const active = timeSeconds >= startSeconds;
    return { opacity: active ? 1 : 0, scale: active ? 1 : 0.92 };
  }
  if (durationSeconds === null) return { opacity: 1, scale: 1 };
  const endSeconds = startSeconds + Math.max(durationSeconds, 0.08);
  const opacity = runtimeEffectSurfaceHasInstantDuration(surfaceRecord)
    ? runtimeEffectInstantWindowOpacity(timeSeconds, startSeconds, endSeconds)
    : runtimeEffectWindowOpacity(timeSeconds, startSeconds, endSeconds);
  return { opacity, scale: 0.92 + opacity * 0.18 };
}

function runtimeEffectPreviewActivity(entry, elapsedSeconds) {
  if (!runtimeEffectMatchesSelectedAnimation(entry)) return { opacity: 0, scale: 1 };
  const role = runtimeEffectPreviewRole(entry);
  const nativeTimelineActivity = runtimeEffectNativeTimelineActivity(entry);
  if (nativeTimelineActivity) return nativeTimelineActivity;
  const pfxWindow = runtimeEffectTimelineWindow(entry);
  if (pfxWindow) {
    const timeSeconds = runtimeEffectPfxTimeSeconds(role, pfxWindow, elapsedSeconds);
    const opacity = runtimeEffectTimelineWindowHasInstantStart(entry)
      ? runtimeEffectInstantWindowOpacity(timeSeconds, pfxWindow.startSeconds, pfxWindow.endSeconds)
      : runtimeEffectWindowOpacity(timeSeconds, pfxWindow.startSeconds, pfxWindow.endSeconds);
    return { opacity, scale: 0.9 + opacity * 0.25 };
  }
  if (role === "sustain") return { opacity: 1, scale: 1 };

  const animation = selectedAnimation();
  const duration = animationDuration(animation);
  const position =
    duration > 0 ? Math.max(0, Math.min(1, manualAnimationTime / duration)) : ((Number(elapsedSeconds) || 0) % 1.4) / 1.4;
  const windows = {
    cast: [0, 0.34],
    warning: [0, 0.5],
    projectile: [0.18, 0.82],
    impact: [0.45, 0.9],
  };
  const [start, end] = windows[role] || windows.impact;
  const opacity = runtimeEffectWindowOpacity(position, start, end);
  return { opacity, scale: 0.85 + opacity * 0.35 };
}

function runtimeEffectProjectileProgress(entry, elapsedSeconds) {
  const profileWindow = runtimeEffectPfxProfileTimelineWindow(entry);
  if (profileWindow) {
    const span = Math.max(profileWindow.endSeconds - profileWindow.startSeconds, 0.08);
    return Math.max(0, Math.min(1, (manualAnimationTime - profileWindow.startSeconds) / span));
  }

  const nativeStartSeconds = runtimeEffectEntryStartSeconds(entry);
  if (nativeStartSeconds !== null) {
    const durationSeconds = runtimeEffectNativeTimelineDurationSeconds(entry, 0.65);
    return Math.max(0, Math.min(1, (manualAnimationTime - nativeStartSeconds) / durationSeconds));
  }

  const pfxWindow = runtimeEffectTimelineWindow(entry);
  if (pfxWindow) {
    const timeSeconds = runtimeEffectPfxTimeSeconds("projectile", pfxWindow, elapsedSeconds);
    const span = Math.max(pfxWindow.endSeconds - pfxWindow.startSeconds, 0.08);
    return Math.max(0, Math.min(1, (timeSeconds - pfxWindow.startSeconds) / span));
  }

  const animation = selectedAnimation();
  const duration = animationDuration(animation);
  if (duration > 0) return Math.max(0, Math.min(1, manualAnimationTime / duration));
  return ((Number(elapsedSeconds) || 0) % 1.2) / 1.2;
}

function runtimeEffectProjectileTravelDistance(entry) {
  const text = `${entry?.effectToken || ""} ${entry?.hook?.token || ""} ${entry?.pfxItem?.relativePath || ""}`;
  if (/beam|laser|ray/i.test(text)) return 150;
  if (/grenade|mortar|shell|rocket/i.test(text)) return 105;
  return 120;
}

function runtimeEffectProjectileMode(entry) {
  const values = [
    entry?.projectile?.runtimeBinding?.projectileMode,
    entry?.hook?.runtimeBinding?.projectileMode,
    entry?.bindingTarget?.nativeProjectile?.projectileMode,
    entry?.projectileSourceEntry?.projectile?.runtimeBinding?.projectileMode,
    entry?.projectileSourceEntry?.hook?.runtimeBinding?.projectileMode,
  ];
  return String(values.find((value) => value !== undefined && value !== null && value !== "") ?? "");
}

function runtimeEffectProjectileLateralOffset(entry) {
  const value =
    entry?.projectileLateralOffset ??
    entry?.bindingTarget?.lateralOffset ??
    entry?.hook?.runtimeBinding?.lateralOffset ??
    entry?.projectileSourceEntry?.projectileLateralOffset ??
    0;
  const offset = Number(value);
  const callbackOffset = runtimeEffectProjectileCallbackLateralOffset(entry);
  return (Number.isFinite(offset) ? offset : 0) + callbackOffset;
}

function runtimeEffectProjectileLocalPosition(entry) {
  const values = [
    entry?.bindingTarget?.localPosition,
    entry?.hook?.runtimeBinding?.localPosition,
    entry?.projectile?.runtimeBinding?.localPosition,
    entry?.projectileSourceEntry?.bindingTarget?.localPosition,
    entry?.projectileSourceEntry?.hook?.runtimeBinding?.localPosition,
  ];
  for (const value of values) {
    if (value?.isVector3) return value.clone();
    if (Array.isArray(value) && value.length >= 3) {
      const vector = new THREE.Vector3(Number(value[0]), Number(value[1]), Number(value[2]));
      if ([vector.x, vector.y, vector.z].every(Number.isFinite)) return vector;
    }
  }
  return null;
}

function rotateRuntimeEffectProjectileDirection(direction, lateralOffset) {
  const rotated = direction.clone();
  const offset = Number(lateralOffset);
  if (Number.isFinite(offset) && Math.abs(offset) > 0.001) {
    rotated.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(offset));
  }
  if (rotated.lengthSq() < 0.000001) return new THREE.Vector3(0, 0, 1);
  return rotated.normalize();
}

function runtimeEffectProjectileDirection(entry) {
  const projectileMode = runtimeEffectProjectileMode(entry);
  const forwardDirection = new THREE.Vector3(0, 0, 1);
  let direction = forwardDirection;
  if (projectileMode === "1") direction = forwardDirection;
  else if (projectileMode === "2") direction = forwardDirection;
  else if (projectileMode === "4") direction = forwardDirection;
  return rotateRuntimeEffectProjectileDirection(direction, runtimeEffectProjectileLateralOffset(entry));
}

function runtimeEffectProjectileArcHeight(entry) {
  const projectileMode = runtimeEffectProjectileMode(entry);
  if (projectileMode === "1" || projectileMode === "2" || projectileMode === "4") return 0;
  const text = `${entry?.effectToken || ""} ${entry?.hook?.token || ""} ${entry?.pfxItem?.relativePath || ""}`;
  return /grenade|mortar|shell|rocket/i.test(text) ? 8 : 0;
}

function updateRuntimeEffectProjectileMotion(preview, elapsedSeconds) {
  const progress = runtimeEffectProjectileProgress(preview.userData.entry, elapsedSeconds);
  const distance = runtimeEffectProjectileTravelDistance(preview.userData.entry);
  const direction = preview.userData.projectileDirection || runtimeEffectProjectileDirection(preview.userData.entry);
  const arcHeight = runtimeEffectProjectileArcHeight(preview.userData.entry);
  preview.position.copy(preview.userData.projectileOrigin);
  preview.position.addScaledVector(direction, progress * distance);
  preview.position.y += Math.sin(progress * Math.PI) * arcHeight;
  preview.rotation.z = -progress * Math.PI * 0.15;
}

function updateRuntimeEffectProjectileImpactMotion(preview, elapsedSeconds) {
  const sourceEntry = preview.userData.entry.projectileSourceEntry || preview.userData.entry;
  const distance = runtimeEffectProjectileTravelDistance(sourceEntry);
  const progress = runtimeEffectProjectileProgress(sourceEntry, elapsedSeconds);
  const direction = preview.userData.projectileDirection || runtimeEffectProjectileDirection(sourceEntry);
  const arcHeight = runtimeEffectProjectileArcHeight(sourceEntry);
  preview.position.copy(preview.userData.projectileOrigin);
  preview.position.addScaledVector(direction, distance);
  preview.position.y += Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI) * arcHeight;
}

function runtimeEffectUvAnimationPhase(entry, surfaceRecord, elapsedSeconds) {
  const delaySeconds = runtimeEffectSurfaceRuntimeHint(surfaceRecord, "delaySeconds") ?? 0;
  const durationSeconds = runtimeEffectSurfaceRuntimeHint(surfaceRecord, "durationSeconds");
  const pfxWindow = runtimeEffectTimelineWindow(entry);
  const timeSeconds = runtimeEffectSurfaceTimeSeconds(entry, pfxWindow, elapsedSeconds);
  const localSeconds = Math.max(0, timeSeconds - delaySeconds);
  return durationSeconds
    ? Math.max(0, Math.min(0.9999, localSeconds / Math.max(durationSeconds, 0.08)))
    : ((localSeconds % 1) + 1) % 1;
}

function runtimeEffectUvAnimationVertexColorValue(source, scaledPhase) {
  if (!/^var\d+\.[xyzw]$/.test(String(source || ""))) return 0;
  return Math.max(0, Math.min(0.9999, Number(scaledPhase) || 0));
}

function runtimeEffectUvAnimationPhaseTermsValue(terms, scaledPhase) {
  if (!Array.isArray(terms) || !terms.length) return null;
  let value = 0;
  for (const term of terms) {
    const scale = Number(term?.scale);
    if (!Number.isFinite(scale)) continue;
    value += runtimeEffectUvAnimationVertexColorValue(term.source, scaledPhase) * scale;
  }
  return value;
}

function runtimeEffectUvAnimationLinearComponentValue(baseValue, terms, scaledPhase) {
  const base = Number(baseValue);
  const termValue = runtimeEffectUvAnimationPhaseTermsValue(terms, scaledPhase);
  return (Number.isFinite(base) ? base : 0) + (termValue ?? 0);
}

function runtimeEffectUvAnimationPoweredPhase(uvAnimation, scaledPhase) {
  const power = Number(uvAnimation?.phasePower || 1);
  if (!Number.isFinite(power) || Math.abs(power - 1) < 0.00001) return scaledPhase;
  const inputOffset = Number(uvAnimation.phaseInputOffset || 0);
  const inputScale = Number(Object.hasOwn(uvAnimation, "phaseInputScale") ? uvAnimation.phaseInputScale : 1);
  const sourceValue = runtimeEffectUvAnimationVertexColorValue(uvAnimation.phaseSource, scaledPhase);
  return Math.pow((Number.isFinite(inputOffset) ? inputOffset : 0) + (Number.isFinite(inputScale) ? inputScale : 1) * sourceValue, power);
}

function runtimeEffectUpdateLayerUvAnimation(layerObject, entry, elapsedSeconds) {
  const uvAnimation = layerObject.userData.uvAnimation;
  const texture = layerObject.material?.map;
  if (!uvAnimation || !texture) return;
  const phase = runtimeEffectUvAnimationPhase(entry, layerObject.userData.surfaceRecord, elapsedSeconds);
  const phaseScale = Number(uvAnimation.phaseScale);
  const scaledPhase = Number.isFinite(phaseScale) ? phase * phaseScale : phase;
  if (uvAnimation.mode === "scroll") {
    const speed = uvAnimation.speed;
    const offset = uvAnimation.offset || [0, 0];
    texture.offset.set(offset[0] + speed[0] * scaledPhase, offset[1] + speed[1] * scaledPhase);
    return;
  }
  if (uvAnimation.mode === "centerScale") {
    const speed = uvAnimation.speed;
    const offset = uvAnimation.offset || [0, 0];
    const center = uvAnimation.center || [0.5, 0.5];
    const centerScalePhase = runtimeEffectUvAnimationPoweredPhase(uvAnimation, scaledPhase);
    const repeatX = Math.max(0.001, Math.min(1, offset[0] + speed[0] * centerScalePhase));
    const repeatY = Math.max(0.001, Math.min(1, offset[1] + speed[1] * centerScalePhase));
    texture.repeat.set(repeatX, repeatY);
    texture.offset.set(center[0] * (1 - repeatX), center[1] * (1 - repeatY));
    return;
  }
  if (uvAnimation.mode === "scaleOffset") {
    const repeat = uvAnimation.repeat || [1, 1];
    const offset = uvAnimation.offset || [0, 0];
    const repeatX = runtimeEffectUvAnimationLinearComponentValue(repeat[0], uvAnimation.repeatTerms?.[0], scaledPhase);
    const repeatY = runtimeEffectUvAnimationLinearComponentValue(repeat[1], uvAnimation.repeatTerms?.[1], scaledPhase);
    const offsetX = runtimeEffectUvAnimationLinearComponentValue(offset[0], uvAnimation.offsetTerms?.[0], scaledPhase);
    const offsetY = runtimeEffectUvAnimationLinearComponentValue(offset[1], uvAnimation.offsetTerms?.[1], scaledPhase);
    texture.repeat.set(repeatX, repeatY);
    texture.offset.set(offsetX, offsetY);
    return;
  }
  if (uvAnimation.mode === "rotate") {
    const center = uvAnimation.center || [0.5, 0.5];
    const repeat = uvAnimation.repeat || [1, 1];
    const rotationOffset = Number(uvAnimation.rotationOffset) || 0;
    const rotationSpeed = Number(uvAnimation.rotationSpeed) || 0;
    const rotation = rotationOffset + (runtimeEffectUvAnimationPhaseTermsValue(uvAnimation.rotationPhaseTerms, scaledPhase) ?? rotationSpeed * scaledPhase);
    const flipX = Boolean(uvAnimation.flipX);
    const flipY = Boolean(uvAnimation.flipY);
    const preRotationOffset = uvAnimation.preRotationOffset || [0, 0];
    const preRotationOffsetSpeed = uvAnimation.preRotationOffsetSpeed || [0, 0];
    const repeatX = runtimeEffectUvAnimationLinearComponentValue(repeat[0], uvAnimation.repeatTerms?.[0], scaledPhase);
    const repeatY = runtimeEffectUvAnimationLinearComponentValue(repeat[1], uvAnimation.repeatTerms?.[1], scaledPhase);
    const preOffsetX =
      runtimeEffectUvAnimationLinearComponentValue(preRotationOffset[0], uvAnimation.preRotationOffsetTerms?.[0], scaledPhase) +
      preRotationOffsetSpeed[0] * scaledPhase;
    const preOffsetY =
      runtimeEffectUvAnimationLinearComponentValue(preRotationOffset[1], uvAnimation.preRotationOffsetTerms?.[1], scaledPhase) +
      preRotationOffsetSpeed[1] * scaledPhase;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const rotatedPreOffsetX = preOffsetX * cos - preOffsetY * sin;
    const rotatedPreOffsetY = preOffsetX * sin + preOffsetY * cos;
    texture.repeat.set(flipX ? -repeatX : repeatX, flipY ? -repeatY : repeatY);
    texture.offset.set((flipX ? 1 : 0) + rotatedPreOffsetX, (flipY ? 1 : 0) + rotatedPreOffsetY);
    texture.center.set(center[0], center[1]);
    texture.rotation = rotation;
    return;
  }
  if (uvAnimation.mode === "distort") {
    const offset = uvAnimation.offset || [0, 0];
    const amplitude = Number(uvAnimation.amplitude) || 0;
    texture.offset.set(
      offset[0] + Math.sin(scaledPhase * Math.PI * 2) * amplitude,
      offset[1] + Math.cos(scaledPhase * Math.PI * 2) * amplitude,
    );
    return;
  }
  if (uvAnimation.mode === "sampledDistort") {
    const axis = uvAnimation.axis || [1, 1];
    const offset = uvAnimation.offset || [0, 0];
    const offsetSpeed = uvAnimation.offsetSpeed || [0, 0];
    const center = uvAnimation.center || [0.5, 0.5];
    const distortionScale = Number(uvAnimation.distortionScale) || 0;
    const rotationOffset = Number(uvAnimation.rotationOffset) || 0;
    const rotationSpeed = Number(uvAnimation.rotationSpeed) || 0;
    const rotationPhase = runtimeEffectUvAnimationVertexColorValue(uvAnimation.rotationPhaseSource, scaledPhase);
    const rotation = rotationOffset + (uvAnimation.rotationPhaseSource ? rotationPhase : rotationSpeed * scaledPhase);
    const usesRuntimePhase = Boolean(uvAnimation.amplitudeSource);
    const amplitude = usesRuntimePhase ? Math.max(0.0025, Math.min(0.035, Math.abs(distortionScale) * 0.0125)) : 1;
    const uniforms = layerObject.material?.userData?.sampledDistortionUniforms;
    if (uniforms) {
      uniforms.sampledDistortionAxis.value.set(axis[0], axis[1]);
      uniforms.sampledDistortionOffset.value.set(
        offset[0] + offsetSpeed[0] * scaledPhase,
        offset[1] + offsetSpeed[1] * scaledPhase,
      );
      uniforms.sampledDistortionCenter.value.set(center[0], center[1]);
      uniforms.sampledDistortionScale.value = distortionScale;
      uniforms.sampledDistortionBias.value = Number(uvAnimation.distortionBias) || 0;
      uniforms.sampledDistortionAmplitude.value = amplitude;
      uniforms.sampledDistortionPhase.value = scaledPhase;
      uniforms.sampledDistortionWave.value = usesRuntimePhase ? Math.sin(scaledPhase * Math.PI * 2) : 1;
      uniforms.sampledDistortionRotation.value = rotation;
      uniforms.sampledDistortionRotateEnabled.value =
        uvAnimation.rotationPhaseSource || Math.abs(rotationOffset) > 0.00001 || Math.abs(rotationSpeed) > 0.00001 ? 1 : 0;
      return;
    }
    const sampledOffset = Math.sin(scaledPhase * Math.PI * 2) * amplitude;
    texture.offset.set(
      offset[0] + offsetSpeed[0] * scaledPhase + axis[0] * sampledOffset,
      offset[1] + offsetSpeed[1] * scaledPhase + axis[1] * sampledOffset,
    );
    return;
  }
  if (uvAnimation.mode === "sampledRotate") {
    const center = uvAnimation.center || [0.5, 0.5];
    const preRotationAxis = uvAnimation.preRotationAxis || [0, 0];
    const rotationScale = Number(uvAnimation.rotationScale) || 0;
    const uniforms = layerObject.material?.userData?.sampledRotationUniforms;
    if (uniforms) {
      uniforms.sampledRotationCenter.value.set(center[0], center[1]);
      uniforms.sampledRotationPreAxis.value.set(preRotationAxis[0], preRotationAxis[1]);
      uniforms.sampledRotationScale.value = rotationScale;
      uniforms.sampledRotationAmplitude.value = Math.max(0.0025, Math.min(1, scaledPhase));
    }
    return;
  }
  if (uvAnimation.mode === "sampledWarp") {
    const baseRepeat = uvAnimation.baseRepeat || [1, 1];
    const distortionRepeat = uvAnimation.distortionRepeat || [1, 1];
    const uvScaleRepeat = uvAnimation.uvScaleRepeat || [1, 1];
    const runtimeOffsetBias = uvAnimation.runtimeOffsetBias || [0, 0];
    const runtimeOffsetScale = uvAnimation.runtimeOffsetScale || [0, 0];
    const sourceValue = runtimeEffectUvAnimationVertexColorValue(uvAnimation.runtimeOffsetSource, scaledPhase);
    const multiplierValue = runtimeEffectUvAnimationVertexColorValue(uvAnimation.runtimeOffsetMultiplierSource, scaledPhase);
    const offsetX = multiplierValue * (runtimeOffsetBias[0] + runtimeOffsetScale[0] * sourceValue);
    const offsetY = multiplierValue * (runtimeOffsetBias[1] + runtimeOffsetScale[1] * sourceValue);
    const uniforms = layerObject.material?.userData?.sampledWarpUniforms;
    if (uniforms) {
      uniforms.sampledWarpBaseRepeat.value.set(baseRepeat[0], baseRepeat[1]);
      uniforms.sampledWarpDistortionRepeat.value.set(distortionRepeat[0], distortionRepeat[1]);
      uniforms.sampledWarpUvScaleRepeat.value.set(uvScaleRepeat[0], uvScaleRepeat[1]);
      uniforms.sampledWarpDistortionValueScale.value = Number(uvAnimation.distortionValueScale) || 1;
      uniforms.sampledWarpDistortionBias.value = Number(uvAnimation.distortionBias) || 0;
      uniforms.sampledWarpDistortionScale.value = Number(uvAnimation.distortionScale) || 1;
      uniforms.sampledWarpRuntimeOffset.value.set(offsetX, offsetY);
    }
    return;
  }
  if (uvAnimation.mode === "sampledOffsetField") {
    const baseRepeat = uvAnimation.baseRepeat || [1, 1];
    const distortionRepeat = uvAnimation.distortionRepeat || [1, 1];
    const bendX = uvAnimation.uvBend?.x || { uOffset: 0, uScale: 0, vOffset: 0, vScale: 0 };
    const runtimeOffsetAxis = uvAnimation.runtimeOffsetAxis || [0, 0];
    const sourceValue = runtimeEffectUvAnimationVertexColorValue(uvAnimation.runtimeOffsetSource, scaledPhase);
    const uniforms = layerObject.material?.userData?.sampledOffsetFieldUniforms;
    if (uniforms) {
      uniforms.sampledOffsetFieldBaseRepeat.value.set(baseRepeat[0], baseRepeat[1]);
      uniforms.sampledOffsetFieldDistortionRepeat.value.set(distortionRepeat[0], distortionRepeat[1]);
      uniforms.sampledOffsetFieldDistortionBias.value = Number(uvAnimation.distortionBias) || 0;
      uniforms.sampledOffsetFieldDistortionScale.value = Number(uvAnimation.distortionScale) || 1;
      uniforms.sampledOffsetFieldBendX.value.set(
        Number(bendX.uOffset) || 0,
        Number(bendX.uScale) || 0,
        Number(bendX.vOffset) || 0,
        Number(bendX.vScale) || 0,
      );
      uniforms.sampledOffsetFieldRuntimeOffset.value.set(
        (Number(runtimeOffsetAxis[0]) || 0) * sourceValue,
        (Number(runtimeOffsetAxis[1]) || 0) * sourceValue,
      );
    }
    return;
  }
  if (uvAnimation.mode === "sampledCenterScaleDistort") {
    const center = uvAnimation.center || [0.5, 0.5];
    const maskRepeat = uvAnimation.amplitudeMaskRepeat || [1, 1];
    const maskOffset = uvAnimation.amplitudeMaskOffset || [0, 0];
    const maskSmoothstep = uvAnimation.amplitudeMaskSmoothstep || [0, 1];
    const centerScaleSourceValue = runtimeEffectUvAnimationVertexColorValue(uvAnimation.centerScaleSource, scaledPhase);
    const amplitude = runtimeEffectUvAnimationVertexColorValue(uvAnimation.amplitudeSource, scaledPhase);
    const centerScaleInputOffset = Number(uvAnimation.centerScaleInputOffset || 0);
    const centerScaleInputScale = Number(Object.hasOwn(uvAnimation, "centerScaleInputScale") ? uvAnimation.centerScaleInputScale : 1);
    const centerScalePower = Number(uvAnimation.centerScalePower || 1);
    const centerScaleBase =
      (Number.isFinite(centerScaleInputOffset) ? centerScaleInputOffset : 0) +
      (Number.isFinite(centerScaleInputScale) ? centerScaleInputScale : 1) * centerScaleSourceValue;
    const centerScale = Math.pow(centerScaleBase, Number.isFinite(centerScalePower) ? centerScalePower : 1);
    const uniforms = layerObject.material?.userData?.sampledCenterScaleDistortUniforms;
    if (uniforms) {
      uniforms.sampledCenterScaleDistortCenter.value.set(center[0], center[1]);
      uniforms.sampledCenterScaleDistortMaskRepeat.value.set(maskRepeat[0], maskRepeat[1]);
      uniforms.sampledCenterScaleDistortMaskOffset.value.set(maskOffset[0], maskOffset[1]);
      uniforms.sampledCenterScaleDistortMaskSmoothstep.value.set(maskSmoothstep[0], maskSmoothstep[1]);
      uniforms.sampledCenterScaleDistortCenterScale.value = Number.isFinite(centerScale) ? centerScale : 1;
      uniforms.sampledCenterScaleDistortDistortionBias.value = Number(uvAnimation.distortionBias) || 0;
      uniforms.sampledCenterScaleDistortDistortionScale.value = Number(uvAnimation.distortionScale) || 1;
      uniforms.sampledCenterScaleDistortAmplitude.value = amplitude;
    }
    return;
  }
  if (uvAnimation.mode === "sampledScaleRotate") {
    const center = uvAnimation.center || [0.5, 0.5];
    const scaleRepeat = uvAnimation.scaleRepeat || [1, 1];
    const scaleOffset = uvAnimation.scaleOffset || [0, 0];
    const maskRepeat = uvAnimation.scaleMaskRepeat || [1, 1];
    const maskOffset = uvAnimation.scaleMaskOffset || [0, 0];
    const maskSmoothstep = uvAnimation.scaleMaskSmoothstep || [0, 1];
    const scaleAmplitude = runtimeEffectUvAnimationVertexColorValue(uvAnimation.scaleAmplitudeSource, scaledPhase);
    const rotationPhase = runtimeEffectUvAnimationVertexColorValue(uvAnimation.rotationSource, scaledPhase);
    const rotation = (Number(uvAnimation.rotationOffset) || 0) + (Number(uvAnimation.rotationSpeed) || 0) * rotationPhase;
    const uniforms = layerObject.material?.userData?.sampledScaleRotateUniforms;
    if (uniforms) {
      uniforms.sampledScaleRotateCenter.value.set(center[0], center[1]);
      uniforms.sampledScaleRotateScaleRepeat.value.set(scaleRepeat[0], scaleRepeat[1]);
      uniforms.sampledScaleRotateScaleOffset.value.set(scaleOffset[0], scaleOffset[1]);
      uniforms.sampledScaleRotateMaskRepeat.value.set(maskRepeat[0], maskRepeat[1]);
      uniforms.sampledScaleRotateMaskOffset.value.set(maskOffset[0], maskOffset[1]);
      uniforms.sampledScaleRotateMaskSmoothstep.value.set(maskSmoothstep[0], maskSmoothstep[1]);
      uniforms.sampledScaleRotateScaleBase.value = Number(uvAnimation.scaleBase) || 1;
      uniforms.sampledScaleRotateSamplerBias.value = Number(uvAnimation.scaleSamplerBias) || 0;
      uniforms.sampledScaleRotateSamplerScale.value = Number(uvAnimation.scaleSamplerScale) || 1;
      uniforms.sampledScaleRotateScaleAmplitude.value = scaleAmplitude;
      uniforms.sampledScaleRotateRotation.value = rotation;
    }
    return;
  }
  if (uvAnimation.mode !== "flipbook") return;
  const progress = ((scaledPhase % 1) + 1) % 1;
  const frameIndex = Math.max(0, Math.min(uvAnimation.frameCount - 1, Math.floor(progress * uvAnimation.frameCount)));
  const column = frameIndex % uvAnimation.frameColumns;
  const row = Math.floor(frameIndex / uvAnimation.frameColumns);
  texture.offset.set(column * uvAnimation.repeat[0], row * uvAnimation.repeat[1]);
}

function ensureRuntimeParticleFxRoot() {
  if (!activeObject) return null;
  if (!runtimeParticleFxRoot || runtimeParticleFxRoot.parent !== activeObject) {
    runtimeParticleFxRoot = new THREE.Group();
    runtimeParticleFxRoot.name = "runtime_particle_fx_root";
    activeObject.add(runtimeParticleFxRoot);
  }
  return runtimeParticleFxRoot;
}

function runtimeParticleUnit() {
  if (!activeObject) return 20;
  const height = new THREE.Box3().setFromObject(activeObject).getSize(new THREE.Vector3()).y;
  return (height > 0 ? height : 150) * 0.2;
}

// 真实飞行距离 = CFF0 逆向的 range（游戏米）× 单位换算。
// 换算：英雄模型高度 ≈ 2 游戏米，故每米 = 模型高度/2 个模型单位。全英雄通用。
function runtimeParticleRealDistance(item) {
  const hero = item?.heroLabel || String(item?.modelLabel || "").split("_")[0];
  const range = HERO_RANGE[hero];
  if (!range || !activeObject) return 120;
  const height = new THREE.Box3().setFromObject(activeObject).getSize(new THREE.Vector3()).y || 200;
  return range * (height / 2);
}

function createRuntimeParticlePreviewObject(entry, index) {
  const role = particleRoleForPfx(entry.pfxItem?.relativePath) || "muzzle";
  const fxRoot = ensureRuntimeParticleFxRoot();
  const preview = new THREE.Group();
  preview.name = `runtime_particle_${index}_${entry.effectToken}`;
  preview.userData.vaingloryRuntimeEffectPreview = true;
  preview.userData.entry = entry;
  preview.userData.particleRole = role;
  preview.userData.particleEffect = fxRoot ? new RuntimeParticleEffect(role, fxRoot) : null;
  preview.userData.particleOrigin = new THREE.Vector3();
  preview.userData.particleDirection = new THREE.Vector3(0, 0, 1);
  preview.userData.particleUnit = runtimeParticleUnit();
  preview.visible = false; // 控制器容器，不直接渲染
  return preview;
}

function createRuntimeEffectPreviewObject(entry, index) {
  if (entryUsesParticleEffect(entry.pfxItem?.relativePath)) {
    return createRuntimeParticlePreviewObject(entry, index);
  }
  const preview = new THREE.Group();
  preview.name = `runtime_effect_preview_${index}_${entry.effectToken}`;
  preview.userData.vaingloryRuntimeEffectPreview = true;
  preview.userData.entry = entry;
  preview.userData.effectToken = entry.effectToken;
  preview.userData.pfxPath = entry.pfxItem.relativePath;
  preview.userData.projectile = runtimeEffectIsProjectile(entry);
  preview.userData.projectileImpact = runtimeEffectIsProjectileImpact(entry);
  preview.userData.projectileOrigin = new THREE.Vector3();
  preview.userData.projectileDirection = new THREE.Vector3(0, 0, 1);
  preview.userData.worldSnapshot = runtimeEffectUsesWorldSnapshot(entry);
  preview.userData.worldSnapshotCaptured = false;
  preview.userData.worldSnapshotAnchor = null;

  for (const [layerIndex, color] of runtimeEffectLayerColors(entry).entries()) {
    const spec = runtimeEffectLayerSpec(entry, layerIndex, color);
    const emitterPositionHint = runtimeEffectEmitterPositionHint(spec.surfaceRecord);
    const emitterVelocityHint = runtimeEffectEmitterVelocityHint(spec.surfaceRecord);
    const materialOptions = {
      map: runtimeEffectPreviewLayerTextureForEntry(entry, layerIndex),
      alphaMap: runtimeEffectPreviewAlphaMapForEntry(entry, layerIndex),
      color: new THREE.Color(spec.color),
      transparent: true,
      opacity: spec.opacity,
      alphaTest: runtimeEffectLayerAlphaTest(spec),
      depthWrite: false,
      depthTest: true,
      blending: runtimeEffectLayerBlending(spec),
    };
    const meshLayer = spec.renderFamily === "area" || spec.renderFamily === "beam";
    const material =
      meshLayer
        ? new THREE.MeshBasicMaterial({ ...materialOptions, side: THREE.DoubleSide })
        : new THREE.SpriteMaterial({ ...materialOptions, rotation: spec.rotation });
    applyRuntimeEffectSampledDistortionShader(material, spec.uvAnimation);
    applyRuntimeEffectSampledRotationShader(material, spec.uvAnimation);
    applyRuntimeEffectSampledWarpShader(material, spec.uvAnimation);
    applyRuntimeEffectSampledOffsetFieldShader(material, spec.uvAnimation);
    applyRuntimeEffectSampledCenterScaleDistortShader(material, spec.uvAnimation);
    applyRuntimeEffectSampledScaleRotateShader(material, spec.uvAnimation);
    const layerObject = meshLayer ? new THREE.Mesh(runtimeEffectPlaneGeometry, material) : new THREE.Sprite(material);
    layerObject.name = `${preview.name}_layer_${layerIndex}`;
    layerObject.scale.set(spec.width, spec.height, 1);
    layerObject.position.set(0, spec.offsetY, 0);
    if (spec.renderFamily === "area") {
      layerObject.rotation.set(spec.orientation.x, spec.orientation.y, spec.orientation.z + spec.rotation);
    }
    if (spec.renderFamily === "beam") layerObject.rotation.z = spec.rotation;
    layerObject.userData.baseOpacity = spec.opacity;
    layerObject.userData.baseScale = layerObject.scale.clone();
    layerObject.userData.basePosition = layerObject.position.clone();
    layerObject.userData.emitterPositionHint = emitterPositionHint;
    layerObject.userData.emitterVelocityHint = emitterVelocityHint;
    layerObject.userData.pulseSpeed = spec.pulseSpeed;
    layerObject.userData.pulseAmount = spec.pulseAmount;
    layerObject.userData.spinSpeed = spec.spinSpeed;
    layerObject.userData.phase = spec.phase;
    layerObject.userData.surfaceRecord = spec.surfaceRecord;
    layerObject.userData.uvAnimation = spec.uvAnimation;
    const initialActivity = runtimeEffectPreviewActivity(entry, runtimeEffectElapsed);
    const initialSurfaceActivity = runtimeEffectSurfaceLayerActivity(spec.surfaceRecord, entry, runtimeEffectElapsed);
    const initialCombinedOpacity = initialActivity.opacity * initialSurfaceActivity.opacity;
    layerObject.visible = initialCombinedOpacity > 0.02;
    layerObject.material.opacity = layerObject.userData.baseOpacity * initialCombinedOpacity;
    layerObject.scale.copy(layerObject.userData.baseScale).multiplyScalar(initialActivity.scale * initialSurfaceActivity.scale);
    runtimeEffectUpdateLayerUvAnimation(layerObject, entry, runtimeEffectElapsed);
    preview.add(layerObject);
  }

  preview.visible = effectsToggle.checked && runtimeEffectPreviewActivity(entry, runtimeEffectElapsed).opacity > 0.02;
  return preview;
}

function runtimeEffectAnchorLocalPosition(entry, anchor) {
  if (!activeObject || !anchor) return;
  if (entry?.bindingTarget?.kind === "model-root-offset" && entry.bindingTarget.localPosition) {
    return entry.bindingTarget.localPosition.clone();
  }
  if (entry?.bindingTarget?.kind === "model-root") return new THREE.Vector3();

  activeObject.updateMatrixWorld(true);
  const worldPosition = new THREE.Vector3();
  anchor.getWorldPosition(worldPosition);
  activeObject.worldToLocal(worldPosition);
  return worldPosition;
}

function updateRuntimeEffectWorldSnapshot(preview, activity) {
  const anchor = preview.userData.worldSnapshotAnchor;
  if (!activeObject || !anchor) return;
  if (!activity || activity.opacity <= 0.02) {
    preview.userData.worldSnapshotCaptured = false;
    return;
  }
  if (preview.userData.worldSnapshotCaptured) return;

  const localPosition = runtimeEffectAnchorLocalPosition(preview.userData.entry, anchor);
  if (!localPosition) return;
  preview.position.copy(localPosition);
  preview.userData.worldSnapshotCaptured = true;
}

function updateRuntimeParticlePreview(preview, deltaSeconds, elapsedSeconds) {
  const entry = preview.userData.entry;
  const sourceEntry = entry.projectileSourceEntry || entry;
  const activity = runtimeEffectPreviewActivity(entry, elapsedSeconds);
  const progress = runtimeEffectProjectileProgress(sourceEntry, elapsedSeconds);
  const distance = runtimeParticleRealDistance(activeManifestItem);
  const anchor = preview.userData.particleAnchor;
  if (anchor) {
    // 回退：数据里没有真实 locator 时才跟骨骼（不再猜偏移/方向）。
    activeObject.updateMatrixWorld(true);
    const world = new THREE.Vector3();
    anchor.getWorldPosition(world);
    preview.userData.particleOrigin.copy(activeObject.worldToLocal(world));
  }
  // 有真实 locator：particleOrigin 在 sync 时已设为 GunMuzzleTip 坐标（model-root-offset），此处不改。
  preview.userData.particleEffect.update(deltaSeconds, {
    opacity: activity.opacity,
    progress,
    origin: preview.userData.particleOrigin,
    direction: preview.userData.particleDirection,
    distance,
    unit: preview.userData.particleUnit,
  });
}

function updateRuntimeEffectPreviews(deltaSeconds, elapsedSeconds) {
  for (const preview of activeRuntimeEffectObjects) {
    if (preview.userData.particleEffect) {
      updateRuntimeParticlePreview(preview, deltaSeconds, elapsedSeconds);
      continue;
    }
    const activity = runtimeEffectPreviewActivity(preview.userData.entry, elapsedSeconds);
    preview.visible = effectsToggle.checked && activity.opacity > 0.02;
    if (preview.userData.worldSnapshot) updateRuntimeEffectWorldSnapshot(preview, activity);
    if (preview.userData.projectile) updateRuntimeEffectProjectileMotion(preview, elapsedSeconds);
    if (preview.userData.projectileImpact) updateRuntimeEffectProjectileImpactMotion(preview, elapsedSeconds);
    preview.traverse((layerObject) => {
      if ((!layerObject.isSprite && !layerObject.isMesh) || !layerObject.material || !layerObject.userData.baseScale) return;
      const surfaceActivity = runtimeEffectSurfaceLayerActivity(layerObject.userData.surfaceRecord, preview.userData.entry, elapsedSeconds);
      const combinedOpacity = activity.opacity * surfaceActivity.opacity;
      layerObject.visible = combinedOpacity > 0.02;
      runtimeEffectUpdateLayerUvAnimation(layerObject, preview.userData.entry, elapsedSeconds);
      if (layerObject.isSprite) layerObject.material.rotation += layerObject.userData.spinSpeed * deltaSeconds;
      if (layerObject.isMesh) layerObject.rotation.z += layerObject.userData.spinSpeed * deltaSeconds;
      const emitterPositionOffset = runtimeEffectEmitterPositionOffset(layerObject.userData.emitterPositionHint);
      const emitterVelocityOffset = runtimeEffectEmitterVelocityOffset(layerObject.userData.emitterVelocityHint, preview.userData.entry, elapsedSeconds);
      layerObject.position.copy(layerObject.userData.basePosition).add(emitterPositionOffset).add(emitterVelocityOffset);
      const pulse =
        1 + Math.sin(elapsedSeconds * layerObject.userData.pulseSpeed + layerObject.userData.phase) * layerObject.userData.pulseAmount;
      layerObject.material.opacity = layerObject.userData.baseOpacity * combinedOpacity;
      layerObject.scale.copy(layerObject.userData.baseScale).multiplyScalar(pulse * activity.scale * surfaceActivity.scale);
    });
  }
}

function runtimeEffectTimelineWindowForDebug(entry) {
  const window = runtimeEffectTimelineWindow(entry);
  if (!window) return null;
  return {
    startSeconds: Number(window.startSeconds.toFixed(4)),
    endSeconds: Number(window.endSeconds.toFixed(4)),
    durationSeconds: Number((window.endSeconds - window.startSeconds).toFixed(4)),
  };
}

function runtimeEffectPreviewSurfaceRecordsForDebug(entry) {
  return Array.from({ length: runtimeEffectLayerCount(entry) }, (_, layerIndex) => {
    const record = runtimeEffectSurfaceRecordForLayer(entry, layerIndex);
    const shadergraphItem = runtimeEffectShadergraphForLayer(entry, layerIndex);
    return {
      layerIndex,
      surfaceIndex: record?.surfaceIndex ?? null,
      relativePath: record?.relativePath || shadergraphItem?.relativePath || "",
      shadergraphPath: shadergraphItem?.relativePath || "",
      renderFamily: record?.prelude?.renderFamily || runtimeEffectShadergraphRenderFamily(entry?.pfxItem, shadergraphItem) || "",
      runtimeHints: record?.runtimeHints || {},
      previewTexture: shadergraphItem?.previewTexture || "",
      previewTextureMode: shadergraphItem?.previewTextureMode || "",
      previewBlendMode: shadergraphItem?.previewBlendMode || "",
      previewOpacity: shadergraphItem?.previewOpacity ?? null,
      previewSurfaceRenderable: shadergraphItem?.previewSurfaceRenderable ?? null,
      emitterPositionHint: runtimeEffectEmitterPositionHint(record),
      emitterVelocityHint: runtimeEffectEmitterVelocityHint(record),
      runtimeAlphaMap: runtimeEffectPreviewTextureNeedsRuntimeAlphaMap(shadergraphItem, entry.pfxItem, entry),
      uvEvidenceKind: shadergraphItem?.previewUvRuntimeEvidence?.kind || "",
      uvGapReason: shadergraphItem?.previewUvAnimationGapReason || "",
    };
  });
}

function runtimeEffectPreviewDebugRow(entry, extra = {}) {
  const projectileCallbackRows = runtimeEffectProjectileCallbackDebugRows(entry);
  const pfxRuntimeEvidence = runtimeEffectPfxRuntimeEvidence(entry);
  return {
    ...extra,
    sourceKind: entry.sourceKind || "",
    effectToken: entry.effectToken || "",
    pfxPath: entry.pfxItem?.relativePath || "",
    role: runtimeEffectPreviewRole(entry),
    startSeconds: runtimeEffectEntryStartSeconds(entry),
    timelineWindow: runtimeEffectTimelineWindowForDebug(entry),
    opacity: runtimeEffectPreviewActivity(entry, runtimeEffectElapsed).opacity,
    previewTextures: entry.previewTextures || [],
    surfaceRecords: runtimeEffectPreviewSurfaceRecordsForDebug(entry),
    bindingKind: entry?.bindingTarget?.kind || "",
    boneIndex: entry?.bindingTarget?.boneIndex ?? null,
    boneToken: entry?.bindingTarget?.boneToken || "",
    effectChannelFallback: Boolean(entry?.bindingTarget?.effectChannelFallback),
    worldSnapshot: runtimeEffectUsesWorldSnapshot(entry),
    projectile: runtimeEffectIsProjectile(entry),
    projectileImpact: runtimeEffectIsProjectileImpact(entry),
    pfxRuntimeEvidence,
    projectileCallbackRows,
    stateConditionalProjectileEmitters: [
      ...new Set(
        projectileCallbackRows
          .filter((row) => row.semanticClass === "state-conditional-emitter")
          .flatMap((row) => (row.matchedBranches || []).map((branch) => branch.emitterLabel).filter(Boolean)),
      ),
    ],
    stateConditionalProjectileBranches: projectileCallbackRows
      .filter((row) => row.semanticClass === "state-conditional-emitter")
      .flatMap((row) => row.matchedBranches || []),
  };
}

function runtimeEffectAnchorObject(entry, bones) {
  if (!entry?.bindingTarget) return null;
  if (entry.bindingTarget.kind === "bone") return bones[entry.bindingTarget.boneIndex] || null;
  if (entry.bindingTarget.kind === "bone-name") return runtimeEffectBoneByName(bones, entry.bindingTarget.boneToken);
  if (entry.bindingTarget.kind === "model-root-offset") return activeObject;
  if (entry.bindingTarget.kind === "model-root") return activeObject;
  return null;
}

function syncRuntimeEffectPreviews() {
  clearRuntimeEffectObjects();
  if (!activeObject || !activeManifestItem || !isAnimationFormat()) return;

  const bones = firstActiveSkinnedSkeletonBones();
  for (const [index, entry] of runtimeEffectPreviewEntries().entries()) {
    const anchor = runtimeEffectAnchorObject(entry, bones);
    if (!anchor) continue;
    const preview = createRuntimeEffectPreviewObject(entry, index);
    if (preview.userData.particleEffect) {
      // 发射点：用逆向出的真实 locator（GunMuzzleTip / GunMuzzle / BladeShot 等，model-root-offset），
      // 替代之前的"右手骨骼 + 猜偏移"。全英雄通用，从 projectile runtime 数据查。
      const projRows = runtimeEffectDefinitionProjectilesForItem(activeManifestItem) || [];
      const muzzleRow =
        projRows.find(
          (r) => r?.runtimeBinding?.localPosition && /muzzle|barrel|shot|attack|auto|^aa$/i.test(r.runtimeBinding.locatorLabel || ""),
        ) || projRows.find((r) => r?.runtimeBinding?.localPosition);
      if (muzzleRow) {
        preview.userData.particleOrigin.fromArray(muzzleRow.runtimeBinding.localPosition);
        preview.userData.particleAnchor = null;
        preview.userData.particleLocatorLabel = muzzleRow.runtimeBinding.locatorLabel || "";
      } else {
        activeObject.updateMatrixWorld(true);
        const world = new THREE.Vector3();
        anchor.getWorldPosition(world);
        preview.userData.particleOrigin.copy(activeObject.worldToLocal(world));
        preview.userData.particleAnchor = anchor;
      }
      preview.userData.particleDirection.copy(runtimeEffectProjectileDirection(entry.projectileSourceEntry || entry));
      activeObject.add(preview);
      activeRuntimeEffectObjects.push(preview);
      continue;
    }
    if (runtimeEffectIsProjectile(entry) || runtimeEffectIsProjectileImpact(entry)) {
      activeObject.updateMatrixWorld(true);
      preview.userData.projectileDirection.copy(runtimeEffectProjectileDirection(entry));
      if (entry.bindingTarget.kind === "model-root-offset" && entry.bindingTarget.localPosition) {
        const bindingTarget = entry.bindingTarget;
        preview.userData.projectileOrigin.copy(bindingTarget.localPosition);
      } else {
        const worldPosition = new THREE.Vector3();
        anchor.getWorldPosition(worldPosition);
        activeObject.worldToLocal(worldPosition);
        preview.userData.projectileOrigin.copy(worldPosition);
      }
      activeObject.add(preview);
      if (runtimeEffectIsProjectile(entry)) updateRuntimeEffectProjectileMotion(preview, runtimeEffectElapsed);
      if (runtimeEffectIsProjectileImpact(entry)) updateRuntimeEffectProjectileImpactMotion(preview, runtimeEffectElapsed);
    } else if (runtimeEffectUsesWorldSnapshot(entry)) {
      preview.userData.worldSnapshotAnchor = anchor;
      activeObject.add(preview);
      updateRuntimeEffectWorldSnapshot(preview, runtimeEffectPreviewActivity(entry, runtimeEffectElapsed));
    } else if (entry.bindingTarget.kind === "model-root-offset") {
      if (entry.bindingTarget.localPosition) preview.position.copy(entry.bindingTarget.localPosition);
      activeObject.add(preview);
    } else if (entry.bindingTarget.kind === "model-root") {
      activeObject.add(preview);
    } else {
      const bone = anchor;
      bone.add(preview);
    }
    activeRuntimeEffectObjects.push(preview);
  }
}

function attachmentRecordsForItem(item) {
  return item && Array.isArray(item.attachments) ? item.attachments : [];
}

function selectedAttachmentRecords() {
  if (!activeAttachments.length) return [];
  if (attachmentSelect.value === "__all__") return activeAttachments;
  const index = Number(attachmentSelect.value);
  return Number.isInteger(index) && activeAttachments[index] ? [activeAttachments[index]] : [];
}

function syncAttachmentSelect(item = activeManifestItem) {
  const previousValue = attachmentSelect.value;
  activeAttachments = attachmentRecordsForItem(item);
  attachmentSelect.replaceChildren(new Option("不加载附属资源", ""));

  if (activeAttachments.length > 1) {
    attachmentSelect.appendChild(new Option("加载全部相关资源", "__all__"));
  }

  activeAttachments.forEach((attachment, index) => {
    attachmentSelect.appendChild(new Option(attachmentOptionLabel(attachment), String(index)));
  });

  attachmentSelect.value = [...attachmentSelect.options].some((option) => option.value === previousValue)
    ? previousValue
    : "";
  syncFormatControls();
}

async function loadAttachmentScene(attachment) {
  let lastError = null;
  for (const root of attachmentAssetRoots(attachment)) {
    try {
      return (await gltfLoader.loadAsync(`${root}${attachment.rel}`)).scene;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`missing attachment ${attachment.rel}`);
}

async function loadAttachmentAnimationClip(attachment) {
  if (!attachment.animationPath) return null;
  const response = await fetch(buildResourcePath(attachment.animationPath));
  if (!response.ok) return null;
  return parseAnimationFamily3Clip(await response.arrayBuffer());
}

async function loadAttachmentObject(attachment) {
  const [object, clip] = await Promise.all([loadAttachmentScene(attachment), loadAttachmentAnimationClip(attachment)]);
  object.name = `attachment_${attachment.label || attachment.rel}`;
  object.userData.vaingloryAttachment = true;
  object.userData.skipMainAnimationPose = true;
  object.userData.attachmentClip = clip;
  prepareSkinnedMeshBones(object);
  return object;
}

function applyAttachmentAnimationsAtTime(timeSeconds) {
  for (const object of activeAttachmentObjects) {
    const clip = object.userData.attachmentClip;
    if (!clip) continue;
    const poseByIndex = nativeClipPoseByBoneIndex(clip, timeSeconds);
    if (!poseByIndex) continue;
    applyPoseToSkinnedMeshesInObject(object, 1, poseByIndex, { includeTranslation: true, includeScale: false });
  }
}

async function loadSelectedAttachments() {
  clearAttachmentObjects();
  if (!activeObject) return;

  const attachments = selectedAttachmentRecords();
  if (!attachments.length) {
    syncBaseStats();
    syncModelHealth();
    return;
  }

  for (const attachment of attachments) {
    const object = await loadAttachmentObject(attachment);
    activeObject.add(object);
    activeAttachmentObjects.push(object);
  }

  if (selectedAnimation()) applyAnimationAtTime(manualAnimationTime);
  else {
    applyAnimationPose(activePoseBlend);
    applyAttachmentAnimationsAtTime(manualAnimationTime);
  }
  activeObject.updateMatrixWorld(true);
  frameObject(activeObject, { resetCamera: false });
  syncPreviewEffectVisibility();
  syncBaseStats();
  syncModelHealth();
  syncTimelineControls();
}

function applyMaterial(object) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xc9c0a3,
    roughness: 0.82,
    metalness: 0.08,
    side: THREE.DoubleSide,
    wireframe: wireToggle.checked,
  });

  object.traverse((child) => {
    if (child.isMesh) {
      child.material = material;
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });
}

function previewWaterShaderMaterialName(name = "") {
  return /(WaterShader|waterOpaque)/i.test(name);
}

function previewGuobMaterialName(name = "") {
  return /guob/i.test(name);
}

function previewEmbeddedGlowMaterialName(name = "") {
  return /\/Characters\/.*(?:orange|yellow|blue|red|green)?Glow\d*_mat\.shadergraph$/i.test(name);
}

function previewEmbeddedRuntimeGlowMaterial(material) {
  const evidence = material?.userData?.vaingloryRuntimeMaterialPipeline;
  if (!evidence || evidence.shaderPassStateFamily !== "state-9f003100") return false;
  if (evidence.glbAlphaMode !== "BLEND") return false;
  if (evidence.roleNames?.length) return false;
  return /(?:glow|fx|light|halo|spark|eye)/i.test(`${material?.name || ""} ${evidence.shadergraphRel || ""}`);
}

function previewEmbeddedGlowMaterial(material) {
  return previewEmbeddedGlowMaterialName(material?.name || "") || previewEmbeddedRuntimeGlowMaterial(material);
}

function previewBowStringMaterialName(name = "") {
  return /(?:bowString|bowAlpha)_mat\.shadergraph$/i.test(name);
}

function previewBowStringGeometryMaterialName(name = "") {
  return /bowString_mat\.shadergraph$/i.test(name);
}

function previewBowAlphaMaterialName(name = "") {
  return /bowAlpha_mat\.shadergraph$/i.test(name);
}

function previewSharedDiffuseMetallicRoughnessName(name = "") {
  return (
    /\/Characters\/.*\.shadergraph$/i.test(name) &&
    !previewWaterShaderMaterialName(name) &&
    !previewGuobMaterialName(name) &&
    !previewEmbeddedGlowMaterialName(name) &&
    !previewBowStringMaterialName(name) &&
    !/(swipe|trail|slash|projectile|impact|spark|particle|effect|alpha|mask)/i.test(name)
  );
}

function materialTexturesShareImage(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  const leftImage = left.image || left.source?.data;
  const rightImage = right.image || right.source?.data;
  if (leftImage && rightImage && leftImage === rightImage) return true;
  if (left.name && right.name && left.name === right.name) return true;
  return false;
}

function waterShaderAlphaMaskTexture(texture, alphaFloor) {
  if (!texture?.image) return null;
  texture.userData ||= {};
  const cacheKey = `waterShaderAlphaMask:${alphaFloor}`;
  if (texture.userData?.[cacheKey]) return texture.userData[cacheKey];

  const image = texture.image;
  const width = image.naturalWidth || image.videoWidth || image.width;
  const height = image.naturalHeight || image.videoHeight || image.height;
  if (!width || !height) return null;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    const floor = Math.max(0, Math.min(1, Number(alphaFloor) || 0));
    for (let cursor = 0; cursor < pixels.data.length; cursor += 4) {
      const mask = Math.max(pixels.data[cursor], pixels.data[cursor + 1], pixels.data[cursor + 2]) / 255;
      const alpha = Math.round((floor + mask * (1 - floor)) * 255);
      pixels.data[cursor] = alpha;
      pixels.data[cursor + 1] = alpha;
      pixels.data[cursor + 2] = alpha;
      pixels.data[cursor + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);

    const alphaTexture = new THREE.CanvasTexture(canvas);
    alphaTexture.name = `${texture.name || "waterShader"}_alphaMask`;
    alphaTexture.wrapS = texture.wrapS;
    alphaTexture.wrapT = texture.wrapT;
    alphaTexture.flipY = texture.flipY;
    alphaTexture.offset.copy(texture.offset);
    alphaTexture.repeat.copy(texture.repeat);
    alphaTexture.center.copy(texture.center);
    alphaTexture.rotation = texture.rotation;
    alphaTexture.colorSpace = THREE.NoColorSpace;
    alphaTexture.needsUpdate = true;
    texture.userData[cacheKey] = alphaTexture;
    return alphaTexture;
  } catch {
    return null;
  }
}

function invertedAlphaMaskTexture(texture) {
  if (!texture?.image) return null;
  texture.userData ||= {};
  if (texture.userData.invertedAlphaMaskTexture) return texture.userData.invertedAlphaMaskTexture;

  const image = texture.image;
  const width = image.naturalWidth || image.videoWidth || image.width;
  const height = image.naturalHeight || image.videoHeight || image.height;
  if (!width || !height) return null;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    for (let cursor = 0; cursor < pixels.data.length; cursor += 4) {
      const mask = Math.max(pixels.data[cursor], pixels.data[cursor + 1], pixels.data[cursor + 2]) / 255;
      const alpha = Math.round((1 - mask) * 255);
      pixels.data[cursor] = alpha;
      pixels.data[cursor + 1] = alpha;
      pixels.data[cursor + 2] = alpha;
      pixels.data[cursor + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);

    const alphaTexture = new THREE.CanvasTexture(canvas);
    alphaTexture.name = `${texture.name || "effect"}_invertedAlpha`;
    alphaTexture.wrapS = texture.wrapS;
    alphaTexture.wrapT = texture.wrapT;
    alphaTexture.flipY = texture.flipY;
    alphaTexture.offset.copy(texture.offset);
    alphaTexture.repeat.copy(texture.repeat);
    alphaTexture.center.copy(texture.center);
    alphaTexture.rotation = texture.rotation;
    alphaTexture.colorSpace = THREE.NoColorSpace;
    alphaTexture.needsUpdate = true;
    texture.userData.invertedAlphaMaskTexture = alphaTexture;
    return alphaTexture;
  } catch {
    return null;
  }
}

function bowAlphaRuntimeMaskTexture(materialName = "", sourceTexture = null) {
  const normalizedName = String(materialName || "").replace(/^\/+/, "");
  const texturePath = BOW_ALPHA_RUNTIME_MASKS.get(normalizedName);
  if (!texturePath) return null;

  const flipY = sourceTexture?.flipY ?? false;
  const cacheKey = `${texturePath}:${flipY ? "flipY" : "noFlipY"}`;
  if (bowAlphaRuntimeMaskTextureCache.has(cacheKey)) return bowAlphaRuntimeMaskTextureCache.get(cacheKey);

  const alphaTexture = bowAlphaTextureLoader.load(texturePath);
  alphaTexture.name = `${normalizedName}_runtimeAlphaMask`;
  alphaTexture.wrapS = THREE.RepeatWrapping;
  alphaTexture.wrapT = THREE.RepeatWrapping;
  alphaTexture.repeat.set(2, 2);
  alphaTexture.flipY = flipY;
  alphaTexture.colorSpace = THREE.NoColorSpace;
  bowAlphaRuntimeMaskTextureCache.set(cacheKey, alphaTexture);
  return alphaTexture;
}

function bowAlphaFallbackMaskTexture(texture) {
  if (!texture?.image) return null;
  texture.userData ||= {};
  if (texture.userData.bowAlphaMaskTexture) return texture.userData.bowAlphaMaskTexture;

  const image = texture.image;
  const width = image.naturalWidth || image.videoWidth || image.width;
  const height = image.naturalHeight || image.videoHeight || image.height;
  if (!width || !height) return null;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    for (let cursor = 0; cursor < pixels.data.length; cursor += 4) {
      const sourceAlpha = pixels.data[cursor + 3] / 255;
      const mask = Math.max(pixels.data[cursor], pixels.data[cursor + 1], pixels.data[cursor + 2]) / 255;
      const alpha = THREE.MathUtils.clamp((mask - 0.28) / 0.42, 0, 1) * sourceAlpha;
      const alphaByte = Math.round(alpha * 255);
      pixels.data[cursor] = alphaByte;
      pixels.data[cursor + 1] = alphaByte;
      pixels.data[cursor + 2] = alphaByte;
      pixels.data[cursor + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);

    const alphaTexture = new THREE.CanvasTexture(canvas);
    alphaTexture.name = `${texture.name || "bowAlpha"}_previewAlpha`;
    alphaTexture.wrapS = texture.wrapS;
    alphaTexture.wrapT = texture.wrapT;
    alphaTexture.flipY = texture.flipY;
    alphaTexture.offset.copy(texture.offset);
    alphaTexture.repeat.copy(texture.repeat);
    alphaTexture.center.copy(texture.center);
    alphaTexture.rotation = texture.rotation;
    alphaTexture.colorSpace = THREE.NoColorSpace;
    alphaTexture.needsUpdate = true;
    texture.userData.bowAlphaMaskTexture = alphaTexture;
    return alphaTexture;
  } catch {
    return null;
  }
}

function bowAlphaMaskTexture(texture, materialName = "") {
  return bowAlphaRuntimeMaskTexture(materialName, texture) || bowAlphaFallbackMaskTexture(texture);
}

function applyWaterShaderPreviewMaterial(material) {
  if (!material || material.userData?.waterShaderPreviewApplied) return;
  const materialName = material.name || "";
  const isWaterOpaque = /waterOpaque/i.test(materialName);
  const sourceMap = material.map;
  material.userData.waterShaderPreviewApplied = true;
  material.userData.previewSourceMap = sourceMap;
  material.alphaMap = isWaterOpaque ? waterShaderAlphaMaskTexture(sourceMap, WATER_SHADER_OPAQUE_ALPHA_FLOOR) : null;
  material.emissiveMap = sourceMap;
  material.map = null;
  material.color.set(isWaterOpaque ? 0x2fabc0 : 0x349bb9);
  if (material.emissive) {
    material.emissive.set(isWaterOpaque ? 0x0a2e36 : 0x2fb6ca);
    material.emissiveIntensity = isWaterOpaque ? 0.08 : 0.22;
  }
  material.roughness = isWaterOpaque ? 0.5 : 0.68;
  material.metalness = 0;
  material.envMapIntensity = isWaterOpaque ? 0.28 : 0.16;
  material.transparent = isWaterOpaque;
  material.opacity = isWaterOpaque ? 0.86 : WATER_SHADER_CRYSTAL_OPACITY;
  material.side = THREE.DoubleSide;
  material.depthWrite = true;
  material.flatShading = !isWaterOpaque;
  material.needsUpdate = true;
}

function applyGuobPreviewMaterial(material) {
  if (!material || material.userData?.guobPreviewApplied) return;
  const sourceMap = material.map;
  material.userData.guobPreviewApplied = true;
  material.userData.previewSourceMap = sourceMap;
  material.alphaMap = invertedAlphaMaskTexture(sourceMap);
  material.map = null;
  material.color.set(0x10353d);
  if (material.emissive) {
    material.emissive.set(0x06191d);
    material.emissiveIntensity = 0.08;
  }
  material.roughness = 1;
  material.metalness = 0;
  material.envMapIntensity = 0;
  material.transparent = true;
  material.opacity = GUOB_EFFECT_OPACITY;
  material.side = THREE.DoubleSide;
  material.depthWrite = false;
  material.needsUpdate = true;
}

function applySharedDiffuseMetallicRoughnessPreviewMaterial(material) {
  if (!material || material.userData?.sharedDiffuseMetallicRoughnessPreviewApplied) return;
  if (!material.roughnessMap && !material.metalnessMap) return;
  const sharesDiffuseMap =
    materialTexturesShareImage(material.map, material.roughnessMap) ||
    materialTexturesShareImage(material.map, material.metalnessMap) ||
    materialTexturesShareImage(material.roughnessMap, material.metalnessMap);
  if (!sharesDiffuseMap && !previewSharedDiffuseMetallicRoughnessName(material.name || "")) return;

  material.userData.sharedDiffuseMetallicRoughnessPreviewApplied = true;
  material.userData.previewSourceRoughnessMap = material.roughnessMap;
  material.userData.previewSourceMetalnessMap = material.metalnessMap;
  material.roughnessMap = null;
  material.metalnessMap = null;
  material.roughness = Math.max(material.roughness ?? 0, 0.92);
  material.metalness = 0;
  material.envMapIntensity = Math.min(material.envMapIntensity ?? 1, 0.12);
  material.needsUpdate = true;
}

function applyEmbeddedGlowPreviewMaterial(material) {
  if (!material || material.userData?.embeddedGlowPreviewApplied) return;
  material.userData.embeddedGlowPreviewApplied = true;
  material.transparent = true;
  material.opacity = EMBEDDED_GLOW_PREVIEW_OPACITY;
  material.depthWrite = false;
  material.roughness = 1;
  material.metalness = 0;
  material.envMapIntensity = 0;
  material.blending = THREE.NormalBlending;
  if (material.emissive) material.emissiveIntensity = 0;
  material.needsUpdate = true;
}

function bowStringPreviewBounds(geometry, materialIndex) {
  const position = geometry?.attributes?.position;
  if (!position) return null;
  const index = geometry.index;
  const groups = geometry.groups?.filter((group) => group.materialIndex === materialIndex) || [];
  const spans = groups.length ? groups : [{ start: 0, count: index?.count || position.count }];
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  let sampleCount = 0;

  for (const span of spans) {
    const end = Math.min((span.start || 0) + (span.count || 0), index?.count || position.count);
    for (let cursor = span.start || 0; cursor < end; cursor += 1) {
      const vertexIndex = index ? index.getX(cursor) : cursor;
      if (vertexIndex < 0 || vertexIndex >= position.count) continue;
      point.fromBufferAttribute(position, vertexIndex);
      bounds.expandByPoint(point);
      sampleCount += 1;
    }
  }

  return sampleCount && !bounds.isEmpty() ? bounds : null;
}

function addBowStringPreviewLine(mesh, materialIndex) {
  if (!mesh?.geometry || mesh.isSkinnedMesh) return;
  mesh.userData.bowStringPreviewLineIndices ||= {};
  const lineKey = String(materialIndex);
  if (mesh.userData.bowStringPreviewLineIndices[lineKey]) return;

  const bounds = bowStringPreviewBounds(mesh.geometry, materialIndex);
  if (!bounds) return;

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  let axis = "y";
  if (size.x >= size.y && size.x >= size.z) axis = "x";
  else if (size.z >= size.x && size.z >= size.y) axis = "z";

  const start = center.clone();
  const end = center.clone();
  start[axis] = bounds.min[axis];
  end[axis] = bounds.max[axis];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([start.x, start.y, start.z, end.x, end.y, end.z]), 3),
  );
  const material = new THREE.LineBasicMaterial({
    color: 0x071012,
    transparent: true,
    opacity: BOW_STRING_PREVIEW_LINE_OPACITY,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.name = `${mesh.name || "mesh"}_bowStringPreviewLine`;
  line.renderOrder = 2;
  line.frustumCulled = false;
  line.userData.vaingloryGeneratedPreviewLine = true;
  mesh.add(line);
  mesh.userData.bowStringPreviewLineIndices[lineKey] = true;
}

function bowStringMaterialTriangles(geometry, materialIndex) {
  const position = geometry?.attributes?.position;
  if (!position) return [];
  const index = geometry.index;
  const groups = geometry.groups?.filter((group) => group.materialIndex === materialIndex) || [];
  const spans = groups.length ? groups : [{ start: 0, count: index?.count || position.count }];
  const triangles = [];
  for (const span of spans) {
    const end = Math.min((span.start || 0) + (span.count || 0), index?.count || position.count);
    for (let cursor = span.start || 0; cursor + 2 < end; cursor += 3) {
      triangles.push([0, 1, 2].map((offset) => (index ? index.getX(cursor + offset) : cursor + offset)));
    }
  }
  return triangles;
}

function bowStringConnectedComponents(triangles) {
  const parents = new Map();
  const find = (value) => {
    if (!parents.has(value)) parents.set(value, value);
    const parent = parents.get(value);
    if (parent !== value) parents.set(value, find(parent));
    return parents.get(value);
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents.set(rightRoot, leftRoot);
  };

  for (const triangle of triangles) {
    if (triangle.length < 3) continue;
    union(triangle[0], triangle[1]);
    union(triangle[0], triangle[2]);
  }

  const components = new Map();
  for (const triangle of triangles) {
    for (const vertexIndex of triangle) {
      const root = find(vertexIndex);
      if (!components.has(root)) components.set(root, new Set());
      components.get(root).add(vertexIndex);
    }
  }
  return [...components.values()].map((component) => [...component]);
}

function bowStringComponentDominantAxis(position, component) {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const vertexIndex of component) {
    point.fromBufferAttribute(position, vertexIndex);
    bounds.expandByPoint(point);
  }
  const size = bounds.getSize(new THREE.Vector3());
  if (size.x >= size.y && size.x >= size.z) return "x";
  if (size.z >= size.x && size.z >= size.y) return "z";
  return "y";
}

function bowStringComponentClusters(position, components) {
  const point = new THREE.Vector3();
  const records = components.map((component) => {
    const bounds = new THREE.Box3();
    for (const vertexIndex of component) {
      point.fromBufferAttribute(position, vertexIndex);
      bounds.expandByPoint(point);
    }
    const center = bounds.getCenter(new THREE.Vector3());
    return {
      axis: bowStringComponentDominantAxis(position, component),
      bounds,
      center,
      components: [component],
    };
  });
  const clusters = [];
  const distanceLimit = BOW_STRING_COMPONENT_CLUSTER_DISTANCE;

  for (const record of records) {
    const cluster = clusters.find((candidate) => {
      if (candidate.axis !== record.axis) return false;
      const axes = ["x", "y", "z"].filter((axis) => axis !== record.axis);
      return Math.hypot(...axes.map((axis) => candidate.center[axis] - record.center[axis])) <= distanceLimit;
    });
    if (cluster) {
      cluster.bounds.union(record.bounds);
      cluster.bounds.getCenter(cluster.center);
      cluster.components.push(...record.components);
    } else {
      clusters.push({
        axis: record.axis,
        bounds: record.bounds.clone(),
        center: record.center.clone(),
        components: [...record.components],
      });
    }
  }

  return clusters;
}

function bowStringSkinnedCenterlineAttribute(geometry, materialIndex) {
  const position = geometry?.attributes?.position;
  if (!position) return null;
  geometry.userData ||= {};
  if (geometry.userData.bowStringPreviewCenterlineMaterialIndex === materialIndex) {
    return geometry.getAttribute("bowStringPreviewCenterline") || null;
  }

  const centerline = new Float32Array(position.count * 3);
  for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
    centerline[vertexIndex * 3] = position.getX(vertexIndex);
    centerline[vertexIndex * 3 + 1] = position.getY(vertexIndex);
    centerline[vertexIndex * 3 + 2] = position.getZ(vertexIndex);
  }

  const components = bowStringConnectedComponents(bowStringMaterialTriangles(geometry, materialIndex));
  const center = new THREE.Vector3();
  const point = new THREE.Vector3();
  const target = new THREE.Vector3();

  for (const cluster of bowStringComponentClusters(position, components)) {
    const axis = cluster.axis;
    center.copy(cluster.center);
    for (const component of cluster.components) {
      if (component.length < 3) continue;
      for (const vertexIndex of component) {
        point.fromBufferAttribute(position, vertexIndex);
        target.copy(center);
        target[axis] = point[axis];
        centerline[vertexIndex * 3] = target.x;
        centerline[vertexIndex * 3 + 1] = target.y;
        centerline[vertexIndex * 3 + 2] = target.z;
      }
    }
  }

  const attribute = new THREE.BufferAttribute(centerline, 3);
  geometry.setAttribute("bowStringPreviewCenterline", attribute);
  geometry.userData.bowStringPreviewCenterlineMaterialIndex = materialIndex;
  return attribute;
}

function applyBowStringSkinnedPreviewMaterial(mesh, materialIndex, material) {
  if (!mesh?.geometry || !material || material.userData?.bowStringSkinnedPreviewApplied) return;
  const sourceMap = material.map;
  const isBowAlpha = previewBowAlphaMaterialName(material.name || "");
  let centerlineAttribute = null;
  if (previewBowStringGeometryMaterialName(material.name || "")) centerlineAttribute = bowStringSkinnedCenterlineAttribute(mesh.geometry, materialIndex);

  material.userData.bowStringSkinnedPreviewApplied = true;
  material.userData.previewSourceMap = sourceMap;
  if (isBowAlpha) {
    material.map = sourceMap;
    material.alphaMap = bowAlphaMaskTexture(sourceMap, material.name || "");
    material.alphaTest = 0.35;
  } else {
    material.map = null;
    material.alphaMap = null;
    material.alphaTest = 0;
  }
  material.roughnessMap = null;
  material.metalnessMap = null;
  material.transparent = true;
  material.opacity = BOW_STRING_SKINNED_PREVIEW_OPACITY;
  material.visible = true;
  material.depthWrite = false;
  material.roughness = 1;
  material.metalness = 0;
  material.envMapIntensity = 0;
  material.side = THREE.DoubleSide;
  if (material.color) material.color.set(isBowAlpha ? 0xffffff : 0xd7e5df);
  if (material.emissive) {
    material.emissive.set(isBowAlpha ? 0x000000 : 0x263532);
    material.emissiveIntensity = isBowAlpha ? 0 : 0.35;
  }
  if (centerlineAttribute) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.bowStringPreviewWidthScale = { value: BOW_STRING_SKINNED_WIDTH_SCALE };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute vec3 bowStringPreviewCenterline;\nuniform float bowStringPreviewWidthScale;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\ntransformed = mix(bowStringPreviewCenterline, transformed, bowStringPreviewWidthScale);",
        );
    };
    material.customProgramCacheKey = () => `bowStringSkinnedPreview:centerline:${materialIndex}`;
  }
  material.needsUpdate = true;
}

function applyBowStringPreviewMaterial(material) {
  if (!material || material.userData?.bowStringPreviewApplied) return;
  material.userData.bowStringPreviewApplied = true;
  material.transparent = true;
  material.opacity = BOW_STRING_PREVIEW_OPACITY;
  material.visible = false;
  material.depthWrite = false;
  material.roughness = 1;
  material.metalness = 0;
  material.envMapIntensity = 0;
  material.side = THREE.DoubleSide;
  if (material.color) material.color.set(0x050d0e);
  if (material.emissive) {
    material.emissive.set(0x020506);
    material.emissiveIntensity = 0.05;
  }
  material.needsUpdate = true;
}

function materialRuntimeColorMode(material) {
  return material?.userData?.vaingloryRuntimeColorModeApplied || "";
}

function applyPreviewMaterialFixups(object) {
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (let materialIndex = 0; materialIndex < materials.length; materialIndex += 1) {
      const material = materials[materialIndex];
      const colorMode = materialRuntimeColorMode(material);
      if (previewSharedDiffuseMetallicRoughnessName(material?.name || "")) applySharedDiffuseMetallicRoughnessPreviewMaterial(material);
      if (previewEmbeddedGlowMaterial(material)) applyEmbeddedGlowPreviewMaterial(material);
      if (previewBowStringMaterialName(material?.name || "")) {
        if (child.isSkinnedMesh) applyBowStringSkinnedPreviewMaterial(child, materialIndex, material);
        else {
          applyBowStringPreviewMaterial(material);
          addBowStringPreviewLine(child, materialIndex);
        }
      }
      if (!colorMode && previewWaterShaderMaterialName(material?.name || "")) applyWaterShaderPreviewMaterial(material);
      if (!colorMode && previewGuobMaterialName(material?.name || "")) applyGuobPreviewMaterial(material);
    }
  });
}

function framedCameraDistance(size, aspect, fovDegrees) {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const fovRadians = THREE.MathUtils.degToRad(Number.isFinite(fovDegrees) ? fovDegrees : 45);
  const horizontalFovRadians = 2 * Math.atan(Math.tan(fovRadians / 2) * safeAspect);
  const fitWidth = Math.max(Math.abs(size.x), Math.abs(size.z) * 0.6, 1) * 1.28;
  const fitHeight = Math.max(Math.abs(size.y), Math.abs(size.z) * 0.6, 1) * 1.28;
  const verticalDistance = fitHeight / (2 * Math.tan(fovRadians / 2));
  const horizontalDistance = fitWidth / (2 * Math.tan(horizontalFovRadians / 2));
  const depthDistance = Math.max(Math.abs(size.z), 1) * 0.95;
  return Math.max(verticalDistance, horizontalDistance, depthDistance, 8);
}

function updateActiveCameraClipSphere(box) {
  if (!box || box.isEmpty()) {
    activeCameraClipSphere = null;
    return;
  }
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) {
    activeCameraClipSphere = null;
    return;
  }
  activeCameraClipSphere = sphere;
}

function updateCameraClipPlanes() {
  const sphere = activeCameraClipSphere;
  if (!sphere) return;
  const distanceToCenter = camera.position.distanceTo(sphere.center);
  const paddedRadius = Math.max(sphere.radius * CAMERA_CLIP_RADIUS_PADDING, 1);
  const previousNear = camera.near;
  const previousFar = camera.far;
  camera.near = Math.max(CAMERA_CLIP_MIN_NEAR, distanceToCenter - paddedRadius);
  camera.far = Math.max(camera.near + CAMERA_CLIP_MIN_DEPTH_SPAN, distanceToCenter + paddedRadius);
  if (Math.abs(previousNear - camera.near) < 0.0001 && Math.abs(previousFar - camera.far) < 0.0001) return;
  camera.updateProjectionMatrix();
}

function boxFromFiniteSkinnedSummary(summary) {
  if (!summary?.min?.every(Number.isFinite) || !summary?.max?.every(Number.isFinite)) return null;
  const box = new THREE.Box3(new THREE.Vector3(...summary.min), new THREE.Vector3(...summary.max));
  return box.isEmpty() ? null : box;
}

function boxFromRobustSkinnedSummary(summary) {
  return boxFromFiniteSkinnedSummary({
    min: summary?.robustMin || summary?.min,
    max: summary?.robustMax || summary?.max,
  });
}

function frameObject(object, options = {}) {
  const resetCamera = options.resetCamera ?? true;
  const skinnedBox = object === activeObject ? boxFromRobustSkinnedSummary(summarizeCurrentSkinnedBounds(0)) : null;
  if (object === activeObject && firstActiveSkinnedSkeletonBones().length && !skinnedBox) return;
  const box = skinnedBox || new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  object.position.sub(center);
  object.updateMatrixWorld(true);
  const normalizedSkinnedBox = object === activeObject ? boxFromRobustSkinnedSummary(summarizeCurrentSkinnedBounds(0)) : null;
  const normalizedBox = normalizedSkinnedBox || new THREE.Box3().setFromObject(object);
  const normalizedCenter = normalizedBox.getCenter(new THREE.Vector3());
  const normalizedSize = normalizedBox.getSize(new THREE.Vector3());

  const distance = framedCameraDistance(normalizedSize, camera.aspect, camera.fov);
  updateActiveCameraClipSphere(normalizedBox);
  updateCameraClipPlanes();
  const preservedCameraOffset = camera.position.clone().sub(controls.target);
  const preservedCameraDistance = preservedCameraOffset.length();
  const preservedCameraDirection =
    preservedCameraDistance > 0.0001
      ? preservedCameraOffset.clone().normalize()
      : new THREE.Vector3(0.45, 0.35, 1).normalize();
  const previousFitDistance = Number.isFinite(lastFrameFitDistance) && lastFrameFitDistance > 0 ? lastFrameFitDistance : distance;
  const preservedZoomRatio = preservedCameraDistance / previousFitDistance;
  const fittedPreservedDistance = THREE.MathUtils.clamp(distance * preservedZoomRatio, distance * 0.65, distance * 2.5);
  lastFrameFitDistance = distance;
  if (!resetCamera) {
    controls.target.copy(normalizedCenter);
    camera.position.copy(normalizedCenter).add(preservedCameraDirection.multiplyScalar(fittedPreservedDistance));
    camera.lookAt(controls.target);
    controls.update();
    return;
  }
  camera.position.set(distance * 0.55, distance * 0.45, distance);
  controls.target.copy(normalizedCenter);
  camera.lookAt(controls.target);
  controls.update();
}

function canvasHasVisibleModelPixels() {
  const canvas = renderer.domElement;
  const gl = renderer.getContext();
  if (!canvas?.width || !canvas?.height || !gl?.readPixels) return true;

  const clearColor = renderer.getClearColor(new THREE.Color());
  const clearRed = Math.round(clearColor.r * 255);
  const clearGreen = Math.round(clearColor.g * 255);
  const clearBlue = Math.round(clearColor.b * 255);
  const pixel = new Uint8Array(4);
  const stepX = Math.max(8, Math.floor(canvas.width / 96));
  const stepY = Math.max(8, Math.floor(canvas.height / 96));
  const minX = Math.floor(canvas.width * 0.08);
  const maxX = Math.floor(canvas.width * 0.92);
  const minY = Math.floor(canvas.height * 0.08);
  const maxY = Math.floor(canvas.height * 0.92);
  let visibleSamples = 0;

  for (let y = minY; y <= maxY; y += stepY) {
    const readY = Math.max(0, Math.min(canvas.height - 1, canvas.height - y - 1));
    for (let x = minX; x <= maxX; x += stepX) {
      gl.readPixels(x, readY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const colorDistance =
        Math.abs(pixel[0] - clearRed) + Math.abs(pixel[1] - clearGreen) + Math.abs(pixel[2] - clearBlue);
      if (pixel[3] > 0 && colorDistance > 18) {
        visibleSamples += 1;
        if (visibleSamples >= 2) return true;
      }
    }
  }

  return false;
}

function objectProjectedViewportCoverage(object) {
  if (!object) return null;

  let objectBox = new THREE.Box3();
  const meshBox = new THREE.Box3();
  let hasMesh = false;
  object.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const skinnedBox = object === activeObject ? boxFromRobustSkinnedSummary(summarizeCurrentSkinnedBounds(0)) : null;
  if (skinnedBox) {
    objectBox = skinnedBox;
    hasMesh = true;
  } else {
    object.traverse((child) => {
      if (!child.visible || !child.isMesh || !child.geometry) return;
      if (isPreviewEffectMesh(child)) return;
      meshBox.setFromObject(child);
      if (meshBox.isEmpty()) return;
      objectBox.union(meshBox);
      hasMesh = true;
    });
  }

  if (!hasMesh || objectBox.isEmpty()) return null;

  const projectedCenter = objectBox.getCenter(new THREE.Vector3()).project(camera);
  const centerInView =
    [projectedCenter.x, projectedCenter.y, projectedCenter.z].every(Number.isFinite) &&
    projectedCenter.x >= -1 &&
    projectedCenter.x <= 1 &&
    projectedCenter.y >= -1 &&
    projectedCenter.y <= 1 &&
    projectedCenter.z >= -1 &&
    projectedCenter.z <= 1;

  const { min, max } = objectBox;
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const corner of corners) {
    corner.project(camera);
    if (![corner.x, corner.y, corner.z].every(Number.isFinite)) continue;
    minX = Math.min(minX, corner.x);
    maxX = Math.max(maxX, corner.x);
    minY = Math.min(minY, corner.y);
    maxY = Math.max(maxY, corner.y);
    minZ = Math.min(minZ, corner.z);
    maxZ = Math.max(maxZ, corner.z);
  }

  if (![minX, maxX, minY, maxY, minZ, maxZ].every(Number.isFinite)) {
    return {
      depthIntersects: false,
      centerInView: false,
      viewportCoverage: 0,
      visibleProjectedRatio: 0,
    };
  }

  const margin = 0.08;
  const depthIntersects = maxZ >= -1 && minZ <= 1;
  const overlapX = Math.max(0, Math.min(maxX, 1 + margin) - Math.max(minX, -1 - margin));
  const overlapY = Math.max(0, Math.min(maxY, 1 + margin) - Math.max(minY, -1 - margin));
  const viewportCoverage = (overlapX * overlapY) / 4;
  return {
    depthIntersects,
    centerInView,
    viewportCoverage,
    visibleProjectedRatio: viewportCoverage,
  };
}

function objectProjectedBoundsVisible(object) {
  const projection = objectProjectedViewportCoverage(object);
  if (!projection) return true;
  const centeredEnough =
    projection.centerInView && projection.visibleProjectedRatio >= MIN_CENTERED_PROJECTED_VIEWPORT_COVERAGE;
  return (
    projection.depthIntersects &&
    (projection.visibleProjectedRatio >= MIN_PROJECTED_VIEWPORT_COVERAGE || centeredEnough)
  );
}

function objectNeedsCameraRefit(object, options = {}) {
  const projection = objectProjectedViewportCoverage(object);
  if (!projection) return false;
  const minProjectedCoverage = options.minProjectedCoverage ?? MIN_PROJECTED_VIEWPORT_COVERAGE;
  const maxProjectedCoverage = options.maxProjectedCoverage ?? MAX_REFIT_PROJECTED_VIEWPORT_COVERAGE;
  if (!projection.depthIntersects) return true;
  if (!projection.centerInView) return projection.visibleProjectedRatio < MIN_PROJECTED_VIEWPORT_COVERAGE;
  if (projection.visibleProjectedRatio > maxProjectedCoverage) return true;
  return projection.visibleProjectedRatio < minProjectedCoverage;
}

function scheduleAutoFrameIfCanvasBlank(object, options = {}) {
  const remainingAttempts = options.remainingAttempts ?? AUTO_FRAME_RETRY_COUNT;
  requestAnimationFrame(() => {
    renderSceneOnce();
    if (!object || object !== activeObject) return;
    const shouldRefit = objectNeedsCameraRefit(object, options);
    if (!shouldRefit && canvasHasVisibleModelPixels()) return;
    frameObject(object, { resetCamera: true });
    renderSceneOnce();
    if (remainingAttempts > 1) {
      scheduleAutoFrameIfCanvasBlank(object, { ...options, remainingAttempts: remainingAttempts - 1 });
    }
  });
}

function meshStats(object) {
  let meshes = 0;
  let vertices = 0;
  let triangles = 0;
  const seenVertexArrays = new Set();
  object.traverse((child) => {
    if (!child.visible || !child.isMesh || !child.geometry) return;
    meshes += 1;
    const position = child.geometry.getAttribute("position");
    if (position) {
      if (!seenVertexArrays.has(position.array)) {
        vertices += position.count;
        seenVertexArrays.add(position.array);
      }
    }
    const itemCount = child.geometry.index?.count || position?.count || 0;
    triangles += activeGeometryDrawRange(child.geometry, itemCount).count / 3;
  });
  return { meshes, vertices, triangles: Math.floor(triangles) };
}

function materialHealthSummary(object = activeObject) {
  const resourceSummary = resourceCompletenessHealthSummary();
  const skinVariantAliasSummary = runtimeSkinVariantAliasHealthSummary();
  const glbMaterialSummary = glbMaterialCoverageHealthSummary();
  const materialRuntimePipelineSummaryText = materialRuntimePipelineHealthSummary();
  const materialRenderStateAuditSummaryText = materialRenderStateAuditHealthSummary();
  const stateSummary = runtimeStateConditionHealthSummary();
  const attachmentNativeSummary = runtimeAttachmentNativeChainHealthSummary();
  const projectileBindingSummary = runtimeEffectProjectileBindingHealthSummary();
  const projectileGapSummary = runtimeEffectProjectileGapHealthSummary();
  const projectileCreateBridgeSummary = runtimeEffectProjectileCreateBridgeHealthSummary();
  const projectileTargetDispatchSummary = runtimeEffectProjectileTargetDispatchHealthSummary();
  const projectileVtableSlotSummary = runtimeEffectProjectileVtableSlotHealthSummary();
  const projectileVtableFunctionSummary = runtimeEffectProjectileVtableFunctionHealthSummary();
  const projectileVtableOutputLayoutSummary = runtimeEffectProjectileVtableOutputLayoutHealthSummary();
  const projectileVtableCallsitePayloadSummary = runtimeEffectProjectileVtableCallsitePayloadHealthSummary();
  const projectileVtableSemanticJoinSummary = runtimeEffectProjectileVtableSemanticJoinHealthSummary();
  const projectileConsumerTraceSummary = runtimeEffectProjectileConsumerTraceHealthSummary();
  const projectileCurrentTokenWindowSummary = runtimeEffectProjectileCurrentTokenWindowHealthSummary();
  const projectileCurrentBranchTargetSummary = runtimeEffectProjectileCurrentBranchTargetHealthSummary();
  const projectileCurrentFieldWriterCallsiteSummary = runtimeEffectProjectileCurrentFieldWriterCallsiteHealthSummary();
  const projectileCurrentFieldReaderCandidateSummary = runtimeEffectProjectileCurrentFieldReaderCandidateHealthSummary();
  const projectileCurrentFieldReaderCallsiteContextSummary =
    runtimeEffectProjectileCurrentFieldReaderCallsiteContextHealthSummary();
  const projectileCurrentFieldReaderDownstreamRouteSummary =
    runtimeEffectProjectileCurrentFieldReaderDownstreamRouteHealthSummary();
  const projectileCurrentFieldReaderListDispatchSummary =
    runtimeEffectProjectileCurrentFieldReaderListDispatchHealthSummary();
  const projectileCurrentTokenChildObjectChainSummary =
    runtimeEffectProjectileCurrentTokenChildObjectChainHealthSummary();
  const projectileCurrentTokenChildCallbackBodySummary =
    runtimeEffectProjectileCurrentTokenChildCallbackBodyHealthSummary();
  const projectileCurrentTokenChildClassMethodSummary =
    runtimeEffectProjectileCurrentTokenChildClassMethodHealthSummary();
  const projectileCurrentTokenChildEvaluatorPayloadSummary =
    runtimeEffectProjectileCurrentTokenChildEvaluatorPayloadHealthSummary();
  const projectileCurrentTokenChildPayloadSetterSummary =
    runtimeEffectProjectileCurrentTokenChildPayloadSetterHealthSummary();
  const projectileCurrentTokenChildPayloadSetterDownstreamSummary =
    runtimeEffectProjectileCurrentTokenChildPayloadSetterDownstreamHealthSummary();
  const projectileCurrentTokenChildManagerRecordBridgeSummary =
    runtimeEffectProjectileCurrentTokenChildManagerRecordBridgeHealthSummary();
  const projectileCurrentTokenChildEffectOwnerCandidateSummary =
    runtimeEffectProjectileCurrentTokenChildEffectOwnerCandidateHealthSummary();
  const projectileCurrentTokenChildStaticPfxOwnerSummary =
    runtimeEffectProjectileCurrentTokenChildStaticPfxOwnerHealthSummary();
  const effectHookSummary = runtimeEffectHookHealthSummary();
  const particleRuntimeSummary = nativeParticleRuntimeSchemaHealthSummary();
  const particleCallbackTableSummary = nativeParticleCallbackTableScanHealthSummary();
  const particleCallbackSemanticsSummary = nativeParticleCallbackSemanticsHealthSummary();
  const pfxEncryptedRuntimeTargetSummaryText = pfxEncryptedRuntimeTargetHealthSummary();
  const pfxNativeCallbackRuntimeTargetSummaryText = pfxNativeCallbackRuntimeTargetHealthSummary();
  const pfxNativeCallbackCaptureSummaryText = pfxNativeCallbackCaptureHealthSummary();
  const effectNativeChannelCaptureTargetSummaryText = effectNativeChannelCaptureTargetHealthSummary();
  const effectNativeChannelCaptureSummaryText = effectNativeChannelCaptureHealthSummary();
  const effectChannelStaticResourceAuditSummaryText = effectChannelStaticResourceAuditHealthSummary();
  const nativeEffectTokenOnlyCallsiteAuditSummaryText = nativeEffectTokenOnlyCallsiteAuditHealthSummary();
  const nativeEffectHashMissingOwnerAuditSummaryText = nativeEffectHashMissingOwnerAuditHealthSummary();
  const kindredHashPfxRuntimeGateAuditSummaryText = kindredHashPfxRuntimeGateAuditHealthSummary();
  const kindredEffectComponentRuntimeChainAuditSummaryText = kindredEffectComponentRuntimeChainAuditHealthSummary();
  const kindredCurrentParticleBridgeAuditSummaryText = kindredCurrentParticleBridgeAuditHealthSummary();
  const nativeBuilderSummary = nativeEffectBuilderMethodSemanticsHealthSummary();
  const nativeTransientPrimitiveSummary = nativeTransientEffectPrimitiveChainHealthSummary();
  const nativeTransientRecordSummary = nativeTransientRenderRecordSchemaHealthSummary();
  const nativeTransientRecordCallsiteSummary = nativeTransientRenderRecordCallsiteScanHealthSummary();
  const nativeTransientRecordRuntimeSummary = nativeTransientRecordRuntimeExecutorHealthSummary();
  const currentParticleDrawChainSummary = currentNativeParticleDrawChainHealthSummary();
  const currentParticleRegistrationChainSummary = currentNativeParticleRegistrationChainHealthSummary();
  const currentLayoutAOwnerGlobalUsageSummary = currentNativeLayoutAOwnerGlobalUsageHealthSummary();
  const currentLayoutARefreshStateSourceSummary = currentNativeLayoutARefreshStateSourceHealthSummary();
  const currentLayoutAStateWriterSummary = currentNativeLayoutAStateWriterHealthSummary();
  const currentLayoutAStateRegistrationSummary = currentNativeLayoutAStateRegistrationHealthSummary();
  const currentLayoutAAddRecordFlagSourceSummary = currentNativeLayoutAAddRecordFlagSourceHealthSummary();
  const currentParticleMaskCandidateOwnerSummary = currentNativeParticleMaskCandidateOwnerHealthSummary();
  const currentType210PrimitiveBuilderSummary = currentNativeType210PrimitiveBuilderHealthSummary();
  const currentType210LevelVisualsBridgeSummary = currentNativeType210LevelVisualsBridgeHealthSummary();
  const currentLayoutBTypeOwnerSummary = currentNativeLayoutBTypeOwnerHealthSummary();
  const currentLayoutBEntryOwnerSummary = currentNativeLayoutBEntryOwnerHealthSummary();
  const currentObjectAcWidthOverlapSummary = currentNativeObjectAcWidthOverlapHealthSummary();
  const currentObjectAcOwnerTraceSummary = currentNativeObjectAcOwnerTraceHealthSummary();
  const currentLayoutBCallbackBoundarySummary = currentNativeLayoutBCallbackBoundaryHealthSummary();
  const currentLayoutBIndirectSlotSummary = currentNativeLayoutBIndirectSlotHealthSummary();
  const currentLayoutBSlotRecordBridgeSummary = currentNativeLayoutBSlotRecordBridgeHealthSummary();
  const currentLayoutBActiveRecordLifecycleSummary = currentNativeLayoutBActiveRecordLifecycleHealthSummary();
  const currentLayoutBTargetPayloadSummary = currentNativeLayoutBTargetPayloadHealthSummary();
  const currentLayoutBPfxTargetFactorySummary = currentNativeLayoutBPfxTargetFactoryHealthSummary();
  let currentLayoutBTargetCacheSummary = currentNativeLayoutBTargetCacheHealthSummary();
  const currentLayoutBTargetPayloadNodeChainSummary =
    currentNativeLayoutBTargetPayloadNodeChainHealthSummary();
  const currentLayoutBPayloadSourceProgramBridgeSummary =
    currentNativeLayoutBPayloadSourceProgramBridgeHealthSummary();
  currentLayoutBTargetCacheSummary += currentLayoutBTargetPayloadNodeChainSummary;
  currentLayoutBTargetCacheSummary += currentLayoutBPayloadSourceProgramBridgeSummary;
  const currentLayoutBManagerDrawBridgeSummary = currentNativeLayoutBManagerDrawBridgeHealthSummary();
  let currentLayoutBParticleEntryDispatchSummary = currentNativeLayoutBParticleEntryDispatchHealthSummary();
  const currentLayoutBEntryProviderPayloadBridgeSummary =
    currentNativeLayoutBEntryProviderPayloadBridgeHealthSummary();
  currentLayoutBParticleEntryDispatchSummary += currentLayoutBEntryProviderPayloadBridgeSummary;
  const currentLayoutBOwnerBVtableDispatchSummary = currentNativeLayoutBOwnerBVtableDispatchHealthSummary();
  const currentLayoutBPrimitiveModeDispatchSummary = currentNativeLayoutBPrimitiveModeDispatchHealthSummary();
  const currentLayoutBMaterialDrawBridgeSummary = currentNativeLayoutBMaterialDrawBridgeHealthSummary();
  const currentLayoutBFinalPrimitiveConsumerSummary = currentNativeLayoutBFinalPrimitiveConsumerHealthSummary();
  const currentLayoutBShaderParameterBridgeSummary = currentNativeLayoutBShaderParameterBridgeHealthSummary();
  const currentShaderDataType4ValueSourceSummary = currentNativeShaderDataType4ValueSourceHealthSummary();
  const currentShaderDataType4EntrySemanticsSummary = currentNativeShaderDataType4EntrySemanticsHealthSummary();
  const currentTexDataTextureObjectSummary = currentNativeTexDataTextureObjectHealthSummary();
  const currentShaderDataTextureSamplerTableSummary = currentNativeShaderDataTextureSamplerTableHealthSummary();
  const currentShaderDataExternalTextureBindingSummary = currentNativeShaderDataExternalTextureBindingHealthSummary();
  const currentTextureSamplerStateSemanticsSummary = currentNativeTextureSamplerStateSemanticsHealthSummary();
  const currentShaderDataInlineTexturePlaceholderSummary =
    currentNativeShaderDataInlineTexturePlaceholderHealthSummary();
  const currentShadergraphSamplerTexDataJoinSummary = currentNativeShadergraphSamplerTexDataJoinHealthSummary();
  const currentMaterialSourceProgramCaptureTargetSummary = currentNativeMaterialSourceProgramCaptureTargetHealthSummary();
  const currentMaterialSourceProgramCaptureSummary = currentNativeMaterialSourceProgramCaptureHealthSummary();
  const currentDefinitionShaderParamStaticStringSummary =
    currentNativeDefinitionShaderParamStaticStringHealthSummary();
  const currentDefinitionShaderParamsPayloadStructureSummary =
    currentNativeDefinitionShaderParamsPayloadStructureHealthSummary();
  const currentMaterialSamplerOwnershipGateSummary = currentNativeMaterialSamplerOwnershipGateHealthSummary();
  const currentRuntimeCaptureGateSummary = currentNativeRuntimeCaptureGateHealthSummary();
  const currentDynamicSourceTableSemanticsSummary = currentNativeDynamicSourceTableSemanticsHealthSummary();
  const currentStaticMeshSelectorEntrySummary = currentNativeStaticMeshSelectorEntryHealthSummary();
  const currentShaderParamsSchemaSummary = currentNativeShaderParamsSchemaHealthSummary();
  const currentStaticMeshShaderParamsCaptureTargetSummary =
    currentNativeStaticMeshShaderParamsCaptureTargetHealthSummary();
  const currentStaticMeshShaderParamsCaptureSummary = currentNativeStaticMeshShaderParamsCaptureHealthSummary();
  const currentShaderParamsValueSemanticsSummary = currentNativeShaderParamsValueSemanticsHealthSummary();
  const currentLayoutBObjectAcStoreCoverageSummary = currentNativeLayoutBObjectAcStoreCoverageHealthSummary();
  const currentLayoutBObjectAcRuntimeCaptureTargetSummary =
    currentNativeLayoutBObjectAcRuntimeCaptureTargetHealthSummary();
  const currentLayoutBObjectAcRuntimeCaptureSummary = currentNativeLayoutBObjectAcRuntimeCaptureHealthSummary();
  const currentLayoutBObjectAcCandidateDisqualificationSummary =
    currentNativeLayoutBObjectAcCandidateDisqualificationHealthSummary();
  const currentLayoutBPayloadRecordLayoutSummary = currentNativeLayoutBPayloadRecordLayoutHealthSummary();
  const currentLayoutBFlagProducerSummary = currentNativeLayoutBFlagProducerHealthSummary();
  const currentLayoutBVisibilityGateSummary = currentNativeLayoutBVisibilityGateHealthSummary();
  const currentLayoutBTargetStatusSummary = currentNativeLayoutBTargetStatusHealthSummary();
  const currentLayoutBRefreshModeSplitSummary = currentNativeLayoutBRefreshModeSplitHealthSummary();
  const currentLayoutBQueryApplyPathSummary = currentNativeLayoutBQueryApplyPathHealthSummary();
  const currentLayoutBSharedStructApplySummary = currentNativeLayoutBSharedStructApplyHealthSummary();
  const currentLayoutBCallerStructInitializerSummary = currentNativeLayoutBCallerStructInitializerHealthSummary();
  const currentLayoutBComponentTableEntrySummary = currentNativeLayoutBComponentTableEntryHealthSummary();
  const currentLayoutBComponentTableOwnerSummary = currentNativeLayoutBComponentTableOwnerHealthSummary();
  const currentLayoutBComponentSlotRegistrationSummary = currentNativeLayoutBComponentSlotRegistrationHealthSummary();
  const currentLayoutBDirectCallerStructBuilderSummary = currentNativeLayoutBDirectCallerStructBuilderHealthSummary();
  const currentLayoutBResourceCallerDynamicFieldsSummary =
    currentNativeLayoutBResourceCallerDynamicFieldsHealthSummary();
  const currentLayoutBCommonApplySetterFieldsSummary = currentNativeLayoutBCommonApplySetterFieldsHealthSummary();
  const currentLayoutBObjectAcProducerGateSummary = currentNativeLayoutBObjectAcProducerGateHealthSummary();
  const currentPositionSamplerOwnerSummary = currentNativePositionSamplerOwnerHealthSummary();
  const currentLevelRuntimeOwnerSummary = currentNativeLevelRuntimeOwnerHealthSummary();
  const currentRuntimeKeySelectorCaptureTargetSummary = currentNativeRuntimeKeySelectorCaptureTargetHealthSummary();
  const runtimeKeySelectorCaptureSummaryText = runtimeKeySelectorCaptureHealthSummary();
  const currentLightProbeChainSummary = currentNativeLightProbeChainHealthSummary();
  const heroPreviewProfileSummary = heroPreviewProfileCandidateHealthSummary();
  const nativeBinarySummary = nativeBinaryVersionAuditHealthSummary();
  if (!object) return "材质诊断：未加载模型。";
  let meshCount = 0;
  let texturedCount = 0;
  let untexturedCount = 0;
  let paleCount = 0;

  object.traverse((child) => {
    if (!child.visible || !child.isMesh) return;
    meshCount += 1;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const hasTexture = materials.some((material) => material?.map || material?.emissiveMap || material?.normalMap);
    if (hasTexture) {
      texturedCount += 1;
      return;
    }
    untexturedCount += 1;
    const looksPale = materials.some((material) => {
      const color = material?.color;
      if (!color) return true;
      return color.r > 0.78 && color.g > 0.72 && color.b > 0.62;
    });
    if (looksPale) paleCount += 1;
  });

  if (!meshCount) return "材质诊断：当前对象没有可见网格。";
  if (untexturedCount) {
    return `材质诊断：${texturedCount}/${meshCount} 个部件带贴图，${untexturedCount} 个只有材质色，${paleCount} 个疑似白膜。${resourceSummary}${skinVariantAliasSummary}${glbMaterialSummary}${materialRuntimePipelineSummaryText}${materialRenderStateAuditSummaryText}${stateSummary}${attachmentNativeSummary}${projectileBindingSummary}${projectileGapSummary}${projectileCreateBridgeSummary}${projectileTargetDispatchSummary}${projectileVtableSlotSummary}${projectileVtableFunctionSummary}${projectileVtableOutputLayoutSummary}${projectileVtableCallsitePayloadSummary}${projectileVtableSemanticJoinSummary}${projectileConsumerTraceSummary}${projectileCurrentTokenWindowSummary}${projectileCurrentBranchTargetSummary}${projectileCurrentFieldWriterCallsiteSummary}${projectileCurrentFieldReaderCandidateSummary}${projectileCurrentFieldReaderCallsiteContextSummary}${projectileCurrentFieldReaderDownstreamRouteSummary}${projectileCurrentFieldReaderListDispatchSummary}${projectileCurrentTokenChildObjectChainSummary}${projectileCurrentTokenChildCallbackBodySummary}${projectileCurrentTokenChildClassMethodSummary}${projectileCurrentTokenChildEvaluatorPayloadSummary}${projectileCurrentTokenChildPayloadSetterSummary}${projectileCurrentTokenChildPayloadSetterDownstreamSummary}${projectileCurrentTokenChildManagerRecordBridgeSummary}${projectileCurrentTokenChildEffectOwnerCandidateSummary}${projectileCurrentTokenChildStaticPfxOwnerSummary}${effectHookSummary}${particleRuntimeSummary}${particleCallbackTableSummary}${particleCallbackSemanticsSummary}${pfxEncryptedRuntimeTargetSummaryText}${pfxNativeCallbackRuntimeTargetSummaryText}${pfxNativeCallbackCaptureSummaryText}${effectNativeChannelCaptureTargetSummaryText}${effectNativeChannelCaptureSummaryText}${effectChannelStaticResourceAuditSummaryText}${nativeEffectTokenOnlyCallsiteAuditSummaryText}${nativeEffectHashMissingOwnerAuditSummaryText}${kindredHashPfxRuntimeGateAuditSummaryText}${kindredEffectComponentRuntimeChainAuditSummaryText}${kindredCurrentParticleBridgeAuditSummaryText}${nativeBuilderSummary}${nativeTransientPrimitiveSummary}${nativeTransientRecordSummary}${nativeTransientRecordCallsiteSummary}${nativeTransientRecordRuntimeSummary}${currentParticleDrawChainSummary}${currentParticleRegistrationChainSummary}${currentLayoutAOwnerGlobalUsageSummary}${currentLayoutARefreshStateSourceSummary}${currentLayoutAStateWriterSummary}${currentLayoutAStateRegistrationSummary}${currentLayoutAAddRecordFlagSourceSummary}${currentParticleMaskCandidateOwnerSummary}${currentType210PrimitiveBuilderSummary}${currentType210LevelVisualsBridgeSummary}${currentLayoutBTypeOwnerSummary}${currentLayoutBEntryOwnerSummary}${currentObjectAcWidthOverlapSummary}${currentObjectAcOwnerTraceSummary}${currentLayoutBCallbackBoundarySummary}${currentLayoutBIndirectSlotSummary}${currentLayoutBSlotRecordBridgeSummary}${currentLayoutBActiveRecordLifecycleSummary}${currentLayoutBTargetPayloadSummary}${currentLayoutBPfxTargetFactorySummary}${currentLayoutBTargetCacheSummary}${currentLayoutBManagerDrawBridgeSummary}${currentLayoutBParticleEntryDispatchSummary}${currentLayoutBOwnerBVtableDispatchSummary}${currentLayoutBPrimitiveModeDispatchSummary}${currentLayoutBMaterialDrawBridgeSummary}${currentLayoutBFinalPrimitiveConsumerSummary}${currentLayoutBShaderParameterBridgeSummary}${currentShaderDataType4ValueSourceSummary}${currentShaderDataType4EntrySemanticsSummary}${currentTexDataTextureObjectSummary}${currentShaderDataTextureSamplerTableSummary}${currentShaderDataExternalTextureBindingSummary}${currentTextureSamplerStateSemanticsSummary}${currentShaderDataInlineTexturePlaceholderSummary}${currentShadergraphSamplerTexDataJoinSummary}${currentMaterialSourceProgramCaptureTargetSummary}${currentMaterialSourceProgramCaptureSummary}${currentDefinitionShaderParamStaticStringSummary}${currentDefinitionShaderParamsPayloadStructureSummary}${currentMaterialSamplerOwnershipGateSummary}${currentRuntimeCaptureGateSummary}${currentDynamicSourceTableSemanticsSummary}${currentStaticMeshSelectorEntrySummary}${currentShaderParamsSchemaSummary}${currentStaticMeshShaderParamsCaptureTargetSummary}${currentStaticMeshShaderParamsCaptureSummary}${currentShaderParamsValueSemanticsSummary}${currentLayoutBObjectAcStoreCoverageSummary}${currentLayoutBObjectAcRuntimeCaptureTargetSummary}${currentLayoutBObjectAcRuntimeCaptureSummary}${currentLayoutBObjectAcCandidateDisqualificationSummary}${currentLayoutBPayloadRecordLayoutSummary}${currentLayoutBFlagProducerSummary}${currentLayoutBVisibilityGateSummary}${currentLayoutBTargetStatusSummary}${currentLayoutBRefreshModeSplitSummary}${currentLayoutBQueryApplyPathSummary}${currentLayoutBSharedStructApplySummary}${currentLayoutBCallerStructInitializerSummary}${currentLayoutBComponentTableEntrySummary}${currentLayoutBComponentTableOwnerSummary}${currentLayoutBComponentSlotRegistrationSummary}${currentLayoutBDirectCallerStructBuilderSummary}${currentLayoutBResourceCallerDynamicFieldsSummary}${currentLayoutBCommonApplySetterFieldsSummary}${currentLayoutBObjectAcProducerGateSummary}${currentPositionSamplerOwnerSummary}${currentLevelRuntimeOwnerSummary}${currentRuntimeKeySelectorCaptureTargetSummary}${runtimeKeySelectorCaptureSummaryText}${currentLightProbeChainSummary}${heroPreviewProfileSummary}${nativeBinarySummary}`;
  }
  return `材质诊断：${meshCount} 个可见部件都有贴图或贴图材质。${resourceSummary}${skinVariantAliasSummary}${glbMaterialSummary}${materialRuntimePipelineSummaryText}${materialRenderStateAuditSummaryText}${stateSummary}${attachmentNativeSummary}${projectileBindingSummary}${projectileGapSummary}${projectileCreateBridgeSummary}${projectileTargetDispatchSummary}${projectileVtableSlotSummary}${projectileVtableFunctionSummary}${projectileVtableOutputLayoutSummary}${projectileVtableCallsitePayloadSummary}${projectileVtableSemanticJoinSummary}${projectileConsumerTraceSummary}${projectileCurrentTokenWindowSummary}${projectileCurrentBranchTargetSummary}${projectileCurrentFieldWriterCallsiteSummary}${projectileCurrentFieldReaderCandidateSummary}${projectileCurrentFieldReaderCallsiteContextSummary}${projectileCurrentFieldReaderDownstreamRouteSummary}${projectileCurrentFieldReaderListDispatchSummary}${projectileCurrentTokenChildObjectChainSummary}${projectileCurrentTokenChildCallbackBodySummary}${projectileCurrentTokenChildClassMethodSummary}${projectileCurrentTokenChildEvaluatorPayloadSummary}${projectileCurrentTokenChildPayloadSetterSummary}${projectileCurrentTokenChildPayloadSetterDownstreamSummary}${projectileCurrentTokenChildManagerRecordBridgeSummary}${projectileCurrentTokenChildEffectOwnerCandidateSummary}${projectileCurrentTokenChildStaticPfxOwnerSummary}${effectHookSummary}${particleRuntimeSummary}${particleCallbackTableSummary}${particleCallbackSemanticsSummary}${pfxEncryptedRuntimeTargetSummaryText}${pfxNativeCallbackRuntimeTargetSummaryText}${pfxNativeCallbackCaptureSummaryText}${effectNativeChannelCaptureTargetSummaryText}${effectNativeChannelCaptureSummaryText}${effectChannelStaticResourceAuditSummaryText}${nativeEffectTokenOnlyCallsiteAuditSummaryText}${nativeEffectHashMissingOwnerAuditSummaryText}${kindredHashPfxRuntimeGateAuditSummaryText}${kindredEffectComponentRuntimeChainAuditSummaryText}${kindredCurrentParticleBridgeAuditSummaryText}${nativeBuilderSummary}${nativeTransientPrimitiveSummary}${nativeTransientRecordSummary}${nativeTransientRecordCallsiteSummary}${nativeTransientRecordRuntimeSummary}${currentParticleDrawChainSummary}${currentParticleRegistrationChainSummary}${currentLayoutAOwnerGlobalUsageSummary}${currentLayoutARefreshStateSourceSummary}${currentLayoutAStateWriterSummary}${currentLayoutAStateRegistrationSummary}${currentLayoutAAddRecordFlagSourceSummary}${currentParticleMaskCandidateOwnerSummary}${currentType210PrimitiveBuilderSummary}${currentType210LevelVisualsBridgeSummary}${currentLayoutBTypeOwnerSummary}${currentLayoutBEntryOwnerSummary}${currentObjectAcWidthOverlapSummary}${currentObjectAcOwnerTraceSummary}${currentLayoutBCallbackBoundarySummary}${currentLayoutBIndirectSlotSummary}${currentLayoutBSlotRecordBridgeSummary}${currentLayoutBActiveRecordLifecycleSummary}${currentLayoutBTargetPayloadSummary}${currentLayoutBPfxTargetFactorySummary}${currentLayoutBTargetCacheSummary}${currentLayoutBManagerDrawBridgeSummary}${currentLayoutBParticleEntryDispatchSummary}${currentLayoutBOwnerBVtableDispatchSummary}${currentLayoutBPrimitiveModeDispatchSummary}${currentLayoutBMaterialDrawBridgeSummary}${currentLayoutBFinalPrimitiveConsumerSummary}${currentLayoutBShaderParameterBridgeSummary}${currentShaderDataType4ValueSourceSummary}${currentShaderDataType4EntrySemanticsSummary}${currentTexDataTextureObjectSummary}${currentShaderDataTextureSamplerTableSummary}${currentShaderDataExternalTextureBindingSummary}${currentTextureSamplerStateSemanticsSummary}${currentShaderDataInlineTexturePlaceholderSummary}${currentShadergraphSamplerTexDataJoinSummary}${currentMaterialSourceProgramCaptureTargetSummary}${currentMaterialSourceProgramCaptureSummary}${currentDefinitionShaderParamStaticStringSummary}${currentDefinitionShaderParamsPayloadStructureSummary}${currentMaterialSamplerOwnershipGateSummary}${currentRuntimeCaptureGateSummary}${currentDynamicSourceTableSemanticsSummary}${currentStaticMeshSelectorEntrySummary}${currentShaderParamsSchemaSummary}${currentStaticMeshShaderParamsCaptureTargetSummary}${currentStaticMeshShaderParamsCaptureSummary}${currentShaderParamsValueSemanticsSummary}${currentLayoutBObjectAcStoreCoverageSummary}${currentLayoutBObjectAcRuntimeCaptureTargetSummary}${currentLayoutBObjectAcRuntimeCaptureSummary}${currentLayoutBObjectAcCandidateDisqualificationSummary}${currentLayoutBPayloadRecordLayoutSummary}${currentLayoutBFlagProducerSummary}${currentLayoutBVisibilityGateSummary}${currentLayoutBTargetStatusSummary}${currentLayoutBRefreshModeSplitSummary}${currentLayoutBQueryApplyPathSummary}${currentLayoutBSharedStructApplySummary}${currentLayoutBCallerStructInitializerSummary}${currentLayoutBComponentTableEntrySummary}${currentLayoutBComponentTableOwnerSummary}${currentLayoutBComponentSlotRegistrationSummary}${currentLayoutBDirectCallerStructBuilderSummary}${currentLayoutBResourceCallerDynamicFieldsSummary}${currentLayoutBCommonApplySetterFieldsSummary}${currentLayoutBObjectAcProducerGateSummary}${currentPositionSamplerOwnerSummary}${currentLevelRuntimeOwnerSummary}${currentRuntimeKeySelectorCaptureTargetSummary}${runtimeKeySelectorCaptureSummaryText}${currentLightProbeChainSummary}${heroPreviewProfileSummary}${nativeBinarySummary}`;
}

function resourceCompletenessHealthSummary() {
  const summary = runtimeResourceCompletenessSummary;
  if (!summary) return "";
  const details = [];
  if (summary.skinCatalogRows) details.push(`${summary.skinCatalogRows} 个游戏内皮肤`);
  if (summary.missingSkinPreviewGlb) details.push(`${summary.missingSkinPreviewGlb} 个缺模型`);
  if (summary.missingSkinnedRuntimeGlb) details.push(`${summary.missingSkinnedRuntimeGlb} 个缺可动模型`);
  if (summary.textureIssueRows) details.push(`${summary.textureIssueRows} 个材质需复核`);
  if (summary.runtimeObjectRows) details.push(`${summary.runtimeObjectRows} 个运行时物件`);
  if (summary.rawUnresolvedRuntimeBindSlotRows && !summary.unresolvedRuntimeBindSlotRows) {
    details.push(`${summary.rawUnresolvedRuntimeBindSlotRows} 个非骨架挂点已由 runtime 表覆盖`);
  }
  if (summary.unresolvedRuntimeBindSlotRows) details.push(`${summary.unresolvedRuntimeBindSlotRows} 个绑定缺口`);
  if (summary.unclassifiedEffectShadergraphRows) details.push(`${summary.unclassifiedEffectShadergraphRows} 个特效材质待归类`);
  if (!details.length) return "";
  return ` 资源总表：${details.join("，")}。`;
}

function runtimeSkinVariantAliasHealthSummary() {
  const summary = runtimeSkinVariantAliasSummary;
  if (!summary?.rows) return "";
  return ` 皮肤变体：${summary.rows} 个共享模型变体，来自 ${summary.models || 0} 个基础 GLB。`;
}

function glbMaterialCoverageHealthSummary() {
  const summary = glbMaterialCoverageSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.materialRows) details.push(`${summary.materialRows} 个材质`);
  if (summary.baseColorTexturedRows) details.push(`${summary.baseColorTexturedRows} 个 baseColor 贴图`);
  if (summary.paleColorOnlyRows) details.push(`${summary.paleColorOnlyRows} 个疑似白膜`);
  if (summary.paleModelRows) details.push(`${summary.paleModelRows} 个模型需查白膜`);
  return ` GLB 材质：${details.join("，")}。`;
}

function materialRuntimePipelineHealthSummary() {
  const summary = materialRuntimePipelineSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.parsedShadergraphRows) details.push(`${summary.parsedShadergraphRows} 个 shadergraph`);
  if (summary.rowsWithGlbRoleGaps) details.push(`${summary.rowsWithGlbRoleGaps} 个 GLB 角色缺口`);
  if (summary.rowsWithRuntimeOnlyRoles) details.push(`${summary.rowsWithRuntimeOnlyRoles} 个 runtime shader 角色`);
  if (summary.executableRows) details.push(`${summary.executableRows} 个 runtime 已接管`);
  if (summary.byAlphaRuntimeStage?.["runtime-alpha-mask"]) details.push(`${summary.byAlphaRuntimeStage["runtime-alpha-mask"]} 个 alpha mask`);
  if (summary.byAlphaRuntimeStage?.["runtime-opaque-mask"]) details.push(`${summary.byAlphaRuntimeStage["runtime-opaque-mask"]} 个不透明 alpha`);
  if (summary.byUvAnimationExecutionMode?.runtime) details.push(`${summary.byUvAnimationExecutionMode.runtime} 个 UV 变换已接管`);
  if (summary.byUvAnimationExecutionMode?.diagnostic) details.push(`${summary.byUvAnimationExecutionMode.diagnostic} 个复杂 UV 待还原`);
  if (summary.rowsWithRuntimeSamplerRecords) details.push(`${summary.rowsWithRuntimeSamplerRecords} 个运行时 lookup sampler`);
  if (summary.diagnosticOnlyRows) details.push(`${summary.diagnosticOnlyRows} 个仅诊断`);
  if (summary.rowsWithShaderPassState) details.push(`${summary.rowsWithShaderPassState} 个 pass 签名`);
  if (summary.missingShadergraphRows) details.push(`${summary.missingShadergraphRows} 个缺 shadergraph`);
  if (!details.length) return "";
  return ` 材质管线：${details.join("，")}。`;
}

function materialRenderStateAuditHealthSummary() {
  const summary = materialRenderStateAuditSummary;
  if (!summary?.rowsWithPassState) return "";
  const blend = summary.byShaderPassBlendEnabled || {};
  const depthWrite = summary.byShaderPassDepthWrite || {};
  const details = [`${summary.rowsWithDecodedWord0 || 0}/${summary.rowsWithPassState} 个 word0 已解码`];
  if (blend.yes || blend.no) details.push(`blend yes:${blend.yes || 0}/no:${blend.no || 0}`);
  if (depthWrite.yes || depthWrite.no) details.push(`depthWrite yes:${depthWrite.yes || 0}/no:${depthWrite.no || 0}`);
  if (summary.rowsWithUnresolvedRenderOrderWords) {
    details.push(`${summary.rowsWithUnresolvedRenderOrderWords} 个 word2/队列排序状态未接管`);
  }
  if (summary.nativeWord0RenderStateEvidence?.status) details.push("word0 原生 GL/Metal 证据已接上");
  if (summary.nativeRuntimeMaterialCommandEvidence?.status) details.push("runtime 材质命令链已隔离");
  if (summary.currentNativeShaderDataResourceKeyEvidence?.status === "current-binary-resource-key-xrefs-recovered") {
    details.push("当前包 shaderData 锚点已恢复");
  }
  if (
    summary.currentNativeShaderProgramAndRenderStateEvidence?.status ===
    "current-binary-program-pass-state-chain-recovered"
  ) {
    details.push("当前包 shader pass/render-state 链已定位");
  }
  if (
    summary.currentNativeShaderProgramAndRenderStateEvidence?.shaderDataPassStateEvidence?.status ===
    "current-binary-pass-state-qword-chain-recovered"
  ) {
    details.push("pass 状态 qword 来源已定位");
  }
  if (
    summary.currentNativeShaderProgramAndRenderStateEvidence?.shaderDataPassHeaderCountEvidence?.status ===
    "current-binary-pass-word3-count-chain-recovered"
  ) {
    details.push("word3 计数字段已定位");
  }
  if (
    summary.currentNativeShaderProgramAndRenderStateEvidence?.shaderDataPassParameterTableEvidence?.status ===
    "current-binary-pass-parameter-table-chain-recovered"
  ) {
    details.push("pass 参数表链已定位");
  }
  if (
    summary.currentNativeShaderProgramAndRenderStateEvidence?.parameterUploaderEvidence?.status ===
    "current-binary-parameter-uploader-recovered"
  ) {
    details.push("参数上传器已定位");
  }
  if (summary.crossBuildShaderDataPassObjectEvidence?.status) details.push("旧版 shader pass 线索已隔离");
  if (summary.rendererTakeoverFromThisAudit === false) details.push("本审计未接管渲染");
  return ` 渲染状态审计：${details.join("，")}。`;
}

function runtimeStateConditionHealthSummary() {
  const summary = runtimeStateConditionSummary;
  if (!summary?.rows) return "";
  const source = summary.bySourceKind || {};
  const details = [];
  if (source["visibility-event"]) details.push(`${source["visibility-event"]} 条显隐`);
  if (source["visibility-state-write"]) details.push(`${source["visibility-state-write"]} 条显隐状态`);
  if (source["visibility-callback"]) details.push(`${source["visibility-callback"]} 条显隐回调`);
  if (source["attachment-state-write"]) details.push(`${source["attachment-state-write"]} 条附件状态`);
  if (source["attachment-callback"]) details.push(`${source["attachment-callback"]} 条附件回调`);
  if (source["attachment-helper-ability-slot"]) details.push(`${source["attachment-helper-ability-slot"]} 条技能变量`);
  if (source["projectile-callback"]) details.push(`${source["projectile-callback"]} 条弹道回调`);
  return ` 状态条件：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function runtimeAttachmentNativeChainHealthSummary() {
  const summary = runtimeAttachmentNativeChainSummary;
  if (!summary?.rows) return "";
  const source = summary.bySourceKind || {};
  const details = [];
  if (source["attachment-frame-update"]) details.push(`${source["attachment-frame-update"]} 条更新`);
  if (source["attachment-extra-transform"]) details.push(`${source["attachment-extra-transform"]} 条额外变换`);
  if (source["attachment-animation-apply"]) details.push(`${source["attachment-animation-apply"]} 条应用`);
  if (source["attachment-animation-runtime"]) details.push(`${source["attachment-animation-runtime"]} 条动画`);
  if (source["attachment-helper-call"]) details.push(`${source["attachment-helper-call"]} 条 Helper 调用`);
  if (source["attachment-helper-semantics"]) details.push(`${source["attachment-helper-semantics"]} 条 Helper 语义`);
  if (source["attachment-runtime-data-component"]) details.push(`${source["attachment-runtime-data-component"]} 条技能数据`);
  if (source["attachable-runtime"]) details.push(`${source["attachable-runtime"]} 条装备刷新`);
  return ` 附件 Runtime：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function nativeBinaryVersionAuditHealthSummary() {
  const summary = nativeBinaryVersionAuditSummary;
  if (!summary?.entries) return "";
  const details = [];
  if (summary.exactBuilds) details.push(`${summary.exactBuilds} 个精确构建`);
  if (summary.crossBuildReferences) details.push(`${summary.crossBuildReferences} 个跨构建参考`);
  if (summary.missingEvidence) details.push(`${summary.missingEvidence} 个缺版本证据`);
  return ` Native 版本：${details.join("，")}。`;
}

function nativeEffectBuilderMethodSemanticsHealthSummary() {
  const summary = nativeEffectBuilderMethodSemanticsSummary;
  if (!summary?.rows) return "";
  const layer = summary.byLayer || {};
  const details = [];
  if (layer["outer-builder"]) details.push(`${layer["outer-builder"]} 条外层 builder`);
  if (layer["inner-effect-binding"]) details.push(`${layer["inner-effect-binding"]} 条内部绑定`);
  return ` Builder 字段：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function nativeTransientEffectPrimitiveChainHealthSummary() {
  const summary = nativeTransientEffectPrimitiveChainSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.crossPlatformMatchedRows) details.push(`${summary.crossPlatformMatchedRows} 条 iOS/Android 对齐`);
  if (summary.postFactoryRows) details.push(`${summary.postFactoryRows} 条追到后续 factory`);
  const blockedRows = summary.rows - (summary.renderTakeoverAllowedRows || 0);
  if (blockedRows > 0) details.push(`${blockedRows} 条阻断渲染接管`);
  return ` 原生临时图元：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function nativeTransientRenderRecordSchemaHealthSummary() {
  const summary = nativeTransientRenderRecordSchemaSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.helperSchemaRows) details.push(`${summary.helperSchemaRows} 条 helper 字段`);
  if (summary.androidHelperExpandedRows) details.push(`${summary.androidHelperExpandedRows} 条 Android 展开`);
  if (summary.iosDirectWriteRows) details.push(`${summary.iosDirectWriteRows} 条 iOS 直写`);
  if (summary.crossPlatformMatchedRows) details.push(`${summary.crossPlatformMatchedRows} 条字段对齐`);
  const blockedRows = summary.rows - (summary.renderTakeoverAllowedRows || 0);
  if (blockedRows > 0) details.push(`${blockedRows} 条阻断渲染接管`);
  return ` 临时图元记录：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function nativeTransientRenderRecordCallsiteScanHealthSummary() {
  const summary = nativeTransientRenderRecordCallsiteScanSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.androidRows) details.push(`Android ${summary.androidRows}`);
  if (summary.iosRows) details.push(`iOS ${summary.iosRows}`);
  if (summary.androidHelper5460Rows) details.push(`${summary.androidHelper5460Rows} 条 size helper`);
  if (summary.androidHelper5504Rows) details.push(`${summary.androidHelper5504Rows} 条 callback helper`);
  if (summary.iosDirectWriteRows) details.push(`${summary.iosDirectWriteRows} 条 iOS 字段直写`);
  if (summary.nonEmptyEffectTokenRows) details.push(`${summary.nonEmptyEffectTokenRows} 条带近邻 token`);
  const blockedRows = summary.rows - (summary.renderTakeoverAllowedRows || 0);
  if (blockedRows > 0) details.push(`${blockedRows} 条阻断渲染接管`);
  return ` 临时记录扫描：${summary.rows} 个调用点${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function nativeTransientRecordRuntimeExecutorHealthSummary() {
  const summary = nativeTransientRecordRuntimeExecutorSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.androidRows) details.push(`Android ${summary.androidRows}`);
  if (summary.iosRows) details.push(`iOS ${summary.iosRows}`);
  if (summary.crossPlatformAlignedStages) details.push(`${summary.crossPlatformAlignedStages} 个阶段双端对齐`);
  if (summary.targetQueryRows) details.push(`${summary.targetQueryRows} 条目标查询`);
  if (summary.targetApplyRows) details.push(`${summary.targetApplyRows} 条结果应用`);
  if (summary.currentAndroidPointerProbeCodePointers) {
    details.push(`${summary.currentAndroidPointerProbeCodePointers} 个当前包 code 指针探测`);
  }
  if (summary.crossBuildReferences) details.push(`${summary.crossBuildReferences} 个跨构建引用`);
  const blockedRows = summary.rows - (summary.renderTakeoverAllowedRows || 0);
  if (blockedRows > 0) details.push(`${blockedRows} 条阻断视觉接管`);
  return ` 临时记录执行器：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeParticleDrawChainHealthSummary() {
  const summary = currentNativeParticleDrawChainSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.particleDrawBatchRecovered) details.push("draw batch 已定位");
  if (summary.entryArrayBuilderRecovered) details.push("entry array 已定位");
  if (summary.sharedManagerEntryMaterializationRecovered) details.push("manager entry 已定位");
  if (summary.backingFilterRecovered) details.push("flags 过滤已定位");
  if (summary.backingRecordFlagStorageRecovered) details.push("record flags 已定位");
  if (summary.compositeTaskRecovered) details.push("composite task 已定位");
  if (summary.renderQueueAppendRecovered) details.push("队列提交已定位");
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  const blockedRows = summary.rows - (summary.renderTakeoverAllowedRows || 0);
  if (blockedRows > 0) details.push(`${blockedRows} 条阻断视觉接管`);
  return ` 粒子绘制链：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeParticleRegistrationChainHealthSummary() {
  const summary = currentNativeParticleRegistrationChainSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.directAddRecordCallers) details.push(`${summary.directAddRecordCallers} 个 add-record 调用点`);
  if (summary.layoutARegistrationRecovered) details.push("layout A 注册已定位");
  if (summary.layoutATypeRecordRecovered) details.push("layout A 类型 0xb8 已定位");
  if (summary.layoutAExplicitFlagRefreshRecovered) details.push("layout A 显式刷新已定位");
  if (summary.layoutAExplicitRefreshOnlyNonParticleFlags) {
    details.push("显式刷新非粒子 flags 0x5/0x1");
  }
  if (summary.layoutACachedFlagRefreshRecovered) {
    details.push(`layout A 缓存刷新 ${summary.layoutACachedRefreshDirectCallers || 0} 个调用点`);
  }
  if (summary.layoutAZeroFlagRefreshRecovered) {
    details.push(`layout A 清零刷新 ${summary.layoutAZeroRefreshDirectCallers || 0} 个调用点`);
  }
  if (summary.layoutARefreshCallsiteRows) {
    details.push(
      `layout A 调用点分类 ${summary.layoutARefreshKeepCallsiteRows || 0}/${summary.layoutARefreshClearCallsiteRows || 0}`,
    );
  }
  if (summary.layoutARefreshTypeGlobalsRecovered) {
    details.push(`layout A 类型全局 ${summary.layoutARefreshTypeGlobalRows || 0} 个`);
  }
  if (summary.layoutBRegistrationRecovered) details.push("layout B 注册已定位");
  if (summary.layoutBFlagReadRecovered) details.push("+0xac flags 读取已定位");
  if (summary.objectFlagAcAccessRows) {
    details.push(`${summary.objectFlagAcAccessRows} 条 +0xac 访问`);
  }
  if (summary.candidateParticleMaskDefinitionRows) details.push(`${summary.candidateParticleMaskDefinitionRows} 条 0x200 候选定义`);
  if (summary.layoutBTypeRecordRecovered) details.push("layout B 类型 0x118 已定位");
  if (summary.layoutBConstructorFlagSeedRecovered) details.push("layout B 初始 +0xac=2");
  if (summary.typeRecordLiteralRejectedAsDirectProducer) details.push("0x210 直写已排除");
  if (summary.dynamicObjectFlagAcPackedVisibilityRecovered) {
    details.push(`${summary.dynamicObjectFlagAcMaskProducerRows || 0} 条动态 packed flags`);
  }
  if (summary.dynamicObjectFlagAcCandidateNotTiedToLayoutB) {
    details.push(`${summary.dynamicObjectFlagAcPackedVisibilityCandidateRows || 0} 条动态候选未并链`);
  }
  if (summary.managerFlagRefreshRecovered) details.push("manager flags 刷新已定位");
  details.push(`${summary.directObjectFlagAcParticleMaskStoreContextRows || 0} 条直接 +0xac producer`);
  if (summary.exactLayoutBParticleFlagProducerRows) {
    details.push(`${summary.exactLayoutBParticleFlagProducerRows} 条动态 producer`);
  } else {
    details.push("0 条精确 producer");
  }
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  const blockedRows = summary.rows - (summary.renderTakeoverAllowedRows || 0);
  if (blockedRows > 0) details.push(`${blockedRows} 条阻断视觉接管`);
  return ` 粒子注册链：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeParticleMaskCandidateOwnerHealthSummary() {
  const summary = currentNativeParticleMaskCandidateOwnerSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.type210RegistrationRecovered) details.push("type 0x210 已定位");
  if (summary.type210GlobalIndexRecovered) details.push("全局 0x3035098 已定位");
  if (summary.ownerList58Recovered) details.push("owner+0x58 列表已定位");
  if (summary.ownerResolveType210Recovered) details.push("owner 创建 0x210 已定位");
  if (summary.bit2OnlyUpdateRecovered) details.push("bit2 更新已排除");
  if (summary.packedCoverageRecovered) {
    details.push(`${summary.packedCoverageCanSetParticleMaskRows || 0} 条 packed coverage 可含 0x200`);
  }
  if (summary.type210CallbackPointerRows || summary.coverageCallbackPointerRows) {
    details.push(`${summary.type210CallbackPointerRows || summary.coverageCallbackPointerRows} 个 0x210 callback 槽`);
  }
  if (summary.type210GlobalOnlyOwnerReadRecovered) details.push("0x3035098 唯一读取点已定位");
  if (summary.renderCallbackRecovered) details.push("本地 render callback 已定位");
  if (summary.renderCallbackCallsPrimitiveBuilderRecovered) details.push("只接本地图元 builder");
  details.push(`${summary.type210FamilyDirectRenderBoundaryCallRows || 0} 条直达粒子 draw/manager`);
  details.push(`${summary.tiedToLayoutBRows || 0} 条并入 layout B`);
  details.push(`${summary.exactLayoutBParticleFlagProducerRows || 0} 条 layout B 精确 producer`);
  if (summary.opcodeMismatchRows || summary.pointerMismatchRows) {
    details.push(`${(summary.opcodeMismatchRows || 0) + (summary.pointerMismatchRows || 0)} 条证据不匹配`);
  }
  const blockedRows = summary.rows - (summary.renderPromotionAllowedRows || 0);
  if (blockedRows > 0) details.push(`${blockedRows} 条阻断视觉接管`);
  return ` 0x210 候选 owner：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLayoutAOwnerGlobalUsageHealthSummary() {
  const summary = currentNativeLayoutAOwnerGlobalUsageSummary;
  if (!summary?.textReferenceRows) return "";
  const details = [];
  details.push(`${summary.globals || 0} 个 type global`);
  details.push(`${summary.createHelperReadRows || 0} 条 create/resolve 读取`);
  details.push(`${summary.ownerListScanReadRows || 0} 条 owner 链表比对`);
  if (summary.unmodeledReadRows) details.push(`${summary.unmodeledReadRows} 条旧表漏点已补`);
  if (summary.unclassifiedReadRows) details.push(`${summary.unclassifiedReadRows} 条未分类`);
  details.push(`${summary.renderPromotionAllowedRows || 0} 条允许接管`);
  return ` layout A owner 全局：${summary.textReferenceRows} 条读取（${details.join(" / ")}）。`;
}

function currentNativeLayoutARefreshStateSourceHealthSummary() {
  const summary = currentNativeLayoutARefreshStateSourceSummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  details.push(`${summary.inputByteRefreshCallerRows || 0} 个 input-byte 调用者`);
  details.push(`${summary.inputByteRefreshPlus2fcCallerRows || 0} 个 +0x2fc 状态来源`);
  details.push(`${summary.statePredicateGroups || 0} 组 keep/clear 谓词`);
  details.push(`${summary.trackedKeepCalls || 0} 条 keep`);
  details.push(`${summary.trackedClearCalls || 0} 条 clear`);
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条证据不匹配`);
  details.push(`${summary.renderPromotionAllowedRows || 0} 条允许接管`);
  return ` layout A 状态来源：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeLayoutAStateWriterHealthSummary() {
  const summary = currentNativeLayoutAStateWriterSummary;
  if (!summary?.offset2fcAccessRows) return "";
  const details = [];
  details.push(`+0x2fc ${summary.offset2fcAccessRows || 0} 条访问`);
  details.push(`${summary.offset2fcStoreRows || 0} 条写入`);
  details.push(`${summary.offset2fcKnownWriterRows || 0} 条已定位 writer`);
  details.push(`${summary.offset2fcDispatchCallerRows || 0} 个状态机入口调用者`);
  details.push(`+0x58/${summary.objectByte58TrackedWriteRows || 0} 条`);
  details.push(`+0x59/${summary.objectByte59TrackedWriteRows || 0} 条`);
  details.push(`${summary.objectByteUpdateCallerRows || 0} 个对象字节 update 调用者`);
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条证据不匹配`);
  details.push(`${summary.renderPromotionAllowedRows || 0} 条允许接管`);
  return ` layout A 状态写入：${details.join(" / ")}。`;
}

function currentNativeLayoutAStateRegistrationHealthSummary() {
  const summary = currentNativeLayoutAStateRegistrationSummary;
  if (!summary?.callbackReferenceRows) return "";
  const details = [];
  details.push(`${summary.moduleRegistrationCallerRows || 0} 个模块入口`);
  details.push(`${summary.slotInstallerBranchRows || 0} 条 slot installer`);
  details.push(`${summary.callbackReferenceRows || 0} 个回调指针`);
  details.push(`${summary.stateMachineCallbackReferenceRows || 0} 个进入 +0x2fc`);
  details.push(`${summary.offset2fcDispatchCallRows || 0} 条状态机调用`);
  if (summary.typeGlobalReadRows) details.push(`${summary.typeGlobalReadRows} 个 type global 读取`);
  if (summary.typeGlobalCreateResolveReadRows) details.push(`${summary.typeGlobalCreateResolveReadRows} 个 create/resolve`);
  if (summary.typeGlobalStateCallbackNeighborhoodReadRows) {
    details.push(`${summary.typeGlobalStateCallbackNeighborhoodReadRows} 个 callback 邻域读取`);
  }
  if (summary.typedQueryEvidenceRows) details.push(`typed query ${summary.typedQueryEvidenceRows} 条证据`);
  if (summary.typedQueryStateByteWriteRows) details.push(`${summary.typedQueryStateByteWriteRows} 条状态字节写入`);
  details.push(`${summary.stateFamilyDirectRenderBoundaryCallRows || 0} 条渲染边界直连`);
  if (summary.callbackReferenceMismatchRows) details.push(`${summary.callbackReferenceMismatchRows} 条回调证据不匹配`);
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  details.push(`${summary.renderPromotionAllowedRows || 0} 条允许接管`);
  return ` layout A 状态注册：${details.join(" / ")}。`;
}

function currentNativeLayoutAAddRecordFlagSourceHealthSummary() {
  const summary = currentNativeLayoutAAddRecordFlagSourceSummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  if (summary.callbackToSetupRecovered) details.push("callback→setup 已闭合");
  if (summary.registeredSetupDefaultFlagsOneRecovered) details.push("默认 flags=1");
  if (summary.layoutAAddRecordForwardFlagsRecovered) details.push("add-record 转发已闭合");
  details.push(`0x200 来源 ${summary.registeredFlagParticleMaskRows || 0} 条`);
  details.push(`未知 d7fa14 入口 ${summary.externalUnknownD7FA14CallerRows || 0} 条`);
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  details.push(`${summary.renderPromotionAllowedRows || 0} 条允许接管`);
  return ` layout A add-record flags：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeType210PrimitiveBuilderHealthSummary() {
  const summary = currentNativeType210PrimitiveBuilderSummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  if (summary.renderCallbackToPrimitiveBuilderRecovered) details.push("callback→builder 已闭合");
  details.push(`${summary.requiredPrimitiveSlots || 0} 个 0x${(summary.slotStrideBytes || 0).toString(16)} 槽`);
  details.push(`指针推进 ${summary.pointerAdvanceRows || 0} 条`);
  details.push(`颜色字节 ${summary.colorByteStoreRows || 0} 条`);
  details.push(`完整颜色记录 ${summary.fullColorRecordRows || 0} 条`);
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  details.push(`${summary.renderPromotionAllowedRows || 0} 条允许接管`);
  return ` 0x210 primitive builder：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeType210LevelVisualsBridgeHealthSummary() {
  const summary = currentNativeType210LevelVisualsBridgeSummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  if (summary.levelVisualsStaticLensFlareListRecovered) details.push("静态 lens flare 列表已闭合");
  if (summary.levelVisualsUsesType210GlobalRecovered) details.push("0x3035098 type 已闭合");
  details.push(`resource-key ${summary.staticLensFlareResourceKeyResolveRows || 0} 条`);
  details.push(`helper ${summary.staticLensFlareHelperRows || 0} 条`);
  if (summary.type210PrimitiveBuilderRecovered) details.push("primitive builder 已闭合");
  details.push(`英雄 PFX 权限 ${summary.heroPfxRenderPermissionRows || 0} 条`);
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  details.push(`${summary.renderPromotionAllowedRows || 0} 条允许接管`);
  return ` 0x210 LevelVisuals bridge：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeLayoutBFlagProducerHealthSummary() {
  const summary = currentNativeLayoutBFlagProducerSummary;
  if (!summary?.itemRows) return "";
  const details = [];
  if (summary.layoutBKnownReadRows) details.push(`layout B 读点 ${summary.layoutBKnownReadRows} 个`);
  if (summary.layoutBConstructorSeedRows) details.push("初始 +0xac=2");
  if (summary.storeRows) details.push(`${summary.storeRows} 条写入`);
  if (summary.stackFrameFalsePositiveRows) details.push(`${summary.stackFrameFalsePositiveRows} 条栈误报已排除`);
  if (summary.nonParticleFlagMutationRows) details.push(`${summary.nonParticleFlagMutationRows} 条非 0x200 控制位`);
  if (summary.particleMaskCandidateNotLayoutBRows) {
    details.push(`${summary.particleMaskCandidateNotLayoutBRows} 条 0x200 候选未并链`);
  }
  if (summary.fullFieldReplacementEffectResourceScalarRows) {
    details.push(`${summary.fullFieldReplacementEffectResourceScalarRows} 条 Effect 标量字段已排除`);
  } else if (summary.fullFieldReplacementEffectResourceRows) {
    details.push(`${summary.fullFieldReplacementEffectResourceRows} 条 Effect 资源待追`);
  }
  if (summary.activeChildSelectorStateNotLayoutBRows) {
    details.push(`${summary.activeChildSelectorStateNotLayoutBRows} 条选择器状态字段已排除`);
  }
  if (summary.layoutBFamilyFlagOverlapWriteRows) {
    details.push(`layout B 宽度覆盖 ${summary.layoutBFamilyFlagOverlapWriteRows} 条`);
  }
  details.push(`${summary.layoutBFamilyFlagOverlapNonConstructorRows || 0} 条非构造宽度覆盖`);
  details.push(`${summary.layoutBFamilyWideParticleMaskProducerRows || 0} 条宽度写入 producer`);
  if (summary.zeroResetNonProducerRows) details.push(`${summary.zeroResetNonProducerRows} 条清零非 producer`);
  details.push(`${summary.exactLayoutBParticleFlagProducerRows || 0} 条精确 producer`);
  if (summary.renderPromotionAllowedRows === 0) details.push("接管关闭");
  return ` layout B flag producer：${summary.itemRows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLayoutBTypeOwnerHealthSummary() {
  const summary = currentNativeLayoutBTypeOwnerSummary;
  if (!summary?.typeIndexReadRows) return "";
  const details = [];
  details.push(`${summary.typeIndexReadRows || 0} 个 type index 读点`);
  details.push(`${summary.createResolveReadRows || 0} 个 create/resolve`);
  details.push(`${summary.queryAllocateReadRows || 0} 个 query/allocate`);
  details.push(`${summary.stackQueryReadRows || 0} 个 stack query`);
  details.push(`${summary.layoutBFamilyCallReadRows || 0} 个进入 layout B 函数族`);
  if (summary.unclassifiedReadRows) details.push(`${summary.unclassifiedReadRows} 个未分类`);
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  details.push(`${summary.renderPromotionAllowedRows || 0} 条允许接管`);
  return ` layout B type owner：${details.join(" / ")}。`;
}

function currentNativeLayoutBEntryOwnerHealthSummary() {
  const summary = currentNativeLayoutBEntryOwnerSummary;
  if (!summary?.entryInitializerRows) return "";
  const details = [];
  details.push(`${summary.entryInitializerRows || 0} 条 entry 初始化`);
  details.push(`${summary.registerRows || 0} 条 manager 注册`);
  details.push(`${summary.globalOwnerSlotReadRows || 0} 条 owner slot 读取`);
  details.push(`${summary.globalOwnerSlotStoreRows || 0} 条 owner slot 写入`);
  details.push(`${summary.entryOwnerFromGlobalSlotRows || 0} 条 entry owner 来自全局槽`);
  details.push(`${summary.lifecycleCallbackRows || 0} 条 lifecycle callback`);
  details.push(`${summary.constructorObjectAcSeedRows || 0} 条 constructor seed`);
  details.push(`${summary.constructorParticleMaskRows || 0} 条 constructor 0x200`);
  details.push(`${summary.destructorCleanupRows || 0} 条析构清理`);
  details.push(`${summary.pfxEmitterOwnerRows || 0} 条 PFX/emitter owner`);
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  details.push(`${summary.renderPromotionAllowedRows || 0} 条允许接管`);
  return ` layout B entry owner：${details.join(" / ")}。`;
}

function currentNativeObjectAcWidthOverlapHealthSummary() {
  const summary = currentNativeObjectAcWidthOverlapSummary;
  if (!summary?.totalOverlapStoreRows) return "";
  const details = [
    `${summary.exactStrWAcRows || 0} 条精确 str-w`,
    `${summary.nonExactOverlapRows || 0} 条宽度覆盖`,
    `layout B ${summary.layoutBFamilyOverlapRows || 0} 条`,
    `${summary.layoutBFamilyNonConstructorRows || 0} 条 layout B 非构造`,
    `${summary.outOfFamilyWideNeedsOwnerRows || 0} 条外部需 owner`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` object +0xac 宽度扫描：${summary.totalOverlapStoreRows} 条（${details.join(" / ")}）。`;
}

function currentNativeObjectAcOwnerTraceHealthSummary() {
  const summary = currentNativeObjectAcOwnerTraceSummary;
  if (!summary?.candidateRows) return "";
  const details = [
    `${summary.rowsWithAnyDirectCallers || 0} 条有直接调用入口`,
    `${summary.rowsWithLayoutBDirectCallers || 0} 条 layout B 直接调用`,
    `${summary.renderOwnerHelperRows || 0} 条 render-owner helper`,
    `${summary.renderOwnerHelperNearLayoutBRegistrationCallers || 0} 个邻近注册调用者`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` object +0xac owner trace：${summary.candidateRows} 条外部候选（${details.join(" / ")}）。`;
}

function currentNativeLayoutBCallbackBoundaryHealthSummary() {
  const summary = currentNativeLayoutBCallbackBoundarySummary;
  if (!summary?.branchRows) return "";
  const details = [
    `${summary.slotCallbackBranchRows || 0} 条 slot 出口`,
    `${summary.registerBodyBranchRows || 0} 条注册体出口`,
    `${summary.refreshGateBranchRows || 0} 条刷新 gate 出口`,
    `${summary.candidateTargetHitRows || 0} 条命中外部候选`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` layout B callback boundary：${summary.branchRows} 条直接出口（${details.join(" / ")}）。`;
}

function currentNativeLayoutBIndirectSlotHealthSummary() {
  const summary = currentNativeLayoutBIndirectSlotSummary;
  if (!summary?.registrationRows) return "";
  const details = [
    `${summary.primarySlotInstallRows || 0} 条主槽`,
    `${summary.tailSlotInstallRows || 0} 条尾槽`,
    `${summary.sharedSlotMechanicRows || 0} 条共享调度证据`,
    `${summary.frameDispatchRows || 0} 条帧调度`,
    `${summary.layoutBRelevantFrameDispatchRows || 0} 条 layout B slot4`,
    `${summary.callbackArgumentRows || 0} 条 callback 参数`,
    summary.callbackArgumentShapeRecovered ? "callback 参数形态已恢复" : "callback 参数形态未恢复",
    `${summary.staticCallbackPointerRows || 0} 条静态指针`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B indirect slot：${summary.registrationRows} 条槽注册（${details.join(" / ")}）。`;
}

function currentNativeLayoutBSlotRecordBridgeHealthSummary() {
  const summary = currentNativeLayoutBSlotRecordBridgeSummary;
  if (!summary?.managerGlobalRows) return "";
  const details = [
    `${summary.frameSlot4Rows || 0} 条 slot4 帧调度`,
    `${summary.dispatcherObjectRows || 0} 条对象指针证据`,
    `${summary.activeRecordLayoutRows || 0} 条 active-record layout`,
    summary.activeRecordRangeFormulaRecovered ? "active range 公式已闭合" : "active range 公式未闭合",
    `${summary.layoutBRegisterBridgeRows || 0} 条注册 bridge`,
    summary.slot4ToSceneRecordBridgeRecovered ? "slot4 到 scene record 已闭合" : "slot4 到 scene record 未闭合",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B slot-record bridge：${summary.managerGlobalRows} 个 manager 全局（${details.join(" / ")}）。`;
}

function currentNativeLayoutBActiveRecordLifecycleHealthSummary() {
  const summary = currentNativeLayoutBActiveRecordLifecycleSummary;
  if (!summary?.managerInitializerRows) return "";
  const details = [
    `${summary.recordInitializerRows || 0} 条 record 初始化`,
    `${summary.layoutBRecordRegistrationRows || 0} 条 layout B record 注册`,
    `${summary.arenaAllocationRows || 0} 条 arena 分配`,
    `${summary.objectAcquireRows || 0} 条对象借出`,
    `${summary.objectReleaseRows || 0} 条对象释放`,
    `${summary.frameDispatchRows || 0} 条帧调度`,
    `record stride ${summary.managerRecordStrideBytes || 0}`,
    `object stride ${summary.layoutBObjectStrideBytes || 0}`,
    summary.activeRecordLifecycleRecovered ? "生命周期已闭合" : "生命周期未闭合",
    summary.activeObjectAcquireReleaseRecovered ? "借出/释放已闭合" : "借出/释放未闭合",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B active-record lifecycle：${summary.managerInitializerRows} 条 manager 初始化（${details.join(" / ")}）。`;
}

function currentNativeLayoutBTargetPayloadHealthSummary() {
  const summary = currentNativeLayoutBTargetPayloadSummary;
  if (!summary?.layoutBParameterUpdateRows) return "";
  const details = [
    `${summary.dynamicParameterUpdateRows || 0} 条动态参数`,
    `${summary.parameterWriterMechanicRows || 0} 条 writer 证据`,
    `${summary.payloadBridgeRows || 0} 条 payload bridge`,
    `${summary.targetObjectLoadRows || 0} 条 target load`,
    summary.payloadBuilderReturnsTargetPlus40 ? "target+0x40 已闭合" : "target+0x40 未闭合",
    `${summary.pfxEmitterOwnerRows || 0} 条 PFX/emitter owner`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B target payload：${summary.layoutBParameterUpdateRows} 条参数更新（${details.join(" / ")}）。`;
}

function currentNativeLayoutBPfxTargetFactoryHealthSummary() {
  const summary = currentNativeLayoutBPfxTargetFactorySummary;
  if (!summary?.parameterNameRows) return "";
  const details = [
    `${summary.factoryRouteRows || 0} 条 factory route`,
    `${summary.targetFactoryRows || 0} 条 factory 证据`,
    `${summary.ownerSlotRows || 0} 条 owner slot`,
    `${summary.targetStatusRows || 0} 条 target 状态`,
    `${summary.object50StoreRows || 0} 条 object+0x50 写入`,
    `${summary.kindredEffectsStringRows || 0} 条 KindredEffects`,
    summary.pfxTargetFactoryRecovered ? "target factory 已闭合" : "target factory 未闭合",
    `${summary.pfxEmitterDrawRows || 0} 条 emitter draw`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B PFX target factory：${summary.parameterNameRows} 条参数名（${details.join(" / ")}）。`;
}

function currentNativeLayoutBTargetCacheHealthSummary() {
  const summary = currentNativeLayoutBTargetCacheSummary;
  if (!summary?.targetCacheRows) return "";
  const details = [
    `${summary.targetAcquireRows || 0} 条 acquire/bind`,
    `${summary.resourceSchemaRows || 0} 条 schema 展开`,
    `${summary.childRecordRows || 0} 条 child record`,
    `${summary.targetRefreshRows || 0} 条 refresh`,
    `${summary.submitFanoutRows || 0} 条 fanout`,
    summary.targetCacheRecovered ? "target cache 已闭合" : "target cache 未闭合",
    summary.resourceSchemaExpansionRecovered ? "schema record 已闭合" : "schema record 未闭合",
    `${summary.pfxEmitterDrawRows || 0} 条 emitter draw`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B target cache：${summary.targetCacheRows} 条 cache 证据（${details.join(" / ")}）。`;
}

function currentNativeLayoutBTargetPayloadNodeChainHealthSummary() {
  const summary = currentNativeLayoutBTargetPayloadNodeChainSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.primaryRecordAllocatorRows || 0} 条 primary allocator`,
    `${summary.payloadNodeInitRows || 0} 条 node init`,
    `${summary.schemaPayloadWriteRows || 0} 条 schema 写入`,
    `${summary.targetListRows || 0} 条 target list`,
    `${summary.targetTraversalRows || 0} 条 traversal`,
    `${summary.finalConsumerRows || 0} 条 final consumer`,
    `${summary.payloadActiveCountRuntimeRows || 0} 条 active count runtime`,
    summary.primaryRecordAllocationRecovered ? "primary record 已闭合" : "primary record 未闭合",
    summary.payloadNodeInitializationRecovered ? "node init 已闭合" : "node init 未闭合",
    summary.schemaModeFlagsWriteRecovered ? "+0x220 schema bits 已闭合" : "+0x220 schema bits 未闭合",
    summary.schemaSourceObjectWriteRecovered ? "+0x208 source 已闭合" : "+0x208 source 未闭合",
    summary.targetLinkedListRecovered ? "target+0x68 链表已闭合" : "target+0x68 链表未闭合",
    summary.finalConsumerFieldMatchRecovered ? "final 字段消费已闭合" : "final 字段消费未闭合",
    summary.targetPayloadNodeChainRecovered ? "payload node 链已闭合" : "payload node 链未闭合",
    summary.payloadActiveCountFilterRecovered ? "active count filter 已闭合" : "active count filter 未闭合",
    summary.payloadActiveCountAppendProducerRecovered
      ? "active count append 已闭合"
      : "active count append 未闭合",
    summary.payloadActiveCountFlushRecovered ? "active count flush 已闭合" : "active count flush 未闭合",
    summary.payloadActiveCountRuntimeProducerRecovered
      ? "+0x200 active count producer 已恢复"
      : "+0x200 active count producer 未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B target payload node：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeLayoutBPayloadSourceProgramBridgeHealthSummary() {
  const summary = currentNativeLayoutBPayloadSourceProgramBridgeSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.schemaSourceObjectRows || 0} 条 schema source`,
    `${summary.sourceObjectFactoryRows || 0} 条 source object`,
    `${summary.drawSourceProgramRows || 0} 条 draw source`,
    `${summary.parameterApplyRows || 0} 条 parameter apply`,
    summary.schemaSourceObjectConstructionRecovered ? "node +0x208 source 已闭合" : "node +0x208 source 未闭合",
    summary.sourceObjectLookupAndFallbackRecovered ? "source lookup/fallback 已闭合" : "source lookup/fallback 未闭合",
    summary.drawSourceProgramSelectionRecovered ? "draw source 选择已闭合" : "draw source 选择未闭合",
    summary.sourceParameterApplyFormulaRecovered ? "parameter apply 公式已闭合" : "parameter apply 公式未闭合",
    summary.payloadSourceProgramBridgeRecovered ? "payload source/program 已闭合" : "payload source/program 未闭合",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B payload source/program：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeLayoutBManagerDrawBridgeHealthSummary() {
  const summary = currentNativeLayoutBManagerDrawBridgeSummary;
  if (!summary?.layoutBRegisterFlagRows) return "";
  const details = [
    `${summary.managerAddRecordRows || 0} 条 manager add`,
    `${summary.backingFlagFilterRows || 0} 条 backing/filter`,
    `${summary.refreshPayloadRows || 0} 条 target refresh`,
    `${summary.backingPayloadApplyRows || 0} 条 payload apply`,
    `${summary.backingFlagRefreshRows || 0} 条 flag refresh`,
    `${summary.particleDrawFilterRows || 0} 条 draw filter`,
    summary.objectAcToBackingFlagBridgeRecovered ? "object+0xac 到 backing flags 已闭合" : "object+0xac 到 backing flags 未闭合",
    summary.targetPayloadRefreshBridgeRecovered ? "target+0x40 refresh 已闭合" : "target+0x40 refresh 未闭合",
    summary.targetPayloadApplyRecovered ? "x2 payload apply 已闭合" : "x2 payload apply 未闭合",
    summary.optionalFlagRefreshRecovered ? "x3 flag refresh 已闭合" : "x3 flag refresh 未闭合",
    summary.particleDrawFilterBridgeRecovered ? "0x200 draw filter 已闭合" : "0x200 draw filter 未闭合",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B manager draw bridge：${summary.layoutBRegisterFlagRows} 条 flag 源（${details.join(" / ")}）。`;
}

function currentNativeLayoutBParticleEntryDispatchHealthSummary() {
  const summary = currentNativeLayoutBParticleEntryDispatchSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.sharedEntryArrayRows || 0} 条 entry array`,
    `${summary.particleTaskRows || 0} 条 particle task`,
    `${summary.compositeDispatchRows || 0} 条 composite dispatch`,
    summary.particleCompositeDispatchRecovered ? "particle composite 已闭合" : "particle composite 未闭合",
    summary.layoutBEntryToCompositeDispatchBridgeRecovered ? "layout B entry 已接到 dispatch" : "layout B entry 未接到 dispatch",
    summary.managerEntryToOwnerVtableRecovered ? "entry+0x8 owner vtable 已闭合" : "entry+0x8 owner vtable 未闭合",
    summary.globalHelperDispatchLinked ? "global helper 已接上" : "global helper 未接上",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B particle entry dispatch：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeLayoutBEntryProviderPayloadBridgeHealthSummary() {
  const summary = currentNativeLayoutBEntryProviderPayloadBridgeSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.entryIdentityRows || 0} 条 entry 身份`,
    `${summary.entryPrimaryHelperRows || 0} 条 helper payload`,
    `${summary.providerVtableRows || 0} 条 provider vtable`,
    `${summary.providerAccessorRows || 0} 条 provider accessor`,
    `${summary.ownerBProviderUseRows || 0} 条 ownerB 使用`,
    summary.layoutBEntryIdentityRecovered ? "entry 身份已闭合" : "entry 身份未闭合",
    summary.managerEntryToOwnerBRecovered ? "entry+0x8 owner 已闭合" : "entry+0x8 owner 未闭合",
    summary.entryProviderVtableRecovered ? "provider vtable 已闭合" : "provider vtable 未闭合",
    summary.providerTargetHandleFormulaRecovered ? "target handle=object+0x58" : "target handle 未恢复",
    summary.providerTransformSourceFormulaRecovered ? "transform source=object+0x70" : "transform source 未恢复",
    summary.ownerBUsesProviderTargetAndTransformRecovered ? "ownerB 使用 provider 已闭合" : "ownerB 使用 provider 未闭合",
    summary.entryHelperPayloadBridgeRecovered ? "object+0x40 helper 已接上" : "object+0x40 helper 未接上",
    summary.targetPayloadToFinalDrawFormulaRecovered ? "payload 到 final draw 已恢复" : "payload 到 final draw 未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  if (summary.pointerMismatchRows) details.push(`${summary.pointerMismatchRows} 条 pointer 不匹配`);
  return ` layout B entry/provider bridge：${summary.opcodeRows} 条指令/${summary.pointerRows || 0} 条指针（${details.join(" / ")}）。`;
}

function currentNativeLayoutBOwnerBVtableDispatchHealthSummary() {
  const summary = currentNativeLayoutBOwnerBVtableDispatchSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.ownerLifecycleRows || 0} 条生命周期`,
    `${summary.ownerConstructorRows || 0} 条构造`,
    `${summary.vtableSlotRows || 0} 条 vtable slot`,
    `${summary.ownerDispatchRows || 0} 条 slot+0x10 dispatch`,
    `${summary.submitPathRows || 0} 条 submit 路径`,
    summary.ownerBGlobalSlotRecovered ? "ownerB slot 已闭合" : "ownerB slot 未闭合",
    summary.ownerBVtableSlot10Recovered ? "vtable+0x10 已闭合" : "vtable+0x10 未闭合",
    summary.entryTransformProviderRecovered ? "entry transform provider 已闭合" : "entry transform provider 未闭合",
    summary.payloadBatchSubmitBridgeRecovered ? "payload batch 已闭合" : "payload batch 未闭合",
    summary.submitPathSplitRecovered ? "submit 分流已闭合" : "submit 分流未闭合",
    summary.primitiveFormulaRecovered ? "primitive 公式已恢复" : "primitive 公式未恢复",
    summary.materialFormulaRecovered ? "材质公式已恢复" : "材质公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  if (summary.pointerMismatchRows) details.push(`${summary.pointerMismatchRows} 条 pointer 不匹配`);
  return ` layout B ownerB vtable dispatch：${summary.opcodeRows} 条指令/${summary.pointerRows || 0} 条指针（${details.join(" / ")}）。`;
}

function currentNativeLayoutBPrimitiveModeDispatchHealthSummary() {
  const summary = currentNativeLayoutBPrimitiveModeDispatchSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.payloadModeSourceRows || 0} 条 mode 源`,
    `${summary.outerModeEntries || 0} 条外层模式`,
    `${summary.nestedModeEntries || 0} 条嵌套模式`,
    `${summary.builderCallRows || 0} 条 builder call`,
    `${summary.uniqueBuilderTargets || 0} 个 builder target`,
    `${summary.outputPatternRows || 0} 条输出形状`,
    summary.outerModeDispatchRecovered ? "外层 mode dispatch 已闭合" : "外层 mode dispatch 未闭合",
    summary.nestedModeDispatchRecovered ? "嵌套 mode dispatch 已闭合" : "嵌套 mode dispatch 未闭合",
    summary.builderCallMatrixRecovered ? "builder call 矩阵已闭合" : "builder call 矩阵未闭合",
    summary.outputRecordShapePartiallyRecovered ? "输出记录形状部分恢复" : "输出记录形状未恢复",
    summary.materialFormulaRecovered ? "材质公式已恢复" : "材质公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  if (summary.tableMismatchRows) details.push(`${summary.tableMismatchRows} 条 table 不匹配`);
  return ` layout B primitive mode dispatch：${summary.opcodeRows} 条指令/${summary.tableRows || 0} 条表项（${details.join(" / ")}）。`;
}

function currentNativeLayoutBMaterialDrawBridgeHealthSummary() {
  const summary = currentNativeLayoutBMaterialDrawBridgeSummary;
  if (!summary?.currentPayloadFieldRows) return "";
  const details = [
    `${summary.currentPayloadFieldRows || 0} 条当前 payload 字段`,
    `${summary.crossBuildDrawStateRows || 0} 条旧安卓 draw state`,
    `${summary.crossBuildDynamicParameterRows || 0} 条动态参数`,
    `${summary.crossBuildDrawModeRows || 0} 条 draw mode`,
    `${summary.currentQueueProgramRows || 0} 条 program 绑定`,
    `${summary.currentQueueSortRows || 0} 条 sort 绑定`,
    summary.currentPayloadFieldsRecovered ? "当前 payload 字段已闭合" : "当前 payload 字段未闭合",
    summary.crossBuildDrawStateSemanticsRecovered ? "跨版本 draw state 语义已闭合" : "跨版本 draw state 语义未闭合",
    summary.crossBuildDynamicParameterSemanticsRecovered ? "动态参数语义已闭合" : "动态参数语义未闭合",
    summary.crossBuildDrawModeMappingRecovered ? "draw mode 映射已闭合" : "draw mode 映射未闭合",
    summary.currentQueueProgramBindingRecovered && summary.currentQueueSortRecovered ? "program/sort 已闭合" : "program/sort 未闭合",
    summary.currentFinalPrimitiveConsumerRecovered ? "final primitive consumer 已恢复" : "final primitive consumer 未恢复",
    summary.currentFinalPrimitiveDrawStateRecovered ? "final draw state 已闭合" : "final draw state 未闭合",
    summary.currentFinalPrimitiveProgramBindingRecovered ? "final program 绑定已闭合" : "final program 绑定未闭合",
    summary.currentFinalPrimitiveDrawModeMappingRecovered ? "final draw mode 已闭合" : "final draw mode 未闭合",
    summary.currentFinalPrimitiveAttributeBindingRecovered ? "final attribute 绑定已闭合" : "final attribute 绑定未闭合",
    summary.currentFinalPrimitiveBufferLifecycleRecovered ? "final buffer 生命周期已闭合" : "final buffer 生命周期未闭合",
    `${summary.currentShaderParameterBridgeRows || 0} 条 shader 参数桥`,
    summary.currentLayoutBToSharedParameterUploaderRecovered ? "接到共享参数 uploader" : "未接到共享参数 uploader",
    summary.currentParameterUploaderRecovered ? "参数 uploader 已闭合" : "参数 uploader 未闭合",
    summary.currentShaderParamsToUploaderOverrideBridgeRecovered
      ? "ShaderParams override 已闭合"
      : "ShaderParams override 未闭合",
    summary.currentShaderParamsNumericOverrideRecovered ? "ShaderParams 数值覆盖已闭合" : "ShaderParams 数值覆盖未闭合",
    summary.currentShaderParamsOverrideProducesTextureObjectType4 === false
      ? "ShaderParams 不产生贴图 type4"
      : "ShaderParams type4 贴图来源未排除",
    summary.currentTextureObjectBindingRecovered ? "texture object bind 已闭合" : "texture object bind 未闭合",
    summary.currentTextureObjectRecordPointerRecovered
      ? "texture record object+0x30 已闭合"
      : "texture record object+0x30 未闭合",
    summary.currentTextureSamplerStateUpdateRecovered ? "sampler state update 已闭合" : "sampler state update 未闭合",
    summary.currentSourceProgramTablePathRecovered ? "source/program 表路径已闭合" : "source/program 表路径未闭合",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    summary.textureSamplerFormulaRecovered ? "sampler 公式已恢复" : "sampler 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.currentOpcodeMismatchRows) details.push(`${summary.currentOpcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B material draw bridge：${summary.currentPayloadFieldRows} 条当前字段（${details.join(" / ")}）。`;
}

function currentNativeLayoutBFinalPrimitiveConsumerHealthSummary() {
  const summary = currentNativeLayoutBFinalPrimitiveConsumerSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.commandConstructorRows || 0} 条 command 构造`,
    `${summary.segmentBuilderRows || 0} 条 segment builder`,
    `${summary.drawConsumerRows || 0} 条 draw consumer`,
    `${summary.bufferLifecycleRows || 0} 条 buffer 生命周期`,
    `${summary.vtablePointerRows || 0} 条 vtable 指针`,
    summary.commandVtableRecovered ? "command vtable 已闭合" : "command vtable 未闭合",
    summary.segmentListRecovered ? "segment list 已闭合" : "segment list 未闭合",
    summary.currentFinalPrimitiveConsumerRecovered ? "当前 consumer 已恢复" : "当前 consumer 未恢复",
    summary.currentDrawStateRecovered ? "draw state 已闭合" : "draw state 未闭合",
    summary.currentProgramBindingRecovered ? "program 绑定已闭合" : "program 绑定未闭合",
    summary.currentDrawModeMappingRecovered ? "draw mode 已闭合" : "draw mode 未闭合",
    summary.currentAttributeBindingRecovered ? "attribute 绑定已闭合" : "attribute 绑定未闭合",
    summary.currentBufferLifecycleRecovered ? "buffer 生命周期已闭合" : "buffer 生命周期未闭合",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    summary.textureSamplerFormulaRecovered ? "sampler 公式已恢复" : "sampler 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  if (summary.pointerMismatchRows) details.push(`${summary.pointerMismatchRows} 条 pointer 不匹配`);
  return ` layout B final primitive consumer：${summary.opcodeRows} 条指令/${summary.vtablePointerRows || 0} 条指针（${details.join(" / ")}）。`;
}

function currentNativeLayoutBShaderParameterBridgeHealthSummary() {
  const summary = currentNativeLayoutBShaderParameterBridgeSummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  if (summary.layoutBToSharedParameterUploaderRecovered) details.push("接到参数 uploader");
  if (summary.parameterUploaderRecovered) details.push("uniform uploader 已闭合");
  if (summary.overrideHashMatchRecovered) details.push("override hash 匹配已闭合");
  if (summary.overrideKeepsBaseUniformLocationRecovered) details.push("base uniform location 已保留");
  if (summary.overrideUsesOverrideValueAndTypeRecovered) details.push("override value/type 已接入");
  if (summary.shaderParamsNumericOverrideRecovered) details.push("ShaderParams 数值覆盖已闭合");
  if (summary.shaderParamsToUploaderOverrideBridgeRecovered) details.push("ShaderParams 已接到 uploader");
  if (summary.shaderParamsOverrideProducesTextureObjectType4 === false) details.push("ShaderParams 不产生贴图 type4");
  if (summary.textureObjectBindingRecovered) details.push("texture bind 已闭合");
  if (summary.textureObjectRecordPointerRecovered) details.push("texture record object+0x30 已闭合");
  if (summary.textureSamplerStateUpdateRecovered) details.push("sampler state update 已闭合");
  if (summary.sourceProgramTablePathRecovered) details.push("source/program 表路径已闭合");
  if (!summary.shaderTextureFormulaRecovered) details.push("shader/texture 公式未恢复");
  if (!summary.textureSamplerFormulaRecovered) details.push("sampler 公式未恢复");
  details.push(`${summary.renderPromotionAllowedRows || 0} 条允许接管`);
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B shader 参数桥：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeShaderDataType4ValueSourceHealthSummary() {
  const summary = currentNativeShaderDataType4ValueSourceSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.parserType4BranchRows || 0} 条 type4 parser`,
    `${summary.type4EntryWriterRows || 0} 条 type4 writer`,
    `${summary.semanticNameRows || 0} 个内置语义`,
    `${summary.type4SemanticRows || 0} 个 type4 贴图语义`,
    summary.parserType4BranchRecovered ? "type4 分支已闭合" : "type4 分支未闭合",
    summary.type4EntryWriterRecovered ? "type4 entry writer 已闭合" : "type4 entry writer 未闭合",
    summary.shaderDataType4SemanticTextureValueSourceRecovered
      ? "内置语义贴图值源已恢复"
      : "内置语义贴图值源未恢复",
    summary.materialSamplerTextureObjectOwnershipRecovered ? "普通材质 sampler 归属已恢复" : "普通材质 sampler 归属未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` shaderData type4 值源：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeShaderDataType4EntrySemanticsHealthSummary() {
  const summary = currentNativeShaderDataType4EntrySemanticsSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.sharedType4EntryWriterRows || 0} 条 shared writer`,
    `${summary.externalTextureType4WrapperRows || 0} 条 external wrapper`,
    `${summary.inlineTextureType4WrapperRows || 0} 条 inline wrapper`,
    `${summary.runtimeType4ValuePatchRows || 0} 条 runtime patch`,
    summary.sharedType4EntryWriterRecovered ? "shared writer 已闭合" : "shared writer 未闭合",
    summary.externalTextureType4WrapperRecovered ? "external wrapper 已闭合" : "external wrapper 未闭合",
    summary.inlineTextureType4WrapperRecovered ? "inline wrapper 已闭合" : "inline wrapper 未闭合",
    summary.runtimeType4ValuePatchRecovered ? "runtime type4 补值已闭合" : "runtime type4 补值未闭合",
    summary.type4EntrySemanticsRecovered ? "type4 entry 公式已恢复" : "type4 entry 公式未恢复",
    summary.runtimePatchMatchesSourceIndexAndType4 ? "按 source index/type4 匹配补值" : "补值匹配条件未闭合",
    summary.shadergraphSamplerToTexDataBindingRecovered ? "sampler 到 texData 归属已恢复" : "sampler 到 texData 归属未恢复",
    summary.materialSamplerTextureObjectOwnershipRecovered ? "普通材质 sampler 归属已恢复" : "普通材质 sampler 归属未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` shaderData type4 entry 语义：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeTexDataTextureObjectHealthSummary() {
  const summary = currentNativeTexDataTextureObjectSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.pointerRows || 0} 条 vtable 指针`,
    `${summary.texDataHandlerRows || 0} 条 texData handler`,
    `${summary.textureWrapperBuilderRows || 0} 条 wrapper builder`,
    `${summary.texDataPayloadParserRows || 0} 条 payload parser`,
    `${summary.textureGlUploadRows || 0} 条 GL 上传`,
    `${summary.textureObjectApplyRows || 0} 条 draw bind`,
    summary.texDataToGlTextureObjectChainRecovered ? "texData 到 GL texture object 已闭合" : "texData 到 GL texture object 未闭合",
    summary.textureRuntimeVtablesRecovered ? "texture vtable 已闭合" : "texture vtable 未闭合",
    summary.shadergraphSamplerToTexDataBindingRecovered ? "shadergraph sampler 归属已恢复" : "shadergraph sampler 归属未恢复",
    summary.materialSamplerTextureObjectOwnershipRecovered ? "普通材质 sampler 对象归属已恢复" : "普通材质 sampler 对象归属未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  if (summary.pointerMismatchRows) details.push(`${summary.pointerMismatchRows} 条 pointer 不匹配`);
  return ` texData 贴图对象链：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeShaderDataTextureSamplerTableHealthSummary() {
  const summary = currentNativeShaderDataTextureSamplerTableSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.passSectionCountRows || 0} 条 section count`,
    `${summary.textureRecordParserRows || 0} 条 texture parser`,
    `${summary.textureRecordConsumerRows || 0} 条 texture consumer`,
    `${summary.inlineTextureRecordParserRows || 0} 条 inline parser`,
    `${summary.inlineTextureRecordConsumerRows || 0} 条 inline consumer`,
    `${summary.compiledSamplerUnitTableRows || 0} 条 sampler unit 表`,
    summary.shaderDataTextureSamplerStaticUnitLayoutRecovered
      ? "静态 sampler unit 布局已闭合"
      : "静态 sampler unit 布局未闭合",
    summary.textureRecordsProduceType4Placeholders ? "texture type4 placeholder 已闭合" : "texture type4 placeholder 未闭合",
    summary.texDataToGlTextureObjectChainRecovered ? "texData GL 对象链已闭合" : "texData GL 对象链未闭合",
    summary.shadergraphSamplerToTexDataBindingRecovered ? "sampler 到 texData 归属已恢复" : "sampler 到 texData 归属未恢复",
    summary.materialSamplerTextureObjectOwnershipRecovered ? "普通材质 sampler 对象归属已恢复" : "普通材质 sampler 对象归属未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` shaderData texture/sampler 表：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeShaderDataExternalTextureBindingHealthSummary() {
  const summary = currentNativeShaderDataExternalTextureBindingSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.textureRuntimeSetupRows || 0} 条 runtime setup`,
    `${summary.textureRuntimeCallbackStoreRows || 0} 条 callback slot`,
    `${summary.shaderDataResourceRegistrationRows || 0} 条 shaderData 资源注册`,
    `${summary.textureManagerResourceRegistrationRows || 0} 条 runtime 注册`,
    `${summary.externalTexturePassLookupRows || 0} 条 pass lookup`,
    `${summary.externalTextureRuntimeLookupRows || 0} 条 runtime lookup`,
    `${summary.externalTextureType4PatchRows || 0} 条 type4 补值`,
    summary.textureRuntimeCallbackInstalled ? "贴图 runtime callback 已安装" : "贴图 runtime callback 未安装",
    summary.shaderDataExternalResourceRegistrationRecovered ? "shaderData 外部贴图资源注册已闭合" : "shaderData 外部贴图资源注册未闭合",
    summary.externalTextureRuntimeLookupRecovered ? "外部贴图 runtime lookup 已闭合" : "外部贴图 runtime lookup 未闭合",
    summary.externalTextureType4PatchRecovered ? "外部贴图 type4 补值已闭合" : "外部贴图 type4 补值未闭合",
    summary.externalTextureSamplerRuntimeBindingRecovered ? "外部贴图 runtime 绑定已闭合" : "外部贴图 runtime 绑定未闭合",
    summary.shadergraphSamplerToTexDataBindingRecovered ? "全部 sampler 到 texData 归属已恢复" : "全部 sampler 到 texData 归属未恢复",
    summary.materialSamplerTextureObjectOwnershipRecovered ? "普通材质 sampler 对象归属已恢复" : "普通材质 sampler 对象归属未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` shaderData 外部贴图绑定：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeTextureSamplerStateSemanticsHealthSummary() {
  const summary = currentNativeTextureSamplerStateSemanticsSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.wrapStatePackingRows || 0} 条 wrap pack`,
    `${summary.filterStatePackingRows || 0} 条 filter pack`,
    `${summary.textureRecordBinderSamplerStateRows || 0} 条 binder decode`,
    `${summary.tableRows || 0} 条 GL 参数表`,
    summary.wrapStatePackingRecovered ? "wrap bit pack 已闭合" : "wrap bit pack 未闭合",
    summary.filterStatePackingRecovered ? "filter bit pack 已闭合" : "filter bit pack 未闭合",
    summary.textureRecordBinderSamplerStateRecovered ? "binder 解码已闭合" : "binder 解码未闭合",
    summary.textureSamplerStateFormulaRecovered ? "sampler state 公式已恢复" : "sampler state 公式未恢复",
    summary.wrapReservedTableRows ? `wrap 保留值 ${summary.wrapReservedTableRows} 条` : "",
    summary.shadergraphSamplerToTexDataBindingRecovered ? "sampler 到 texData 归属已恢复" : "sampler 到 texData 归属未恢复",
    summary.materialSamplerTextureObjectOwnershipRecovered ? "普通材质 sampler 对象归属已恢复" : "普通材质 sampler 对象归属未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ].filter(Boolean);
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  if (summary.tableMismatchRows) details.push(`${summary.tableMismatchRows} 条表项不匹配`);
  return ` texture sampler state：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeShaderDataInlineTexturePlaceholderHealthSummary() {
  const summary = currentNativeShaderDataInlineTexturePlaceholderSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.inlineCallsiteRows || 0} 条 inline callsite`,
    `${summary.inlineWrapperRows || 0} 条 inline wrapper`,
    `${summary.type4WriterRows || 0} 条 type4 writer`,
    `${summary.inlinePassLookupRows || 0} 条 pass lookup`,
    `${summary.inlineTextureObjectCreateRows || 0} 条 object create`,
    `${summary.inlineTextureObjectUploadRows || 0} 条 object upload`,
    `${summary.inlineType4RuntimePatchRows || 0} 条 runtime patch`,
    summary.inlineRecordConsumerRecovered ? "inline record consumer 已闭合" : "inline record consumer 未闭合",
    summary.inlineRecordCallsitePassesNullValue ? "callsite 初始 value 为空" : "callsite 初始 value 未确认",
    summary.inlineRecordCallsitePassesNullKey ? "callsite 初始 key 为空" : "callsite 初始 key 未确认",
    summary.inlineWrapperStoresDirectValueSlot ? "wrapper direct value slot 已闭合" : "wrapper direct value slot 未闭合",
    summary.inlineType4PlaceholderObjectInitiallyNull ? "初始 type4 对象为空" : "初始 type4 对象未确认",
    summary.inlinePassLookupRecovered ? "pass build inline lookup 已闭合" : "pass build inline lookup 未闭合",
    summary.inlineTextureObjectRuntimeConstructionRecovered ? "inline 贴图对象构造已闭合" : "inline 贴图对象构造未闭合",
    summary.inlineTextureObjectUploadRecovered ? "inline 贴图上传已闭合" : "inline 贴图上传未闭合",
    summary.inlineType4RuntimePatchRecovered ? "inline type4 补值已闭合" : "inline type4 补值未闭合",
    summary.inlineTextureObjectBindingRecovered ? "inline 贴图对象绑定已恢复" : "inline 贴图对象绑定未恢复",
    summary.inlineTextureRuntimePatchRequired ? "需要继续追 runtime 补值路径" : "runtime 补值路径已恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` shaderData inline 贴图 placeholder：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeShadergraphSamplerTexDataJoinHealthSummary() {
  const summary = currentNativeShadergraphSamplerTexDataJoinSummary;
  if (!summary?.materialSamplerRows) return "";
  const details = [
    `${summary.materialSamplerRows || 0} 个 sampler`,
    `${summary.samplerSourceKeyHashRows || 0} 个 sampler sourceKeyHash`,
    `${summary.externalTexturePathSamplerRows || 0} 个外部 hash 贴图`,
    `${summary.inlineRuntimeSamplerRows || 0} 个 inline lookup`,
    `${summary.runtimeSceneTextureSamplerRows || 0} 个 runtime scene`,
    `${summary.externalTextureBindingMechanicalRows || 0} 个外部机械绑定`,
    `${summary.inlineTextureBindingMechanicalRows || 0} 个 inline 机械绑定`,
    `${summary.runtimeSceneTextureDiagnosticRows || 0} 个 scene 诊断贴图`,
    `${summary.ordinarySamplerBindingMechanicalRows || 0} 个普通 sampler 机械绑定`,
    `${summary.classificationGapRows || 0} 个分类缺口`,
    summary.samplerResourceClassificationComplete ? "sampler 资源分类已闭合" : "sampler 资源分类未闭合",
    summary.externalTextureSamplerRuntimeBindingRecovered ? "外部贴图 runtime 绑定已闭合" : "外部贴图 runtime 绑定未闭合",
    summary.inlineTextureObjectBindingRecovered ? "inline 贴图对象绑定已恢复" : "inline 贴图对象绑定未恢复",
    summary.ordinarySamplerBindingMechanicsRecovered ? "普通 sampler 机械绑定已闭合" : "普通 sampler 机械绑定未闭合",
    summary.samplerStaticResourceAndBindingComplete ? "静态资源+机械绑定已闭合" : "静态资源+机械绑定未闭合",
    summary.samplerTexDataOwnershipNeedsLiveCapture ? "texData 归属需要 live capture" : "texData 归属不依赖 live capture",
    summary.shadergraphSamplerToTexDataBindingRecovered ? "sampler 到 texData 归属已恢复" : "sampler 到 texData 归属未恢复",
    summary.materialSamplerTextureObjectOwnershipRecovered ? "普通材质 sampler 对象归属已恢复" : "普通材质 sampler 对象归属未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` shadergraph sampler 资源分类：${details.join(" / ")}。`;
}

function currentNativeMaterialSourceProgramCaptureTargetHealthSummary() {
  const summary = currentNativeMaterialSourceProgramCaptureTargetSummary;
  if (!summary?.hookTargetRows) return "";
  const details = [
    `${summary.hookTargetRows || 0} 个 hook`,
    `${summary.opcodeRows || 0} 条证据`,
    summary.dynamicProducerHooksReady ? "动态 source/program producer 捕获就绪" : "动态 source/program producer 捕获未就绪",
    summary.upstreamSelectionHooksReady ? "上游资源选择捕获就绪" : "上游资源选择捕获未就绪",
    summary.tableMountHooksReady ? "source/program table 挂载捕获就绪" : "source/program table 挂载捕获未就绪",
    summary.textureRuntimeCaptureHooksReady ? "贴图 runtime 捕获就绪" : "贴图 runtime 捕获未就绪",
    summary.inlineTextureRuntimeCaptureHooksReady ? "inline 贴图捕获就绪" : "inline 贴图捕获未就绪",
    summary.sourceProgramCaptureScriptCoverageReady ? "Frida 事件覆盖完整" : "Frida 事件覆盖不完整",
    `${summary.captureScriptTargetRows || 0} 个脚本目标`,
    `${summary.captureScriptEventRows || 0} 个脚本事件字段`,
    `hook 事件捕获上限 ${summary.captureEventLimit || 0}`,
    summary.captureLimitEventCovered ? "hook limit 事件已覆盖" : "hook limit 事件未覆盖",
    `resource-list 捕获上限 ${summary.resourceListCaptureLimit || 0}`,
    `nested resource id 捕获上限 ${summary.nestedResourceIdCaptureLimit || 0}`,
    summary.resourceListTruncationFieldCovered ? "resource-list 截断字段已覆盖" : "resource-list 截断字段未覆盖",
    summary.nestedResourceIdTruncationFieldCovered ? "nested resource id 截断字段已覆盖" : "nested resource id 截断字段未覆盖",
    `source table 捕获上限 ${summary.sourceProgramTableEntryCaptureLimit || 0}`,
    summary.sourceProgramTableTruncationFieldCovered ? "table 截断字段已覆盖" : "table 截断字段未覆盖",
    summary.sourceProgramResourceListShapeRecovered ? "resource-list 形状已闭合" : "resource-list 形状未闭合",
    summary.sourceProgramTableMountRecovered ? "table 挂载路径已闭合" : "table 挂载路径未闭合",
    summary.textureRuntimeCaptureGenerated ? "贴图 lookup/patch 捕获已生成" : "贴图 lookup/patch 捕获未生成",
    summary.resourceListSemanticNamesRecovered ? "资源语义名已恢复" : "资源语义名未恢复",
    summary.shadergraphSamplerToTexDataBindingRecovered ? "sampler 到 texData 归属已恢复" : "sampler 到 texData 归属未恢复",
    summary.materialSamplerTextureObjectOwnershipRecovered ? "普通材质 sampler 对象归属已恢复" : "普通材质 sampler 对象归属未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  if (summary.captureScriptMismatchRows) details.push(`${summary.captureScriptMismatchRows} 条 Frida 脚本覆盖缺口`);
  if (summary.runtimeCaptureRequiredRows) details.push("需要真机 runtime 捕获");
  return ` source/program 捕获目标：${details.join(" / ")}。`;
}

function currentNativeMaterialSourceProgramCaptureHealthSummary() {
  const summary = currentNativeMaterialSourceProgramCaptureSummary;
  if (!summary?.targetRows) return "";
  const statusText = {
    "capture-missing": "未导入捕获",
    "capture-empty": "捕获为空",
    "no-target-events": "没有目标事件",
    "capture-event-limit-hit": "hook 捕获事件达到上限",
    "resource-list-truncated": "resource-list 捕获被截断",
    "source-program-table-truncated": "source table 捕获被截断",
    "capture-ordering-fields-missing": "capture ordering 字段缺失",
    "capture-event-ordering-invalid": "eventId 顺序异常",
    "partial-target-coverage": "部分 hook 覆盖",
    "ready-for-partial-source-program-review": "可人工复核（部分 hook）",
    "ready-for-full-source-program-review": "可人工复核（全部 hook）",
  }[summary.captureStatus] || summary.captureStatus || "状态未知";
  const details = [
    statusText,
    `覆盖 ${summary.observedHookTargets || 0}/${summary.targetRows || 0} 个 hook`,
    `${summary.targetEventRows || 0} 条事件`,
    `${summary.targetEventRowsWithEventId || 0} 条 eventId 完整事件`,
    `${summary.targetEventRowsWithThreadId || 0} 条 threadId 完整事件`,
    summary.captureOrderingFieldsComplete ? "capture ordering 字段已闭合" : "capture ordering 字段未闭合",
    `${summary.targetEventDuplicateEventIdRows || 0} 条重复 eventId 事件`,
    `${summary.targetEventNonMonotonicEventIdRows || 0} 条 eventId 非递增事件`,
    summary.captureEventIdOrderingComplete ? "eventId 顺序已闭合" : "eventId 顺序未闭合",
    `${summary.captureLimitRows || 0} 条 hook 捕获上限事件`,
    `${summary.captureLimitDroppedEventRowsAtLeast || 0} 条至少丢弃事件`,
    summary.captureEventLimitHit ? "hook 捕获已截断" : "hook 捕获未触发上限",
    `${summary.resourceListSnapshotEvents || 0} 条 resource-list 快照`,
    `${summary.nestedIdRows || 0} 个 resource id`,
    `${summary.resourceListTruncatedRows || 0} 条 resource-list 截断`,
    `${summary.nestedResourceIdTruncatedRows || 0} 条 nested resource id 截断`,
    summary.resourceListCaptureComplete ? "resource-list 捕获完整" : "resource-list 捕获未闭合",
    `${summary.entryBuilderEvents || 0} 条 entry build`,
    `${summary.mountEvents || 0} 条 table mount`,
    `${summary.sourceProgramTableDecodeEvents || 0} 条 source table decode`,
    `${summary.sourceProgramTableDecodedEntryRows || 0} 条 source table entry`,
    `${summary.sourceProgramTableTruncatedRows || 0} 条 source table 截断`,
    `${summary.sourceProgramTableMissingEntryRows || 0} 条 source table 缺失 entry`,
    summary.sourceProgramTableCaptureComplete ? "source table 捕获完整" : "source table 捕获未闭合",
    `${summary.sourceProgramType4EntryRows || 0} 条 type4 entry`,
    `${summary.sourceProgramMountedType4TableRows || 0} 条 mounted type4 table`,
    `${summary.knownShadergraphTextureResourceRows || 0} 个已知 shadergraph 贴图 resource key`,
    `${summary.knownShadergraphTextureResourceUnitRows || 0} 个已知 shadergraph 贴图 sampler unit`,
    `${summary.knownShadergraphTextureResourceSamplerIdentityRows || 0} 个已知 shadergraph 贴图 sampler 身份 hash`,
    `${summary.textureRegistrationResourceKeyRows || 0} 条 register resource key`,
    `${summary.textureRegistrationKnownShadergraphResourceKeyRows || 0} 条 register 对上 shadergraph 贴图`,
    `${summary.textureLookupResourceKeyRows || 0} 条 lookup resource key`,
    `${summary.textureLookupKnownShadergraphResourceKeyRows || 0} 条 lookup 对上 shadergraph 贴图`,
    `${summary.textureLookupUnknownShadergraphResourceKeyRows || 0} 条 lookup 未对上 shadergraph 贴图`,
    `${summary.textureLookupRegisteredKnownShadergraphResourceKeyRows || 0} 条 lookup 已有同线程 register`,
    `${summary.textureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows || 0} 条 lookup 已有同 runtime register`,
    `${summary.textureRuntimeLookupEvents || 0} 条贴图 lookup`,
    `${summary.textureRuntimeLookupReturnRows || 0} 条贴图对象返回`,
    `${summary.inlineTextureObjectBuilderEvents || 0} 条 inline 贴图对象构建`,
    `${summary.type4TexturePatchEvents || 0} 条 type4 贴图 patch`,
    `${summary.type4TexturePatchDecodedType4EntryRows || 0} 条 patch 后 type4 entry`,
    `${summary.type4TexturePatchKnownReturnedObjectRows || 0} 条 patch 对上返回贴图对象`,
    `${summary.type4TexturePatchValueMatchesObjectRows || 0} 条 patch value 对上贴图对象`,
    `${summary.type4TexturePatchSameObjectAndValueMatchRows || 0} 条 patch 对象和值同时闭合`,
    `${summary.type4TexturePatchSamplerUnitMatchesEntryRows || 0} 条 patch sampler unit 对上 type4 entry`,
    `${summary.type4TexturePatchValueAndSamplerUnitMatchRows || 0} 条 patch value/unit 同时闭合`,
    `${summary.type4TexturePatchSameThreadObjectRows || 0} 条 patch 同线程对象闭合`,
    `${summary.type4TexturePatchOrderedSameThreadObjectRows || 0} 条 patch 同线程顺序闭合`,
    `${summary.type4TexturePatchSameSequenceObjectAndValueMatchRows || 0} 条 patch 同序对象和值闭合`,
    `${summary.type4TexturePatchSameSequenceObjectUnitAndValueRows || 0} 条 patch 同序对象/unit/值闭合`,
    `${summary.type4TexturePatchSameSequenceKnownResourceObjectRows || 0} 条 patch 同序已知 resource/object 闭合`,
    `${summary.type4TexturePatchSameSequenceKnownResourceUnitAndValueRows || 0} 条 patch 同序已知 resource/unit/值闭合`,
    `${summary.type4TexturePatchSameSequenceRegisteredKnownResourceObjectRows || 0} 条 patch 同序已注册 resource/object 闭合`,
    `${summary.type4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows || 0} 条 patch 同序已注册 resource/unit/值闭合`,
    `${summary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows || 0} 条 patch 同序已注册 resource/sampler unit 闭合`,
    `${summary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows || 0} 条 patch 同序已注册 resource/sampler unit/值闭合`,
    `${summary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows || 0} 条 patch 同序同 runtime resource/sampler unit/值闭合`,
    `${summary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows || 0} 条 patch 同序同 runtime resource/sampler 身份闭合`,
    `${summary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows || 0} 条 patch 同序同 runtime resource/sampler 身份/值闭合`,
    `${summary.type4TexturePatchMountedTableRows || 0} 条 patch 对上 mounted table`,
    `${summary.type4TexturePatchOrderedMountedTableRows || 0} 条 patch 同线程顺序 table 闭合`,
    `${summary.type4TexturePatchSameSequenceTableObjectRows || 0} 条 patch 同序 table/对象闭合`,
    `${summary.type4TexturePatchSameSequenceTableRegisteredResourceSamplerUnitAndValueRows || 0} 条 patch 同序 table/已注册 resource/sampler unit/值闭合`,
    `${summary.type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerUnitAndValueRows || 0} 条 patch 同序 table/同 runtime resource/sampler unit/值闭合`,
    `${summary.type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows || 0} 条 patch 同序 table/同 runtime resource/sampler 身份/值闭合`,
    summary.sourceProgramType4DecoderReady ? "type4 解码器已就绪" : "type4 解码器未就绪",
    summary.sourceProgramType4DecoderNeedsRuntimeCapture ? "type4 解码等待 runtime 捕获" : "type4 解码已有 runtime entry",
    summary.readyForManualTextureRuntimeReview ? "贴图 runtime 值可复核" : "贴图 runtime 值未到复核条件",
    summary.readyForManualTextureResourceKeyReview ? "贴图 resource key 可复核" : "贴图 resource key 未到复核条件",
    summary.readyForManualSourceProgramReview ? "source/program 值可人工复核" : "source/program 值未到复核条件",
    summary.readyForManualTextureSamplerReview ? "texture sampler 值可复核" : "texture sampler 值未到复核条件",
    summary.resourceListSemanticNamesRecovered ? "资源语义名已恢复" : "资源语义名未恢复",
    summary.materialSamplerTextureObjectOwnershipRecovered ? "普通材质 sampler 对象归属已恢复" : "普通材质 sampler 对象归属未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.errorRows) details.push(`${summary.errorRows} 条错误`);
  return ` source/program 捕获结果：${details.join(" / ")}。`;
}

function currentNativeDefinitionShaderParamStaticStringHealthSummary() {
  const summary = currentNativeDefinitionShaderParamStaticStringSummary;
  if (!summary?.definitionStringRows) return "";
  const details = [
    `${summary.definitionStringRows || 0} 条 definition 字符串`,
    `${summary.shaderUniformNameStringRows || 0} 条 u_ 参数名`,
    `${summary.uniqueShaderUniformNameRows || 0} 个唯一参数名`,
    `${summary.nativeSamplerNameStringRows || 0} 条 sampler 名`,
    `${summary.shadergraphPathStringRows || 0} 条 shadergraph 路径`,
    summary.staticShaderUniformNamesRecovered ? "静态参数名已恢复" : "静态参数名未恢复",
    summary.staticDefinitionSamplerNamesRecovered ? "静态 sampler 名已恢复" : "静态 sampler 名未恢复",
    summary.structuredShaderParamsOwnershipRecovered ? "ShaderParams 结构归属已恢复" : "ShaderParams 结构归属未恢复",
    summary.resourceListSemanticNamesRecovered ? "resource-list 语义名已恢复" : "resource-list 语义名未恢复",
    summary.sourceProgramStaticReplacementAllowed ? "允许静态替代 source/program" : "不允许静态替代 source/program",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` definition shader 参数静态字符串：${details.join(" / ")}。`;
}

function currentNativeDefinitionShaderParamsPayloadStructureHealthSummary() {
  const summary = currentNativeDefinitionShaderParamsPayloadStructureSummary;
  if (!summary?.shaderUniformPayloadRows) return "";
  const details = [
    `${summary.shaderUniformPayloadRows || 0} 条 u_ payload`,
    `${summary.uniqueShaderUniformNameRows || 0} 个唯一参数名`,
    `${summary.uniformRowsWithAdjacentObjectPayload || 0} 条相邻对象 payload`,
    `${summary.uniformRowsWithFloatValueCandidates || 0} 条 float 候选值`,
    `${summary.uniformNearbyScalarFloatPayloadRows || 0} 条邻近 float/scalar 字段`,
    `${summary.uniformNearbySmallIntegerPayloadRows || 0} 条小整数 id 候选`,
    `${summary.uniformNearbyNestedPayloadRows || 0} 条嵌套 payload 字段`,
    `${summary.uniformRowsWithSamplerNameNeighbor || 0} 条 sampler 邻居`,
    `${summary.uniformRowsWithShadergraphPathNeighbor || 0} 条 shadergraph 邻居`,
    `${summary.uniformRowsWithTextureResourceNeighbor || 0} 条贴图资源邻居`,
    summary.staticUniformOverridePayloadLocated ? "静态 uniform override payload 已定位" : "静态 uniform override payload 未定位",
    summary.staticUniformFloatValueCandidatesLocated ? "静态 float 值候选已定位" : "静态 float 值候选未定位",
    summary.staticShaderParamIdListCandidatesLocated ? "ShaderParam id 列表候选已定位" : "ShaderParam id 列表候选未定位",
    summary.structuredShaderParamsListRecovered ? "ShaderParams 列表已恢复" : "ShaderParams 列表未恢复",
    summary.sourceProgramStaticReplacementAllowed ? "允许静态替代 source/program" : "不允许静态替代 source/program",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` definition ShaderParams payload：${details.join(" / ")}。`;
}

function currentNativeMaterialSamplerOwnershipGateHealthSummary() {
  const summary = currentNativeMaterialSamplerOwnershipGateSummary;
  if (!summary?.materialRows) return "";
  const details = [
    `${summary.materialRows || 0} 个材质`,
    `${summary.rowsWithRuntimeSamplerRecords || 0} 条 runtime sampler`,
    `${summary.unresolvedSamplerRows || 0} 条未解析 sampler`,
    `${summary.unhashedSamplerRows || 0} 条未命名 sampler`,
    `${summary.texturePathMissingSamplerRows || 0} 条无外部贴图路径 sampler`,
    `${summary.runtimeResolvedSamplerRows || 0} 条 runtime 已解析 sampler`,
    `${summary.runtimeResolvedTexturePathMissingSamplerRows || 0} 条 runtime 已解释无路径 sampler`,
    `${summary.texturePathMissingSamplerBlockingRows || 0} 条无路径阻塞 sampler`,
    summary.texturePathMissingSamplerRows
      ? summary.texturePathMissingSamplerRowsAreRuntimeResolved
        ? "无路径 sampler 已由 runtime 解释"
        : "仍有无路径 sampler 阻塞"
      : "没有无路径 sampler",
    summary.externalMechanicalTexturePathRecovered ? "external 贴图机械链已闭合" : "external 贴图机械链未闭合",
    summary.inlineMechanicalTexturePathRecovered ? "inline 贴图机械链已闭合" : "inline 贴图机械链未闭合",
    summary.allMechanicalTexturePathsRecovered ? "全部贴图机械链已闭合" : "全部贴图机械链未闭合",
    summary.shaderDataType4SemanticTextureValueSourceRecovered ? "内置 type4 语义已闭合" : "内置 type4 语义未闭合",
    summary.shaderDataType4EntrySemanticsRecovered ? "type4 entry 公式已闭合" : "type4 entry 公式未闭合",
    summary.shaderDataType4RuntimePatchRecovered ? "type4 runtime 补值已闭合" : "type4 runtime 补值未闭合",
    summary.externalTextureSamplerRuntimeBindingRecovered ? "外部贴图 runtime 绑定已闭合" : "外部贴图 runtime 绑定未闭合",
    summary.textureSamplerStateFormulaRecovered ? "sampler state 公式已恢复" : "sampler state 公式未恢复",
    summary.inlineType4PlaceholderObjectInitiallyNull ? "inline 初始 type4 为空" : "inline 初始 type4 未确认",
    summary.inlineTextureObjectBindingRecovered ? "inline 贴图对象绑定已恢复" : "inline 贴图对象绑定未恢复",
    summary.shadergraphSamplerResourceClassificationComplete
      ? "sampler 资源分类已闭合"
      : "sampler 资源分类未闭合",
    `${summary.shadergraphExternalTexturePathSamplerRows || 0}/${summary.shadergraphSamplerResourceClassificationRows || 0} 个外部贴图 sampler`,
    `${summary.shadergraphSamplerSourceKeyHashRows || 0} 个静态 sampler sourceKeyHash`,
    summary.shadergraphSamplerIdentityTableComplete ? "静态 sampler 身份表已闭合" : "静态 sampler 身份表未闭合",
    `${summary.shadergraphInlineRuntimeSamplerRows || 0} 个 inline sampler`,
    `${summary.shadergraphRuntimeSceneTextureSamplerRows || 0} 个 scene sampler`,
    `${summary.definitionShaderParamsPayloadRows || 0} 条 definition u_ payload`,
    `${summary.definitionShaderParamsFloatValueCandidateRows || 0} 条静态 float 候选`,
    `${summary.definitionShaderParamsScalarFloatPayloadRows || 0} 条邻近 float/scalar`,
    `${summary.definitionShaderParamsSmallIntegerPayloadRows || 0} 条小整数 id 候选`,
    summary.definitionShaderParamsStaticUniformOverridePayloadLocated
      ? "definition uniform payload 已定位"
      : "definition uniform payload 未定位",
    summary.definitionShaderParamsShaderParamIdListCandidatesLocated
      ? "definition ShaderParam id 列表候选已定位"
      : "definition ShaderParam id 列表候选未定位",
    summary.definitionShaderParamsStructuredListRecovered ? "definition ShaderParams 列表已恢复" : "definition ShaderParams 列表未恢复",
    summary.definitionShaderParamsSourceProgramStaticReplacementAllowed
      ? "definition 允许替代 source/program"
      : "definition 不允许替代 source/program",
    summary.staticMeshShaderParamsDisqualifiedAsTextureSource
      ? "StaticMesh ShaderParams 已排除为贴图来源"
      : "StaticMesh ShaderParams 贴图来源未排除",
    `StaticMesh ShaderParams ${summary.staticMeshShaderParamsCaptureStatus || "capture-unknown"}`,
    summary.staticMeshShaderParamsCaptureTargetHooksReady
      ? "StaticMesh ShaderParams 捕获 hook 已准备"
      : "StaticMesh ShaderParams 捕获 hook 未准备",
    summary.staticMeshShaderParamsCaptureReadyForManualReview
      ? "StaticMesh ShaderParams 捕获可复核"
      : "StaticMesh ShaderParams 捕获未到复核条件",
    `${summary.staticMeshShaderParamsCaptureListEntryRows || 0} 条 StaticMesh ShaderParams source key`,
    `${summary.staticMeshShaderParamsCaptureValueRows || 0} 条 StaticMesh ShaderParam 值`,
    summary.dynamicSourceTableTypeIndexChainRecovered
      ? "dynamic source table type-index 已闭合"
      : "dynamic source table type-index 未闭合",
    summary.dynamicSourceTableSelectorChainRecovered
      ? "dynamic source table selector 已闭合"
      : "dynamic source table selector 未闭合",
    summary.dynamicSourceTableProducerAgrees
      ? "dynamic source table producer 已对齐"
      : "dynamic source table producer 未对齐",
    summary.dynamicSourceTableResourceFieldNamesRecovered
      ? "dynamic source table resource 字段已恢复"
      : "dynamic source table resource 字段未恢复",
    summary.dynamicSourceTableActiveResourceSemanticsRecovered
      ? "dynamic source table active resource 已恢复"
      : "dynamic source table active resource 未恢复",
    `${summary.dynamicSourceTableRenderPromotionRows || 0} 条 dynamic source table 允许接管`,
    summary.layoutBPayloadSourceProgramBridgeRecovered
      ? "payload +0x208 source/program 已闭合"
      : "payload +0x208 source/program 未闭合",
    summary.layoutBPayloadSourceProgramParameterApplyRecovered
      ? "payload source/program 参数应用已闭合"
      : "payload source/program 参数应用未闭合",
    `${summary.layoutBPayloadSourceProgramRenderPromotionRows || 0} 条 payload source/program 允许接管`,
    summary.sourceProgramCaptureReadyForManualReview ? "source/program 捕获可复核" : "source/program 捕获未到复核条件",
    summary.sourceProgramCaptureReadyForTextureSamplerReview
      ? "texture sampler 捕获可复核"
      : "texture sampler 捕获未到复核条件",
    summary.sourceProgramSamplerIdentityReviewReady
      ? "source/program sampler 身份可复核"
      : "source/program sampler 身份未到复核条件",
    `${summary.sourceProgramTargetEventRows || 0} 条 source/program target 事件`,
    `${summary.sourceProgramTargetEventRowsWithEventId || 0} 条 source/program eventId 完整事件`,
    `${summary.sourceProgramTargetEventRowsWithThreadId || 0} 条 source/program threadId 完整事件`,
    summary.sourceProgramCaptureOrderingFieldsComplete
      ? "source/program capture ordering 字段已闭合"
      : "source/program capture ordering 字段未闭合",
    `${summary.sourceProgramTargetEventDuplicateEventIdRows || 0} 条 source/program 重复 eventId 事件`,
    `${summary.sourceProgramTargetEventNonMonotonicEventIdRows || 0} 条 source/program eventId 非递增事件`,
    summary.sourceProgramCaptureEventIdOrderingComplete
      ? "source/program eventId 顺序已闭合"
      : "source/program eventId 顺序未闭合",
    `${summary.sourceProgramCaptureLimitRows || 0} 条 hook 捕获上限事件`,
    `${summary.sourceProgramCaptureLimitDroppedEventRowsAtLeast || 0} 条至少丢弃事件`,
    summary.sourceProgramCaptureEventLimitHit ? "hook 捕获已截断" : "hook 捕获未触发上限",
    `${summary.sourceProgramResourceListTruncatedRows || 0} 条 resource-list 截断`,
    `${summary.sourceProgramNestedResourceIdTruncatedRows || 0} 条 nested resource id 截断`,
    summary.sourceProgramResourceListCaptureComplete ? "resource-list 捕获完整" : "resource-list 捕获未闭合",
    `${summary.sourceProgramTableDecodeEvents || 0} 条 source table decode`,
    `${summary.sourceProgramTableDecodedEntryRows || 0} 条 source table entry`,
    `${summary.sourceProgramTableTruncatedRows || 0} 条 source table 截断`,
    `${summary.sourceProgramTableMissingEntryRows || 0} 条 source table 缺失 entry`,
    summary.sourceProgramTableCaptureComplete ? "source table 捕获完整" : "source table 捕获未闭合",
    summary.sourceProgramType4DecoderReady ? "source/program type4 解码器已就绪" : "source/program type4 解码器未就绪",
    summary.sourceProgramType4DecoderNeedsRuntimeCapture ? "仍需 runtime type4 捕获" : "runtime type4 捕获已有 entry",
    `${summary.sourceProgramKnownShadergraphTextureResourceRows || 0} 个已知 shadergraph 贴图 resource key`,
    `${summary.sourceProgramKnownShadergraphTextureResourceUnitRows || 0} 个已知 shadergraph 贴图 sampler unit`,
    `${summary.sourceProgramKnownShadergraphTextureResourceSamplerIdentityRows || 0} 个已知 shadergraph 贴图 sampler 身份 hash`,
    `${summary.sourceProgramTextureRegistrationResourceKeyRows || 0} 条 register resource key`,
    `${summary.sourceProgramTextureRegistrationKnownShadergraphResourceKeyRows || 0} 条 register 对上 shadergraph 贴图`,
    `${summary.sourceProgramTextureLookupResourceKeyRows || 0} 条 lookup resource key`,
    `${summary.sourceProgramTextureLookupKnownShadergraphResourceKeyRows || 0} 条 lookup 对上 shadergraph 贴图`,
    `${summary.sourceProgramTextureLookupUnknownShadergraphResourceKeyRows || 0} 条 lookup 未对上 shadergraph 贴图`,
    `${summary.sourceProgramTextureLookupRegisteredKnownShadergraphResourceKeyRows || 0} 条 lookup 已有同线程 register`,
    `${summary.sourceProgramTextureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows || 0} 条 lookup 已有同 runtime register`,
    `${summary.sourceProgramTextureRuntimeLookupEvents || 0} 条贴图 lookup 捕获`,
    `${summary.sourceProgramTextureRuntimeLookupReturnRows || 0} 条贴图对象返回`,
    `${summary.sourceProgramMountedType4TableRows || 0} 条 mounted type4 table`,
    `${summary.sourceProgramType4TexturePatchEvents || 0} 条 type4 贴图 patch`,
    `${summary.sourceProgramType4TexturePatchDecodedType4EntryRows || 0} 条 patch 后 type4 entry`,
    `${summary.sourceProgramType4TexturePatchKnownReturnedObjectRows || 0} 条 patch 对上返回贴图对象`,
    `${summary.sourceProgramType4TexturePatchSameObjectAndValueMatchRows || 0} 条 patch 对象和值同时闭合`,
    `${summary.sourceProgramType4TexturePatchSamplerUnitMatchesEntryRows || 0} 条 patch sampler unit 对上 type4 entry`,
    `${summary.sourceProgramType4TexturePatchValueAndSamplerUnitMatchRows || 0} 条 patch value/unit 同时闭合`,
    `${summary.sourceProgramType4TexturePatchSameThreadObjectRows || 0} 条 patch 同线程对象闭合`,
    `${summary.sourceProgramType4TexturePatchOrderedSameThreadObjectRows || 0} 条 patch 同线程顺序闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceObjectAndValueMatchRows || 0} 条 patch 同序对象和值闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceObjectUnitAndValueRows || 0} 条 patch 同序对象/unit/值闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceKnownResourceObjectRows || 0} 条 patch 同序已知 resource/object 闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceKnownResourceUnitAndValueRows || 0} 条 patch 同序已知 resource/unit/值闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceObjectRows || 0} 条 patch 同序已注册 resource/object 闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows || 0} 条 patch 同序已注册 resource/unit/值闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows || 0} 条 patch 同序已注册 resource/sampler unit 闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows || 0} 条 patch 同序已注册 resource/sampler unit/值闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows || 0} 条 patch 同序同 runtime resource/sampler unit/值闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows || 0} 条 patch 同序同 runtime resource/sampler 身份闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows || 0} 条 patch 同序同 runtime resource/sampler 身份/值闭合`,
    `${summary.sourceProgramType4TexturePatchMountedTableRows || 0} 条 patch 对上 mounted table`,
    `${summary.sourceProgramType4TexturePatchOrderedMountedTableRows || 0} 条 patch 同线程顺序 table 闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceTableObjectRows || 0} 条 patch 同序 table/对象闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceTableRegisteredResourceSamplerUnitAndValueRows || 0} 条 patch 同序 table/已注册 resource/sampler unit/值闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerUnitAndValueRows || 0} 条 patch 同序 table/同 runtime resource/sampler unit/值闭合`,
    `${summary.sourceProgramType4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows || 0} 条 patch 同序 table/同 runtime resource/sampler 身份/值闭合`,
    summary.sourceProgramTextureRuntimeReadyForReview ? "贴图 runtime 捕获可复核" : "贴图 runtime 捕获未到复核条件",
    summary.sourceProgramTextureResourceKeyReadyForReview ? "贴图 resource key 捕获可复核" : "贴图 resource key 捕获未到复核条件",
    summary.shadergraphSamplerToTexDataBindingRecovered ? "shadergraph sampler 到 texData 已恢复" : "shadergraph sampler 到 texData 未恢复",
    summary.ordinaryMaterialSamplerOwnershipRecovered ? "普通材质 sampler 归属已恢复" : "普通材质 sampler 归属未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.runtimeLightProbeBlockedRows) details.push(`${summary.runtimeLightProbeBlockedRows} 条 light/probe 阻塞`);
  return ` sampler 归属总门槛：${details.join(" / ")}。`;
}

function currentNativeRuntimeCaptureGateHealthSummary() {
  const summary = currentNativeRuntimeCaptureGateSummary;
  if (!summary?.captureGateRows) return "";
  const blockingItems = currentNativeRuntimeCaptureGateItems
    .filter((item) => !item.captureImported || !item.readyForManualReview || item.renderPromotionAllowedRows === 0)
    .slice(0, 3)
    .map((item) => {
      const input = item.liveCapturePath || "未记录";
      const command = item.refreshCommand || "未记录";
      const proof = item.nextProofRequired || "未记录";
      return `${item.gate} live capture 输入 ${input}，刷新 ${command}，证据 ${proof}`;
    });
  const details = [
    `${summary.captureGateRows || 0} 条 capture gate`,
    `${summary.captureMissingRows || 0} 条 capture 缺失`,
    `${summary.captureReadyForManualReviewRows || 0} 条可复核`,
    summary.allRuntimeCapturesImported ? "全部 capture 已导入" : "runtime capture 未完整导入",
    summary.allRuntimeCapturesReadyForManualReview ? "全部 capture 可复核" : "runtime capture 未到复核条件",
    summary.anyRenderPromotionAllowed ? "存在接管候选" : "接管关闭",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  const blocking = Array.isArray(summary.blockingGateNames) ? summary.blockingGateNames.join("|") : "";
  if (blocking) details.push(`阻断 ${blocking}`);
  if (blockingItems.length) details.push(blockingItems.join("；"));
  return ` runtime capture 总门槛：${details.join(" / ")}。`;
}

function currentNativeDynamicSourceTableSemanticsHealthSummary() {
  const summary = currentNativeDynamicSourceTableSemanticsSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.typeIndexRows || 0} 条 type index`,
    `${summary.selectorBridgeRows || 0} 条 selector`,
    `${summary.upstreamBatchDispatcherRows || 0} 条 upstream batch`,
    `${summary.postChildSetupRows || 0} 条 post child`,
    summary.sourceTableTypeIndexChainRecovered ? "type index 链已闭合" : "type index 链未闭合",
    summary.selectorChildClassMatchRecovered ? "selector child 匹配已闭合" : "selector child 匹配未闭合",
    summary.upstreamConfigFieldChainRecovered ? "upstream config 字段链已闭合" : "upstream config 字段链未闭合",
    summary.batchDispatcherToSelectorRecovered ? "batch 到 selector 已闭合" : "batch 到 selector 未闭合",
    summary.levelConfigFieldNamesRecovered ? "Level 字段名已恢复" : "Level 字段名未恢复",
    summary.levelVisualsApplyProcessorFieldRoutingRecovered ? "LevelVisuals 字段路由已闭合" : "LevelVisuals 字段路由未闭合",
    summary.postChildPayloadSetupRecovered ? "post child payload 已闭合" : "post child payload 未闭合",
    summary.resourceFieldNamesRecovered ? "资源字段名已恢复" : "资源字段名未恢复",
    summary.activeResourceSemanticsRecovered ? "active 资源语义已恢复" : "active 资源语义未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` 动态 source table 语义：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeStaticMeshSelectorEntryHealthSummary() {
  const summary = currentNativeStaticMeshSelectorEntrySummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.staticMeshFieldRows || 0} 个 StaticMesh 字段`,
    `${summary.levelVisualsStaticMeshListRows || 0} 个 LevelVisuals StaticMesh 列表`,
    summary.levelVisualsStaticMeshListsRecovered ? "StaticMesh 列表已闭合" : "StaticMesh 列表未闭合",
    summary.currentStaticMeshFieldOffsetsRecovered ? "字段偏移已闭合" : "字段偏移未闭合",
    summary.currentStaticMeshFieldTypesRecovered ? "字段类型已闭合" : "字段类型未闭合",
    summary.selectorHelperStaticMeshFieldUsageRecovered ? "selector 字段使用已闭合" : "selector 字段使用未闭合",
    summary.resourceFieldNamesRecovered ? "资源字段名已恢复" : "资源字段名未恢复",
    summary.activeResourceSemanticsRecovered ? "active 资源语义已恢复" : "active 资源语义未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` StaticMesh selector entry：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeShaderParamsSchemaHealthSummary() {
  const summary = currentNativeShaderParamsSchemaSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.shaderParamsFieldRows || 0} 个 ShaderParams 字段`,
    `${summary.shaderParamFieldRows || 0} 个 ShaderParam 字段`,
    summary.currentShaderParamsTypeRegistrationsRecovered ? "类型注册已闭合" : "类型注册未闭合",
    summary.currentShaderParamsFieldLayoutRecovered ? "字段布局已闭合" : "字段布局未闭合",
    summary.staticMeshShaderParamsBridgeRecovered ? "StaticMesh +0x68 已接上" : "StaticMesh +0x68 未接上",
    summary.crossBuildShaderParamsLayoutAgrees ? "跨版本布局一致" : "跨版本布局不一致",
    summary.shaderParamsFieldNamesRecovered ? "字段名已恢复" : "字段名未恢复",
    summary.activeResourceSemanticsRecovered ? "active 资源语义已恢复" : "active 资源语义未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` ShaderParams schema：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeStaticMeshShaderParamsCaptureTargetHealthSummary() {
  const summary = currentNativeStaticMeshShaderParamsCaptureTargetSummary;
  if (!summary?.hookTargetRows) return "";
  const details = [
    `${summary.hookTargetRows || 0} 个 hook`,
    `${summary.opcodeRows || 0} 条 opcode`,
    summary.captureScriptGenerated ? "Frida 脚本已生成" : "Frida 脚本未生成",
    summary.levelVisualsApplySnapshotHookReady ? "LevelVisuals 快照 hook 已准备" : "LevelVisuals 快照 hook 未准备",
    summary.staticMeshSelectorFieldHooksReady ? "StaticMesh 字段 hook 已准备" : "StaticMesh 字段 hook 未准备",
    summary.shaderParamsBoundedPrefixCaptureReady ? "ShaderParams 前缀捕获已准备" : "ShaderParams 前缀捕获未准备",
    `runtime 捕获缺口 ${summary.runtimeCaptureRequiredRows || 0} 条`,
    summary.activeResourceSemanticsRecovered ? "active 资源语义已恢复" : "active 资源语义未恢复",
    summary.shaderParamsValueSemanticsRecovered ? "ShaderParams 值语义已恢复" : "ShaderParams 值语义未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` StaticMesh ShaderParams 捕获目标：${details.join(" / ")}。`;
}

function currentNativeStaticMeshShaderParamsCaptureHealthSummary() {
  const summary = currentNativeStaticMeshShaderParamsCaptureSummary;
  if (!summary) return "";
  const details = [
    `capture ${summary.captureStatus || "unknown"}`,
    summary.targetHooksReady ? "目标 hook 已准备" : "目标 hook 未准备",
    summary.readyForManualShaderParamsReview ? "人工复核就绪" : "人工复核未就绪",
    `${summary.shaderParamsListEntryRows || 0} 条 ShaderParams source key`,
    `${summary.shaderParamValueRows || 0} 条 ShaderParam 值`,
    summary.activeResourceSemanticsRecovered ? "active 资源语义已恢复" : "active 资源语义未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.captureLimitRows) details.push(`${summary.captureLimitRows} 条捕获上限命中`);
  return ` StaticMesh ShaderParams 捕获结果：${details.join(" / ")}。`;
}

function currentNativeShaderParamsValueSemanticsHealthSummary() {
  const summary = currentNativeShaderParamsValueSemanticsSummary;
  if (!summary?.opcodeRows) return "";
  const details = [
    `${summary.opcodeRows || 0} 条 opcode`,
    `${summary.componentJumpTableRows || 0} 条数量跳表`,
    summary.shaderParamsIterationRecovered ? "ShaderParams 遍历已闭合" : "ShaderParams 遍历未闭合",
    summary.shaderParamIdExtractionRecovered ? "ShaderParam id 提取已闭合" : "ShaderParam id 提取未闭合",
    summary.shaderParamComponentCountMappingRecovered ? "1-4 分量映射已闭合" : "1-4 分量映射未闭合",
    summary.sourceKeyHashRecovered ? "source key hash 已闭合" : "source key hash 未闭合",
    summary.sourceTableEntryPackingRecovered ? "source table 打包已闭合" : "source table 打包未闭合",
    summary.sourceTableFinalizerRecovered ? "source table finalizer 已闭合" : "source table finalizer 未闭合",
    summary.shaderParamIdValueSemanticsRecovered ? "ShaderParam id 语义已恢复" : "ShaderParam id 语义未恢复",
    summary.activeResourceSemanticsRecovered ? "active 资源语义已恢复" : "active 资源语义未恢复",
    summary.concreteSamplerOwnershipRecovered ? "sampler 归属已恢复" : "sampler 归属未恢复",
    summary.shaderTextureFormulaRecovered ? "shader/texture 公式已恢复" : "shader/texture 公式未恢复",
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  if (summary.componentJumpTableMismatchRows) details.push(`${summary.componentJumpTableMismatchRows} 条跳表不匹配`);
  return ` ShaderParams 值语义：${details.join(" / ")}。`;
}

function currentNativeLayoutBObjectAcCandidateDisqualificationHealthSummary() {
  const summary = currentNativeLayoutBObjectAcCandidateDisqualificationSummary;
  if (!summary?.candidateRows) return "";
  const details = [
    `${summary.disqualifiedCandidateRows || 0}/${summary.candidateRows || 0} 条候选已排除`,
    `0x210 lens flare ${summary.type210LevelVisualsLensFlareDisqualifiedRows || 0} 条`,
    `HUD_Minimap ${summary.hudMinimapCurrentOwnerDisqualifiedRows || 0} 条`,
    `${summary.directCallerRows || 0} 条直接 caller`,
    `${summary.pointerRows || 0} 条指针`,
    `${summary.exactLayoutBParticleFlagProducerRows || 0} 条精确 producer`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  if (summary.pointerMismatchRows) details.push(`${summary.pointerMismatchRows} 条 pointer 不匹配`);
  return ` layout B +0xac 候选排除：${summary.opcodeRows || 0} 条指令（${details.join(" / ")}）。`;
}

function currentNativeLayoutBObjectAcStoreCoverageHealthSummary() {
  const summary = currentNativeLayoutBObjectAcStoreCoverageSummary;
  if (!summary?.storeRows) return "";
  const details = [
    `覆盖 +0xac ${summary.objectAcOverlapRows || 0} 条`,
    `构造 seed ${summary.constructorSeedOverlapRows || 0} 条`,
    `栈临时 ${summary.stackOverlapRows || 0} 条`,
    `隐藏 producer ${summary.hiddenNonConstructorObjectAcProducerRows || 0} 条`,
    `STP 覆盖 ${summary.stpOverlapRows || 0} 条`,
    `SIMD 覆盖 ${summary.simdOverlapRows || 0} 条`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` layout B +0xac store coverage：${summary.storeRows} 条 store（${details.join(" / ")}）。`;
}

function currentNativeLayoutBObjectAcRuntimeCaptureTargetHealthSummary() {
  const summary = currentNativeLayoutBObjectAcRuntimeCaptureTargetSummary;
  if (!summary?.hookTargetRows) return "";
  const details = [
    `${summary.hookTargetRows || 0} 个 hook`,
    `${summary.opcodeRows || 0} 条 opcode`,
    summary.captureScriptGenerated ? "Frida 脚本已生成" : "Frida 脚本未生成",
    `runtime 捕获缺口 ${summary.objectAcRuntimeCaptureRequiredRows || 0} 条`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B +0xac runtime 捕获目标：${details.join(" / ")}。`;
}

function currentNativeLayoutBObjectAcRuntimeCaptureHealthSummary() {
  const summary = currentNativeLayoutBObjectAcRuntimeCaptureSummary;
  if (!summary?.targetRows) return "";
  const details = [];
  if (summary.captureStatus) details.push(runtimeCaptureStatusLabel(summary.captureStatus));
  details.push(`覆盖 ${summary.observedHookTargets || 0}/${summary.targetRows || 0} 个 hook`);
  if (summary.runtimeParticleFlagObservedEvents) details.push(`${summary.runtimeParticleFlagObservedEvents} 条 live 0x200`);
  if (summary.particleDrawMaskEvents) details.push(`${summary.particleDrawMaskEvents} 条 draw mask 0x200`);
  if (summary.layoutBObjectsWithParticleFlag) details.push(`${summary.layoutBObjectsWithParticleFlag} 个对象带 0x200`);
  if (summary.zeroForwardedFlagEvents) details.push(`${summary.zeroForwardedFlagEvents} 条 flags 置零`);
  if (summary.errorRows) details.push(`${summary.errorRows} 条错误`);
  details.push(`${summary.renderPromotionAllowedRows || 0} 条允许接管`);
  return ` layout B +0xac runtime 捕获：${summary.targetRows} 个目标（${details.join(" / ")}）。`;
}

function currentNativeLayoutBPayloadRecordLayoutHealthSummary() {
  const summary = currentNativeLayoutBPayloadRecordLayoutSummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  if (summary.targetPlus40Forwarded) details.push("target+0x40 已转发");
  if (summary.targetPayloadCopyRecovered) details.push("payload copy 已闭合");
  if (summary.payloadAndFlagSeparated) details.push("payload/flags 已分离");
  details.push(summary.payloadRecordStrideBytes === 48 ? "stride 0x30" : `stride 0x${(summary.payloadRecordStrideBytes || 0).toString(16)}`);
  details.push(summary.payloadCopiedBytes === 24 ? "payload 24 bytes" : `payload ${summary.payloadCopiedBytes || 0} bytes`);
  details.push(summary.backingPayloadFlagOffset === 24 ? "flags +0x18" : `flags +0x${(summary.backingPayloadFlagOffset || 0).toString(16)}`);
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  details.push(`${summary.renderPromotionAllowedRows || 0} 条允许接管`);
  return ` layout B payload record：${summary.opcodeRows} 条指令（${details.join(" / ")}）。`;
}

function currentNativeLayoutBVisibilityGateHealthSummary() {
  const summary = currentNativeLayoutBVisibilityGateSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.constructorDefaultStateRows) details.push("默认 state bit 已定位");
  if (summary.packedParameterRows) details.push(`${summary.packedParameterRows} 条参数包`);
  if (summary.stateBitWriterRows) details.push(`${summary.stateBitWriterRows} 条 state 位写入`);
  if (summary.managerRefreshGateRows) details.push(`${summary.managerRefreshGateRows} 条刷新 gate`);
  if (summary.gateCanPassObjectAcRows) details.push("可转发 +0xac");
  if (summary.gateCanZeroBackingFlagsRows) details.push("可置零 backing flags");
  if (summary.renderPromotionAllowedRows === 0) details.push("接管关闭");
  return ` layout B 显隐 gate：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLayoutBTargetStatusHealthSummary() {
  const summary = currentNativeLayoutBTargetStatusSummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  if (summary.targetStatusLowStateRows) details.push(`${summary.targetStatusLowStateRows} 条 target low-state`);
  if (summary.targetStatusBit200Rows) details.push(`${summary.targetStatusBit200Rows} 条 target 0x200`);
  if (summary.layoutBTargetStatusGateRows) details.push(`${summary.layoutBTargetStatusGateRows} 条 target gate`);
  if (summary.object110MirrorRows) details.push(`${summary.object110MirrorRows} 条 object+0x110 镜像`);
  if (summary.targetStatusPredicateRows) details.push(`${summary.targetStatusPredicateRows} 条 target 谓词`);
  if (summary.targetStatusSeparatedFromObjectAc) details.push("target+0x64 和 object+0xac 已分离");
  if (summary.renderPromotionAllowedRows === 0) details.push("接管关闭");
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B target 状态：${summary.opcodeRows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLayoutBRefreshModeSplitHealthSummary() {
  const summary = currentNativeLayoutBRefreshModeSplitSummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  if (summary.finalPayloadRefreshRows) details.push(`${summary.finalPayloadRefreshRows} 条 final payload`);
  if (summary.visibilityFlagRefreshRows) details.push(`${summary.visibilityFlagRefreshRows} 条显隐 flags`);
  if (summary.backingOptionalGateRows) details.push(`${summary.backingOptionalGateRows} 条 backing gate`);
  if (summary.finalRefreshPassesPayloadOnly) details.push("final 只刷 payload");
  if (summary.visibilityRefreshPassesFlagsOnly) details.push("显隐只刷 flags");
  if (summary.payloadAndFlagRefreshModesSeparated) details.push("payload/flags 模式已分离");
  if (summary.renderPromotionAllowedRows === 0) details.push("接管关闭");
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B refresh 模式：${summary.opcodeRows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLayoutBQueryApplyPathHealthSummary() {
  const summary = currentNativeLayoutBQueryApplyPathSummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  if (summary.queryWrapperRows) details.push(`${summary.queryWrapperRows} 条 query wrapper`);
  if (summary.conditionalCreateOrQueryRows) details.push(`${summary.conditionalCreateOrQueryRows} 条条件 create/query`);
  if (summary.sharedCreateRows) details.push(`${summary.sharedCreateRows} 条 shared create`);
  if (summary.visibilityGateRows) details.push(`显隐来源 ${summary.visibilityGateRows} 条`);
  if (summary.directObjectAcProducerRows === 0) details.push("+0xac producer 0 条");
  if (summary.renderPromotionAllowedRows === 0) details.push("接管关闭");
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B query/apply：${summary.opcodeRows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLayoutBSharedStructApplyHealthSummary() {
  const summary = currentNativeLayoutBSharedStructApplySummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  if (summary.wrapperRows) details.push(`${summary.wrapperRows} 条 wrapper`);
  if (summary.callerFieldLoadRows) details.push(`caller 字段 ${summary.callerFieldLoadRows} 条`);
  if (summary.specializedApplyRows) details.push(`${summary.specializedApplyRows} 条 specialized apply`);
  if (summary.commonApplyRows) details.push(`${summary.commonApplyRows} 条 common apply`);
  if (summary.commonTailRows) details.push(`${summary.commonTailRows} 条 common tail`);
  if (summary.directObjectAcProducerRows === 0) details.push("+0xac producer 0 条");
  if (summary.renderPromotionAllowedRows === 0) details.push("接管关闭");
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B shared apply：${summary.opcodeRows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLayoutBCallerStructInitializerHealthSummary() {
  const summary = currentNativeLayoutBCallerStructInitializerSummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  if (summary.defaultFieldStoreRows) details.push(`默认字段 ${summary.defaultFieldStoreRows} 条`);
  if (summary.fallbackZeroStoreRows) details.push(`fallback 清零 ${summary.fallbackZeroStoreRows} 条`);
  if (summary.visibilityControlDefaultRows === 0) details.push("显隐默认 0 条");
  if (summary.directObjectAcProducerRows === 0) details.push("+0xac producer 0 条");
  if (summary.renderPromotionAllowedRows === 0) details.push("接管关闭");
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B caller init：${summary.opcodeRows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLayoutBComponentTableEntryHealthSummary() {
  const summary = currentNativeLayoutBComponentTableEntrySummary;
  if (!summary?.tableRows) return "";
  const details = [];
  if (summary.fullCallerStructTableEntryRows) details.push(`完整 caller struct 入口 ${summary.fullCallerStructTableEntryRows} 条`);
  if (summary.compactStackHashTableEntryRows) details.push(`compact/hash 入口 ${summary.compactStackHashTableEntryRows} 条`);
  if (summary.compactConstantArgumentRows) details.push(`compact 常量参数 ${summary.compactConstantArgumentRows} 条`);
  if (summary.highCallerFieldWriterRows === 0) details.push("高位字段 writer 0 条");
  if (summary.directObjectAcProducerRows === 0) details.push("+0xac producer 0 条");
  if (summary.renderPromotionAllowedRows === 0) details.push("接管关闭");
  if (summary.tableEntryMismatchRows) details.push(`${summary.tableEntryMismatchRows} 条表项不匹配`);
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B component table：${summary.tableRows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLayoutBComponentTableOwnerHealthSummary() {
  const summary = currentNativeLayoutBComponentTableOwnerSummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  if (summary.componentTableRootRecovered) details.push("组件表 root 已恢复");
  if (summary.layoutBObjectTableSeparated) details.push("layout B 对象表已分离");
  if (summary.layoutBTypeRegistrationRows) details.push("type 0x118 注册已定位");
  if (summary.highCallerFieldWriterRows === 0) details.push("高位字段 writer 0 条");
  if (summary.directObjectAcProducerRows === 0) details.push("+0xac producer 0 条");
  if (summary.renderPromotionAllowedRows === 0) details.push("接管关闭");
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B component owner：${summary.opcodeRows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLayoutBComponentSlotRegistrationHealthSummary() {
  const summary = currentNativeLayoutBComponentSlotRegistrationSummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  if (summary.ownerRegistrationCallerRows) details.push(`owner 注册 caller ${summary.ownerRegistrationCallerRows} 条`);
  if (summary.typeIndexPublishRows) details.push("type index 已发布");
  if (summary.slotInstallerRows) details.push(`slot installer ${summary.slotInstallerRows} 条`);
  if (summary.dispatchTableRows) details.push(`dispatch 表 ${summary.dispatchTableRows} 槽`);
  if (summary.fullCallerStructDispatchRows) details.push(`full caller wrapper ${summary.fullCallerStructDispatchRows} 槽`);
  if (summary.compactStackHashDispatchRows) details.push(`compact/hash ${summary.compactStackHashDispatchRows} 槽`);
  if (summary.callerStructRuntimeProducerRows === 0) details.push("caller struct runtime producer 0 条");
  if (summary.directObjectAcProducerRows === 0) details.push("+0xac producer 0 条");
  if (summary.renderPromotionAllowedRows === 0) details.push("接管关闭");
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B component slot 注册：${summary.opcodeRows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLayoutBDirectCallerStructBuilderHealthSummary() {
  const summary = currentNativeLayoutBDirectCallerStructBuilderSummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  if (summary.fullCallerStructWriterRecoveredRows) {
    details.push(`真实 caller writer ${summary.fullCallerStructWriterRecoveredRows} 条`);
  }
  if (summary.directBab250CallRows) details.push(`bab250 ${summary.directBab250CallRows} 条`);
  if (summary.directBab514CallRows) details.push(`bab514 ${summary.directBab514CallRows} 条`);
  if (summary.dynamicCallerFieldHelperRows) details.push(`动态字段 helper ${summary.dynamicCallerFieldHelperRows} 条`);
  if (summary.indirectTableEntryCoverageRows) {
    details.push(`表驱动入口 ${summary.indirectTableEntryCoverageRows} 条`);
  } else {
    details.push("间接表入口未覆盖");
  }
  if (summary.directObjectAcProducerRows === 0) details.push("+0xac producer 0 条");
  if (summary.renderPromotionAllowedRows === 0) details.push("接管关闭");
  if (summary.indirectTableEntryMismatchRows) details.push(`${summary.indirectTableEntryMismatchRows} 条表项不匹配`);
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B caller writer：${summary.opcodeRows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLayoutBResourceCallerDynamicFieldsHealthSummary() {
  const summary = currentNativeLayoutBResourceCallerDynamicFieldsSummary;
  if (!summary?.opcodeRows) return "";
  const details = [];
  if (summary.helperBlockRows) details.push(`helper ${summary.helperBlockRows} 段`);
  if (summary.dynamicCallerFieldRows) details.push(`动态 caller 字段 ${summary.dynamicCallerFieldRows} 条`);
  if (summary.callbackDispatchRows) details.push(`callback dispatch ${summary.callbackDispatchRows} 条`);
  if (summary.resourceNameCallbackRows) details.push(`resource name callback ${summary.resourceNameCallbackRows} 条`);
  if (summary.vectorCallbackRows) details.push(`vector callback ${summary.vectorCallbackRows} 条`);
  if (summary.scalarCallbackRows) details.push(`scalar callback ${summary.scalarCallbackRows} 条`);
  if (summary.commonApplyConsumerRecovered) details.push("common apply 消费已闭合");
  if (summary.dynamicFieldsReachCommonApply) details.push("动态字段已接 common apply");
  if (summary.directObjectAcProducerRows === 0) details.push("+0xac producer 0 条");
  if (summary.renderPromotionAllowedRows === 0) details.push("接管关闭");
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B resource caller 动态字段：${summary.opcodeRows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLayoutBCommonApplySetterFieldsHealthSummary() {
  const summary = currentNativeLayoutBCommonApplySetterFieldsSummary;
  if (!summary?.setterOpcodeRows) return "";
  const details = [];
  if (summary.setterBlockRows) details.push(`setter ${summary.setterBlockRows} 段`);
  if (summary.objectStoreRows) details.push(`对象字段写入 ${summary.objectStoreRows} 条`);
  if (summary.uniqueObjectStoreOffsets) details.push(`写入偏移 ${summary.uniqueObjectStoreOffsets} 个`);
  if (summary.objectA8LowWordStoreRows) details.push(`+0xa8 低位写入 ${summary.objectA8LowWordStoreRows} 条`);
  if (summary.object10cFlagRows) details.push(`+0x10c 状态 ${summary.object10cFlagRows} 条`);
  if (summary.object110StateRows) details.push(`+0x110 状态 ${summary.object110StateRows} 条`);
  if (summary.commonApplySetterFieldsRecovered) details.push("setter 字段已闭合");
  if (summary.objectAcStoreRows === 0) details.push("+0xac 写入 0 条");
  if (summary.objectAcParticleMaskProducerRows === 0) details.push("0x200 producer 0 条");
  if (summary.renderPromotionAllowedRows === 0) details.push("接管关闭");
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  return ` layout B common apply setter：${summary.setterOpcodeRows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLayoutBObjectAcProducerGateHealthSummary() {
  const summary = currentNativeLayoutBObjectAcProducerGateSummary;
  if (!summary?.sourceRows) return "";
  const details = [
    `${summary.negativeClosedRows || 0} 条静态 gate 已排除`,
    `${summary.staticExactProducerRows || 0} 条静态 producer`,
    `${summary.runtimeObservedProducerRows || 0} 条 live 0x200`,
  ];
  if (summary.staticDirectStoreGateClosed) details.push("直接/宽写已封口");
  if (summary.directOwnerTraceGateClosed) details.push("owner trace 已封口");
  if (summary.callerStructApplyGateClosed) details.push("caller/apply 已封口");
  if (summary.runtimeCaptureStatus) details.push(runtimeCaptureStatusLabel(summary.runtimeCaptureStatus));
  if (summary.remainingProofRoute === "runtime-capture-required") details.push("下一步需要 runtime 捕获");
  if (summary.renderPromotionAllowedRows === 0) details.push("接管关闭");
  return ` layout B +0xac producer gate：${summary.sourceRows} 个来源（${details.join(" / ")}）。`;
}

function currentNativePositionSamplerOwnerHealthSummary() {
  const summary = currentNativePositionSamplerOwnerSummary;
  if (!summary?.instructionEvidence) return "";
  const details = [];
  if (summary.sceneEntityRecordEntrySourceRecovered) details.push("entry 源已定位");
  if (summary.sceneEntityRecordEntryRenderOwnerBuilderLinked) details.push("render owner 已定位");
  if (summary.sceneEntityRecordEntryX4TransformProviderRecovered) details.push("transform provider 已定位");
  if (summary.sceneEntityRecordEntryHelperDispatchRecovered) details.push("helper dispatch 已定位");
  if (summary.resourceContextDispatchRecovered) details.push("resource context 已定位");
  if (summary.sceneEntityRuntimeParamSlot0VtableRecovered) details.push("runtime param slot0 已定位");
  if (summary.sceneEntityRuntimeParamSourceMappingRecovered) details.push("source 映射已定位");
  if (summary.sceneEntityRuntimeParamSourceTableProgramRecovered) details.push("program table 已定位");
  if (summary.sceneEntityRuntimeParamSortKeyFormulaRecovered) details.push("sort key 公式已定位");
  if (summary.renderCommandQueueSortKeyRecovered) details.push("队列排序 key 已定位");
  if (summary.renderCommandClassesWithTransformCopyEvidence) {
    details.push(`${summary.renderCommandClassesWithTransformCopyEvidence} 类 render command`);
  }
  if (summary.instructionOpcodeMismatches) details.push(`${summary.instructionOpcodeMismatches} 条 opcode 不匹配`);
  return ` Runtime 入口链：${summary.instructionEvidence} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLevelRuntimeOwnerHealthSummary() {
  const summary = currentNativeLevelRuntimeOwnerSummary;
  if (!summary?.instructionChecks) return "";
  const details = [];
  if (summary.levelTypeDescriptorInitRecovered) details.push("Level 类型已定位");
  if (summary.activeLevelVisualsListReadConfirmed) details.push("LevelVisuals 读取已定位");
  if (summary.activeLevelSetupCallbackRegistrationRecovered) details.push("Level setup 回调已定位");
  if (summary.genericCallbackDispatchHelperActivePreviewCandidateCallsites) {
    details.push(`${summary.genericCallbackDispatchHelperActivePreviewCandidateCallsites} 个 active helper 候选`);
  }
  if (summary.levelSetupActivePreviewCandidateConcreteKeyValuesRecovered) {
    details.push("active key 已恢复");
  } else if (summary.levelSetupActivePreviewCandidatesBoundedButUnresolved) {
    details.push("active key 未恢复");
  }
  if (summary.runtimeResourceKeyPostAccessorActivePreviewCandidateCallers) {
    details.push(`${summary.runtimeResourceKeyPostAccessorActivePreviewCandidateCallers} 个缓存 key 调用点`);
  }
  if (summary.activeHeroPreviewProfileResolved) details.push("预览 Profile 已闭合");
  else details.push("预览 Profile 未闭合");
  if (summary.instructionOpcodeMismatches) details.push(`${summary.instructionOpcodeMismatches} 条 opcode 不匹配`);
  return ` Level/Profile 链：${summary.instructionChecks} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeLightProbeChainHealthSummary() {
  const summary = currentNativeLightProbeChainSummary;
  if (!summary?.targets) return "";
  const characterLitSummary = characterLitProbeBlockerSummary;
  const details = [];
  if (summary.levelVisualsLoaderRecovered) details.push("LevelVisuals loader 已定位");
  if (summary.levelVisualsApplyProcessorRecovered) details.push("apply processor 已定位");
  if (summary.sceneProbeProfilePayloadPathRecovered) details.push("Profile payload 路径已恢复");
  if (summary.sceneProbePositionSamplePathRecovered) details.push("位置采样路径已恢复");
  if (characterLitSummary?.rowsWithViewerShaderPortFormulaReady) {
    details.push(`${characterLitSummary.rowsWithViewerShaderPortFormulaReady} 行 shader 公式 ready`);
  }
  if (characterLitSummary?.rowsWithRequiredRuntimeLightBindings) {
    details.push(`${characterLitSummary.rowsWithRequiredRuntimeLightBindings} 行 runtime uniform 已闭合`);
  }
  if (characterLitSummary?.rowsBlockedOnlyByRuntimeValues) {
    details.push(`${characterLitSummary.rowsBlockedOnlyByRuntimeValues} 行只差 runtime 光照值`);
  }
  if (characterLitSummary?.rowsWithRuntimeSceneTextureSamplers) {
    details.push(`${characterLitSummary.rowsWithRuntimeSceneTextureSamplers} 行还差 scene texture`);
  }
  if (Number.isFinite(characterLitSummary?.rowsWithOrdinaryTextureSamplerGaps)) {
    details.push(`${characterLitSummary.rowsWithOrdinaryTextureSamplerGaps} 行普通贴图缺口`);
  }
  details.push(summary.activeProfilePayloadConcreteValueRecovered ? "active payload 已恢复" : "active payload 未恢复");
  details.push(summary.activeHeroPreviewProfileResolved ? "预览 Profile 已闭合" : "预览 Profile 未闭合");
  details.push(summary.rendererLightProbeTakeoverAllowed ? "light/probe 接管已开启" : "light/probe 接管关闭");
  if (summary.profilePayloadPathStatus) details.push(summary.profilePayloadPathStatus);
  return ` 光照 Probe 链：${summary.targets} 个锚点${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function currentNativeRuntimeKeySelectorCaptureTargetHealthSummary() {
  const summary = currentNativeRuntimeKeySelectorCaptureTargetSummary;
  if (!summary?.hookTargetRows) return "";
  const details = [];
  if (summary.opcodeMismatchRows) details.push(`${summary.opcodeMismatchRows} 条 opcode 不匹配`);
  else details.push("opcode 全匹配");
  if (summary.scriptEvidenceMismatchRows) details.push(`${summary.scriptEvidenceMismatchRows} 条脚本事件缺口`);
  else details.push("Frida 事件覆盖完整");
  if (summary.activePreviewKeyHooksReady) details.push("active key 捕获就绪");
  if (summary.objectBuilderBHooksReady) details.push("object-builder-B 捕获就绪");
  if (summary.typedObjectKeyHooksReady) details.push("typed-object key 捕获就绪");
  if (summary.levelVisualsHooksReady) details.push("LevelVisuals 捕获就绪");
  if (summary.lightProbeHooksReady) details.push("light/probe 样本捕获就绪");
  details.push(summary.runtimeLightProbeValuesRecovered ? "runtime 光照值已导入" : "runtime 光照值未导入");
  details.push(summary.rendererLightProbeTakeoverAllowed ? "light/probe 接管已开启" : "light/probe 接管关闭");
  return ` runtime key selector 捕获目标：${summary.hookTargetRows} 个 hook（${details.join(" / ")}）。`;
}

function runtimeKeySelectorCaptureHealthSummary() {
  const summary = runtimeKeySelectorCaptureSummary;
  if (!summary) return "";
  const gateEvidence = summary.gateEvidence || {};
  const details = [];
  if (summary.captureStatus) details.push(`capture ${summary.captureStatus}`);
  if (gateEvidence.runtimeCaptureReadinessState) details.push(`状态 ${gateEvidence.runtimeCaptureReadinessState}`);
  details.push(gateEvidence.runtimeCaptureReadyForManualReview ? "profile 捕获可复核" : "profile 捕获未闭合");
  details.push(
    gateEvidence.runtimeLightProbeCaptureReadyForManualReview ? "light/probe 捕获可复核" : "light/probe 捕获未闭合",
  );
  if (Array.isArray(gateEvidence.missingGateEvidence) && gateEvidence.missingGateEvidence.length) {
    details.push(`缺 ${gateEvidence.missingGateEvidence.join("/")}`);
  }
  details.push(summary.rendererProfileTakeoverAllowedByThisCapture ? "profile 接管可复核" : "profile 接管关闭");
  return ` runtime selector capture：${details.join(" / ")}。`;
}

function heroPreviewProfileCandidateHealthSummary() {
  const summary = heroPreviewProfileCandidateSummary;
  if (!summary) return "";
  const details = [];
  if (summary.currentNativeLevelVisualsBridgeConfirmed) details.push("LevelVisuals bridge 已确认");
  if (summary.mapViewerCandidatesWithLightfield) {
    details.push(`${summary.mapViewerCandidatesWithLightfield} 个静态 lightfield 候选`);
  }
  if (summary.runtimeSelectorCaptureStatus) details.push(`capture ${summary.runtimeSelectorCaptureStatus}`);
  if (summary.runtimeSelectorCaptureReadinessState) details.push(`状态 ${summary.runtimeSelectorCaptureReadinessState}`);
  if (summary.runtimeSelectorCaptureReadyLightProbeEvidenceSequenceCount) {
    details.push(`light/probe 序列 ${summary.runtimeSelectorCaptureReadyLightProbeEvidenceSequenceCount}`);
  }
  if (summary.runtimeSelectorCaptureLightProbeReadyForManualReview) {
    details.push("light/probe 捕获可复核");
  } else {
    details.push("light/probe 捕获未闭合");
  }
  if (Array.isArray(summary.runtimeSelectorCaptureMissingGateEvidence) && summary.runtimeSelectorCaptureMissingGateEvidence.length) {
    details.push(`缺 ${summary.runtimeSelectorCaptureMissingGateEvidence.join("/")}`);
  }
  details.push(summary.rendererProfileTakeoverAllowed ? "profile 接管已开启" : "profile 接管关闭");
  return ` 预览光照 Profile：${details.join(" / ")}。`;
}

function nativeParticleRuntimeSchemaHealthSummary() {
  const summary = nativeParticleRuntimeSchemaSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.emitterFieldRows) details.push(`${summary.emitterFieldRows} 个 emitter 字段`);
  if (summary.beamParameterRows) details.push(`${summary.beamParameterRows} 个 beam 参数`);
  if (summary.particleStateArrayRows) details.push(`${summary.particleStateArrayRows} 个状态数组`);
  if (summary.pfxEmitterRecordRows) details.push(`${summary.pfxEmitterRecordRows} 个 PFX emitter 映射`);
  if (summary.particleCallbackUpdateRows) details.push(`${summary.particleCallbackUpdateRows} 条 callback 更新`);
  if (summary.particleCallbackResolverRows) details.push(`${summary.particleCallbackResolverRows} 条 callback resolver`);
  return ` 粒子 Runtime：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function nativeParticleCallbackTableScanHealthSummary() {
  const summary = nativeParticleCallbackTableScanSummary;
  if (!summary?.candidates) return "";
  const details = [];
  if (summary.bestEntryCount) details.push(`${summary.bestEntryCount} 条`);
  if (summary.bestPfxCandidateKeyMatches) details.push(`${summary.bestPfxCandidateKeyMatches} 个 key 命中`);
  if (summary.pfxCandidateKeyMisses) details.push(`${summary.pfxCandidateKeyMisses} 个 key 缺失`);
  if (Number.isFinite(Number(summary.bestEntryCountDeltaFromReference))) {
    details.push(`与参考表差 ${summary.bestEntryCountDeltaFromReference}`);
  }
  return ` 粒子 callback 表：${summary.candidates} 个候选${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function nativeParticleCallbackSemanticsHealthSummary() {
  const summary = nativeParticleCallbackSemanticsSummary;
  if (!summary?.callbacks) return "";
  const details = Object.entries(summary.bySemanticClass || {})
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([kind, count]) => `${runtimeEffectPfxEmitterCurrentSemanticClassLabel(kind)} ${count}`);
  return ` 粒子 callback 语义：${summary.callbacks} 个 callback${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function pfxEncryptedRuntimeTargetHealthSummary() {
  const summary = pfxEncryptedRuntimeTargetSummary;
  if (!summary?.targets) return "";
  const details = [];
  if (summary.byKind?.pattern16) details.push(`${summary.byKind.pattern16} 个 pattern16`);
  if (summary.byKind?.["curve-table"]) details.push(`${summary.byKind["curve-table"]} 个曲线表`);
  if (summary.callbacks) details.push(`${summary.callbacks} 条 callback 引用`);
  return ` PFX 加密表 dump 目标：${summary.targets} 个地址${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function pfxNativeCallbackRuntimeTargetHealthSummary() {
  const summary = pfxNativeCallbackRuntimeTargetSummary;
  if (!summary?.targets) return "";
  const details = [];
  if (summary.sourceRows) details.push(`${summary.sourceRows} 条 shape 阻塞`);
  if (summary.callbackContexts) details.push(`${summary.callbackContexts} 个 callback 上下文`);
  if (summary.effectTokens) details.push(`${summary.effectTokens} 个特效`);
  if (summary.pfxPaths) details.push(`${summary.pfxPaths} 个 PFX`);
  return ` PFX native callback 捕获目标：${summary.targets} 个函数${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function runtimeCaptureStatusLabel(status) {
  return (
    {
      "capture-missing": "未导入捕获",
      "capture-empty": "捕获为空",
      "no-target-events": "未命中目标",
      "partial-target-coverage": "部分覆盖",
      "ready-for-manual-callback-review": "可人工复核",
      "ready-for-runtime-value-review": "可复核 runtime 值流",
      "ready-for-full-mapping-review": "可完整复核",
    }[status] || status
  );
}

function pfxNativeCallbackCaptureHealthSummary() {
  const summary = pfxNativeCallbackCaptureSummary;
  if (!summary?.targetRows) return "";
  const details = [];
  if (summary.captureStatus) details.push(runtimeCaptureStatusLabel(summary.captureStatus));
  if (summary.completedSamples) details.push(`${summary.completedSamples} 个成对样本`);
  if (summary.missingTargetRows) details.push(`${summary.missingTargetRows} 个目标未覆盖`);
  if (summary.errorRows) details.push(`${summary.errorRows} 条错误`);
  return ` PFX native callback 捕获：${summary.targetRows} 个目标${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function effectNativeChannelCaptureTargetHealthSummary() {
  const summary = effectNativeChannelCaptureTargetSummary;
  if (!summary?.targets) return "";
  const details = [];
  if (summary.candidateRows) details.push(`${summary.candidateRows} 条候选`);
  if (summary.hookableRows) details.push(`${summary.hookableRows} 条 iOS hook 上下文`);
  if (summary.skippedNonIosRows) details.push(`${summary.skippedNonIosRows} 条非 iOS 来源`);
  if (summary.effectTokens) details.push(`${summary.effectTokens} 个特效`);
  return ` 原生特效通道捕获目标：${summary.targets} 个函数${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function effectNativeChannelCaptureHealthSummary() {
  const summary = effectNativeChannelCaptureSummary;
  if (!summary?.targetRows) return "";
  const details = [];
  if (summary.captureStatus) details.push(runtimeCaptureStatusLabel(summary.captureStatus));
  if (summary.completedSamples) details.push(`${summary.completedSamples} 个成对样本`);
  if (summary.completeArgumentSnapshotTargets) details.push(`${summary.completeArgumentSnapshotTargets} 个目标带实参快照`);
  if (summary.readableArgumentRows) details.push(`${summary.readableArgumentRows} 条可读实参`);
  if (summary.completeReturnValueTargets) details.push(`${summary.completeReturnValueTargets} 个目标带返回值`);
  if (summary.missingTargetRows) details.push(`${summary.missingTargetRows} 个目标未覆盖`);
  if (summary.errorRows) details.push(`${summary.errorRows} 条错误`);
  return ` 原生特效通道捕获：${summary.targetRows} 个目标${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function effectChannelStaticResourceAuditHealthSummary() {
  const summary = effectChannelStaticResourceAuditSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.gapCandidateRows) details.push(`${summary.gapCandidateRows} 条多候选`);
  if (summary.tokenOnlyNoResourceRows) details.push(`${summary.tokenOnlyNoResourceRows} 条 token-only 无资源`);
  else if (summary.noStaticResourceEvidenceRows) details.push(`${summary.noStaticResourceEvidenceRows} 条无静态资源证据`);
  if (summary.selectorPairOnlyRows) details.push(`${summary.selectorPairOnlyRows} 条仅 selector 成对 token`);
  if (summary.cff0OnlyRows) details.push(`${summary.cff0OnlyRows} 条仅 CFF0 token`);
  if (summary.exactPfxTokenRows) details.push(`${summary.exactPfxTokenRows} 条 PFX token 不唯一`);
  return ` 特效静态资源审计：${summary.rows} 条 unresolved${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function nativeEffectTokenOnlyCallsiteAuditHealthSummary() {
  const summary = nativeEffectTokenOnlyCallsiteAuditSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.builderRuntimeCreateBridgeRows) details.push(`${summary.builderRuntimeCreateBridgeRows} 条 builder 已追到 create`);
  if (summary.kindredHashResolvedRows) details.push(`${summary.kindredHashResolvedRows} 条命中 KindredEffects hash`);
  if (summary.kindredHashMissingRows) details.push(`${summary.kindredHashMissingRows} 条 hash 缺口`);
  if (summary.selectorOutputRows) details.push(`${summary.selectorOutputRows} 条 selector 输出`);
  if (summary.spawnRows) details.push(`${summary.spawnRows} 条 spawn helper`);
  if (summary.resourceLiteralRows) details.push(`${summary.resourceLiteralRows} 条资源字面量需复核`);
  if (summary.missingFunctionRows) details.push(`${summary.missingFunctionRows} 条函数未定位`);
  if (summary.renderPromotionAllowed === false) details.push("接管关闭");
  return ` 原生 token-only 特效链：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function nativeEffectHashMissingOwnerAuditHealthSummary() {
  const summary = nativeEffectHashMissingOwnerAuditSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.spawnedCharacterDefinitionOwnerRows) details.push(`${summary.spawnedCharacterDefinitionOwnerRows} 条角色定义 owner`);
  if (summary.stateOrBuffOwnerUnresolvedRows) details.push(`${summary.stateOrBuffOwnerUnresolvedRows} 条状态/BUFF owner 未闭合`);
  if (summary.unresolvedOwnerRows) details.push(`${summary.unresolvedOwnerRows} 条 owner 未定位`);
  if (summary.renderPromotionAllowed === false) details.push("接管关闭");
  return ` 原生 hash 缺口 owner：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function kindredHashPfxRuntimeGateAuditHealthSummary() {
  const summary = kindredHashPfxRuntimeGateAuditSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.pfxManifestFoundRows) details.push(`${summary.pfxManifestFoundRows} 条 PFX 已入表`);
  if (summary.rendererLinkNeededRows) details.push(`${summary.rendererLinkNeededRows} 条待接 renderer/lifecycle`);
  if (summary.createChainUnresolvedRows) details.push(`${summary.createChainUnresolvedRows} 条 create 链未闭合`);
  if (summary.blockedByExactGapRows) details.push(`${summary.blockedByExactGapRows} 条当前 gap 阻止`);
  if (summary.renderPromotionAllowed === false) details.push("接管关闭");
  return ` Kindred PFX gate：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function kindredEffectComponentRuntimeChainAuditHealthSummary() {
  const summary = kindredEffectComponentRuntimeChainAuditSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.closedEvidenceRows) details.push(`${summary.closedEvidenceRows} 条原生证据闭合`);
  if (summary.missingEvidenceRows) details.push(`${summary.missingEvidenceRows} 条证据缺口`);
  if (summary.closedRenderSubmitRows) details.push(`${summary.closedRenderSubmitRows} 条 render submit 闭合`);
  if (summary.pfxGateRendererLinkNeededRows) details.push(`${summary.pfxGateRendererLinkNeededRows} 条 PFX 待接 renderer/lifecycle`);
  if (summary.pfxGateCreateChainUnresolvedRows) details.push(`${summary.pfxGateCreateChainUnresolvedRows} 条 create 链未闭合`);
  if (summary.renderPromotionAllowed === false) details.push("接管关闭");
  return ` Kindred component runtime 链：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function kindredCurrentParticleBridgeAuditHealthSummary() {
  const summary = kindredCurrentParticleBridgeAuditSummary;
  if (!summary?.rows) return "";
  const details = [];
  if (summary.crossBuildComponentShapeRecovered) details.push("旧版 component 字段对齐");
  if (summary.currentLayoutBComponentShapeRecovered) details.push("当前 layout B 字段对齐");
  if (summary.currentEntryRenderOwnerBuilderLinked) details.push("render owner 已并链");
  if (summary.currentParticleDrawBatchRecovered) details.push("particle draw batch 已定位");
  details.push(`${summary.exactLayoutBParticleFlagProducerRows || 0} 条 +0xac 精确 producer`);
  if (!summary.pfxEmitterManagerEntryOwnerRecovered) details.push("PFX/emitter owner 未闭合");
  if (summary.blockedRows) details.push(`${summary.blockedRows} 条阻塞`);
  if (summary.renderPromotionAllowed === false) details.push("接管关闭");
  return ` Kindred 当前粒子 bridge：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function nativeOptionArgKindLabel(kind) {
  return (
    {
      "numeric-direct": "直接数值",
      "numeric-local": "局部数值",
      "dynamic-local": "动态局部",
      callback: "回调函数",
      "callback-struct": "回调结构",
      "callback-local": "局部回调",
      expression: "表达式",
      local: "局部值",
    }[kind] || kind
  );
}

function nativeOptionArgKindHealthSummary(summary) {
  const byOffsetArgKind = summary?.byOffsetArgKind || summary?.byUnknownOffsetArgKind || {};
  const entries = Object.entries(byOffsetArgKind)
    .map(([key, count]) => {
      const match = key.match(/^(0x[0-9a-f]+):(.+)$/i);
      if (!match) return { offset: key, kind: "", count };
      return { offset: match[1], kind: match[2], count };
    })
    .sort((left, right) => right.count - left.count || left.offset.localeCompare(right.offset) || left.kind.localeCompare(right.kind))
    .slice(0, 6);
  if (!entries.length) return "";
  return entries.map((entry) => `${entry.offset} ${nativeOptionArgKindLabel(entry.kind)} ${entry.count}`).join("，");
}

function nativeOptionArgSourceHealthSummary(summary) {
  const byOffsetArgSourceKind = summary?.byOffsetArgSourceKind || summary?.byUnknownOffsetArgSourceKind || {};
  const entries = Object.entries(byOffsetArgSourceKind)
    .map(([key, count]) => {
      const match = key.match(/^(0x[0-9a-f]+):(.+)$/i);
      if (!match) return { offset: key, kind: "", count };
      return { offset: match[1], kind: match[2], count };
    })
    .sort((left, right) => right.count - left.count || left.offset.localeCompare(right.offset) || left.kind.localeCompare(right.kind))
    .slice(0, 6);
  if (!entries.length) return "";
  return entries.map((entry) => `${entry.offset} ${nativeOptionArgKindLabel(entry.kind)} ${entry.count}`).join("，");
}

function runtimeEffectShapeInputLabel(kind) {
  return (
    {
      "candidate-key": "callback key",
      "packed-literal": "packed 常量",
      "(none)": "未解析",
    }[kind] || kind
  );
}

function runtimeEffectAreaShapeBlockClassLabel(kind) {
  return (
    {
      "blocked-encrypted-callback-data": "callback 常量/曲线未读",
      "blocked-ios-encrypted-pattern16-data": "iOS 加密 pattern16 常量",
      "blocked-ios-encrypted-curve-table-data": "iOS 加密曲线表",
      "blocked-ios-encrypted-pattern-curve-data": "iOS 加密 pattern/曲线",
      "blocked-callback-data-unreadable": "callback 数据不可读",
      "blocked-cross-build-callback-key": "跨 build callback key",
      "blocked-packed-literal-sign": "packed 符号未解",
      "blocked-packed-literal-layout": "packed 布局未解",
      "blocked-native-percent-param-callback": "native percent 需 callback",
      "blocked-unresolved-output-store": "输出槽未定位",
      "blocked-random-range-callback": "随机范围 callback",
      "blocked-dependent-source-array-callback": "依赖源数组 callback",
      "blocked-non-particle-output-callback": "非粒子输出 callback",
      "blocked-large-constant-callback": "过大常量 callback",
      "blocked-dynamic-timeline-size-callback": "动态时间尺寸 callback",
      "blocked-zero-size-callback": "零尺寸 callback",
      "blocked-fallback-zero-size-callback": "fallback 零尺寸证据",
      "blocked-computed-size-callback": "计算 callback 未解",
      "blocked-unknown-shape-callback": "未知 shape callback",
    }[kind] || kind
  );
}

function runtimeEffectAreaShapeRuntimeRequirementLabel(kind) {
  return (
    {
      "requires-runtime-overlay": "需要 runtime overlay",
      "requires-native-callback-runtime": "需要 native callback runtime",
      "requires-native-percent-runtime": "需要 native percent runtime",
      "requires-shape-callback-semantics": "需要 shape callback 语义",
      "runtime-hidden": "运行时隐藏",
    }[kind] || kind
  );
}

function runtimeEffectPackedLiteralSignLabel(kind) {
  return (
    {
      negative: "负值 packed",
      positive: "正值 packed",
      mixed: "正负混合 packed",
      zero: "零值 packed",
      "(none)": "非 packed",
    }[kind] || kind
  );
}

function runtimeEffectReadStatusLabel(kind) {
  return (
    {
      "encrypted-range": "加密范围",
      "address-unmapped": "地址未映射",
      "file-offset-out-of-range": "文件偏移越界",
      "unsupported-binary": "不支持的二进制",
      "missing-binary": "缺二进制",
      "invalid-address": "地址无效",
    }[kind] || kind
  );
}

function runtimeEffectCallbackEvidenceSourceLabel(kind) {
  return (
    {
      "ghidra-source": "Ghidra 函数",
      "ghidra-source-containing": "Ghidra 大函数",
      "objdump-exact": "精确反汇编",
      "objdump-exact-source-containing": "精确反汇编 fallback",
      "missing-source": "缺源码",
      "(none)": "无",
    }[kind] || kind
  );
}

function runtimeEffectCountMapSummary(counts, labelForKey, limit = 4) {
  const entries = Object.entries(counts || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
  if (!entries.length) return "";
  return entries.map(([key, count]) => `${labelForKey(key)} ${count}`).join("，");
}

function runtimeEffectHookHealthSummary() {
  const summary = runtimeEffectHookSummary;
  if (!summary?.rows) return "";
  const bindKind = summary.byBindKind || {};
  const source = summary.bySourceKind || {};
  const nativeOptionSummary = runtimeEffectNativeOptionProfileSummary;
  const gapSummary = runtimeEffectGapSummary;
  const definitionNeighborhoodSummary = runtimeEffectDefinitionNeighborhoodSummary;
  const effectRuntimeSchemaSummary = nativeEffectRuntimeSchemaSummary;
  const effectRuntimeLinksSummary = nativeEffectRuntimeLinksSummary;
  const cff0EffectSummary = cff0EffectInstanceGraphSummary;
  const cff0GapSummary = cff0EffectInstanceGapSummary;
  const nativeOptionOffsets = Object.entries(nativeOptionSummary?.byUnknownOffset || nativeOptionSummary?.byOffset || {})
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([offset, count]) => `${offset}:${count}`)
    .join("/");
  const details = [];
  if (summary.resourceBoundRows) details.push(`${summary.resourceBoundRows} 条资源已绑定`);
  if (summary.visibleOrActiveRows) details.push(`${summary.visibleOrActiveRows} 条可见/激活`);
  if (summary.abilityContextRows) details.push(`${summary.abilityContextRows} 条技能上下文`);
  if (summary.resourceCandidateRows) details.push(`${summary.resourceCandidateRows} 条资源候选`);
  if (gapSummary?.selectorOutputPairedRows) details.push(`${gapSummary.selectorOutputPairedRows} 条 selector 同组资源`);
  if (gapSummary?.selectorOutputMissingPairRows) details.push(`${gapSummary.selectorOutputMissingPairRows} 条 selector 成对缺资源`);
  if (gapSummary?.globalResourceCandidateRows) details.push(`${gapSummary.globalResourceCandidateRows} 条全局资源候选`);
  if (gapSummary?.definitionExtraResourceRootRows) details.push(`${gapSummary.definitionExtraResourceRootRows} 条定义额外 root`);
  if (gapSummary?.nativeEffectChannelRows) details.push(`${gapSummary.nativeEffectChannelRows} 条 native 通道缺资源`);
  if (gapSummary?.effectRuntimePreviewTakeoverAllowed === false) {
    details.push(`特效预览门禁未开${gapSummary.effectRuntimePreviewBlockedRows ? ` ${gapSummary.effectRuntimePreviewBlockedRows} 条` : ""}`);
  }
  if (gapSummary?.areaShapeGapRows) details.push(`${gapSummary.areaShapeGapRows} 条 PFX 面片缺 shape 参数`);
  if (gapSummary?.areaShapeRuntimeOverlayRequiredRows) {
    details.push(
      `${gapSummary.areaShapeRuntimeOverlayRequiredRows} 条 PFX 需要 runtime overlay${
        gapSummary.areaShapeRuntimeOverlayRequiredPfxPaths ? `（${gapSummary.areaShapeRuntimeOverlayRequiredPfxPaths} 个 PFX）` : ""
      }`,
    );
  }
  if (gapSummary?.areaShapeRuntimeHiddenRows) details.push(`${gapSummary.areaShapeRuntimeHiddenRows} 条 PFX 面片 runtime 隐藏`);
  const shapeRuntimeRequirementSummary = runtimeEffectCountMapSummary(
    gapSummary?.byAreaShapeGapRuntimeRequirement,
    runtimeEffectAreaShapeRuntimeRequirementLabel,
    4,
  );
  if (shapeRuntimeRequirementSummary) details.push(`shape runtime：${shapeRuntimeRequirementSummary}`);
  const shapeBlockSummary = runtimeEffectCountMapSummary(
    gapSummary?.byAreaShapeGapBlockClass,
    runtimeEffectAreaShapeBlockClassLabel,
    8,
  );
  if (shapeBlockSummary) details.push(`shape 阻断：${shapeBlockSummary}`);
  const shapeFallbackEvidenceSummary = runtimeEffectCountMapSummary(
    gapSummary?.byAreaShapeGapSizeCallbackFallbackEvidenceSource,
    runtimeEffectCallbackEvidenceSourceLabel,
    4,
  );
  if (shapeFallbackEvidenceSummary) details.push(`shape fallback 证据：${shapeFallbackEvidenceSummary}`);
  const shapeInputSummary = runtimeEffectCountMapSummary(
    gapSummary?.byAreaShapeGapSizeCallbackResolverInputKind,
    runtimeEffectShapeInputLabel,
  );
  if (shapeInputSummary) details.push(`shape 输入 ${shapeInputSummary}`);
  const packedSignSummary = runtimeEffectCountMapSummary(
    gapSummary?.byAreaShapeGapSizeCallbackPackedLiteralSign,
    runtimeEffectPackedLiteralSignLabel,
    3,
  );
  if (packedSignSummary) details.push(`shape packed：${packedSignSummary}`);
  const pattern16ReadStatusSummary = runtimeEffectCountMapSummary(
    gapSummary?.byAreaShapeGapPattern16ReadStatus,
    runtimeEffectReadStatusLabel,
    3,
  );
  if (pattern16ReadStatusSummary) details.push(`shape 常量读取 ${pattern16ReadStatusSummary}`);
  const curveTableReadStatusSummary = runtimeEffectCountMapSummary(
    gapSummary?.byAreaShapeGapCurveTableReadStatus,
    runtimeEffectReadStatusLabel,
    3,
  );
  if (curveTableReadStatusSummary) details.push(`shape 曲线读取 ${curveTableReadStatusSummary}`);
  const unresolvedShapeOutputStores = gapSummary?.byAreaShapeGapCurrentStore?.["(none)"];
  if (unresolvedShapeOutputStores) details.push(`shape 输出未定位 ${unresolvedShapeOutputStores}`);
  const unresolvedShapeOutputKindSummary = runtimeEffectCountMapSummary(
    gapSummary?.byAreaShapeGapMissingCurrentStoreResolverInputKind,
    runtimeEffectShapeInputLabel,
    3,
  );
  if (unresolvedShapeOutputKindSummary) details.push(`输出未定位类型 ${unresolvedShapeOutputKindSummary}`);
  if (gapSummary?.areaShapeNativePercentParamRows) {
    details.push(`${gapSummary.areaShapeNativePercentParamRows} 条 native percent 参数但缺 shape`);
  }
  if (gapSummary?.nativePrimitiveRenderableRows) details.push(`${gapSummary.nativePrimitiveRenderableRows} 条原生图元已分类`);
  if (gapSummary?.nativeNearbyTokenRows) details.push(`${gapSummary.nativeNearbyTokenRows} 条 native 邻近字符串`);
  if (definitionNeighborhoodSummary?.definitionLinkedRows) {
    details.push(`${definitionNeighborhoodSummary.definitionLinkedRows} 条 native 定义链追踪`);
  }
  if (definitionNeighborhoodSummary?.sourcePfxLinkedRows) {
    details.push(`${definitionNeighborhoodSummary.sourcePfxLinkedRows} 条 source PFX 线索`);
  }
  if (definitionNeighborhoodSummary?.nearbyPfxLinkedRows) {
    details.push(`${definitionNeighborhoodSummary.nearbyPfxLinkedRows} 条邻接 PFX 线索`);
  }
  if (definitionNeighborhoodSummary?.pfxSlotLinkedRows) {
    details.push(`${definitionNeighborhoodSummary.pfxSlotLinkedRows} 条 PFX 槽位证据`);
  }
  if (effectRuntimeSchemaSummary?.schemaRows) {
    const byType = effectRuntimeSchemaSummary.byType || {};
    const schemaDetails = [];
    if (byType.StaticPfx) schemaDetails.push(`StaticPfx ${byType.StaticPfx}`);
    if (byType.LevelVisuals) schemaDetails.push(`LevelVisuals ${byType.LevelVisuals}`);
    details.push(
      `${effectRuntimeSchemaSummary.schemaRows} 个 native 特效结构字段${schemaDetails.length ? `（${schemaDetails.join(" / ")}）` : ""}`,
    );
  }
  if (effectRuntimeLinksSummary?.rows) {
    const linkDetails = [];
    if (effectRuntimeLinksSummary.levelVisualsStaticPfxSlots) {
      linkDetails.push(`LevelVisuals->StaticPfx ${effectRuntimeLinksSummary.levelVisualsStaticPfxSlots}`);
    }
    if (effectRuntimeLinksSummary.levelVisualsLensFlareSlots) {
      linkDetails.push(`LevelVisuals->StaticLensFlare ${effectRuntimeLinksSummary.levelVisualsLensFlareSlots}`);
    }
    if (effectRuntimeLinksSummary.menuMeshOmniLightSlots) {
      linkDetails.push(`MenuMeshData->MenuMeshOmniLight ${effectRuntimeLinksSummary.menuMeshOmniLightSlots}`);
    }
    details.push(`${effectRuntimeLinksSummary.rows} 条结构链${linkDetails.length ? `（${linkDetails.join(" / ")}）` : ""}`);
  }
  if (cff0EffectSummary?.rows) {
    const instanceDetails = [];
    if (cff0EffectSummary.resourceBoundRows) instanceDetails.push(`${cff0EffectSummary.resourceBoundRows} 条已挂 PFX`);
    if (cff0EffectSummary.objectRefExpandedRows) {
      instanceDetails.push(`${cff0EffectSummary.objectRefExpandedRows} 条显式引用展开`);
    }
    if (cff0EffectSummary.runtimeResourceLinkedRows) {
      instanceDetails.push(`${cff0EffectSummary.runtimeResourceLinkedRows} 条 runtime 资源`);
    }
    if (cff0EffectSummary.nativeHookLinkedRows) {
      instanceDetails.push(`${cff0EffectSummary.nativeHookLinkedRows} 条 native hook`);
    }
    if (cff0EffectSummary.nativeActionLinkedRows) {
      instanceDetails.push(`${cff0EffectSummary.nativeActionLinkedRows} 条 native action`);
    }
    if (cff0EffectSummary.nativeTimingLinkedRows) {
      instanceDetails.push(`${cff0EffectSummary.nativeTimingLinkedRows} 条 native 时机`);
    }
    if (cff0EffectSummary.projectileBindingLinkedRows) {
      instanceDetails.push(`${cff0EffectSummary.projectileBindingLinkedRows} 条 projectile binding`);
    }
    if (cff0EffectSummary.projectileBoneLinkedRows) {
      instanceDetails.push(`${cff0EffectSummary.projectileBoneLinkedRows} 条 projectile 发射点`);
    }
    if (cff0EffectSummary.projectileTimingLinkedRows) {
      instanceDetails.push(`${cff0EffectSummary.projectileTimingLinkedRows} 条 projectile 时机`);
    }
    if (
      cff0EffectSummary.resolvedResourceLinkedRows ||
      cff0EffectSummary.resolvedActionLinkedRows ||
      cff0EffectSummary.resolvedBindingLinkedRows ||
      cff0EffectSummary.resolvedTimingLinkedRows
    ) {
      instanceDetails.push(
        `resolved 覆盖：资源 ${cff0EffectSummary.resolvedResourceLinkedRows || 0} / action ${
          cff0EffectSummary.resolvedActionLinkedRows || 0
        } / 绑定 ${cff0EffectSummary.resolvedBindingLinkedRows || 0} / 时机 ${cff0EffectSummary.resolvedTimingLinkedRows || 0}`,
      );
    }
    if (cff0EffectSummary.boneLinkedRows) instanceDetails.push(`${cff0EffectSummary.boneLinkedRows} 条骨骼/绑定点`);
    if (cff0EffectSummary.runtimeAudioLinkedRows) {
      instanceDetails.push(`${cff0EffectSummary.runtimeAudioLinkedRows} 条音频上下文`);
    }
    if (cff0EffectSummary.ownerLabels) instanceDetails.push(`${cff0EffectSummary.ownerLabels} 个皮肤/模型`);
    details.push(`${cff0EffectSummary.rows} 条 CFF0 实例链${instanceDetails.length ? `（${instanceDetails.join(" / ")}）` : ""}`);
  }
  if (cff0GapSummary?.gapRows) {
    const gapDetails = [];
    if (cff0GapSummary.completeRows) gapDetails.push(`${cff0GapSummary.completeRows} 条完整`);
    if (cff0GapSummary.runtimeLinkedGapRows) gapDetails.push(`${cff0GapSummary.runtimeLinkedGapRows} runtime 断链`);
    if (cff0GapSummary.definitionOnlyGapRows) gapDetails.push(`${cff0GapSummary.definitionOnlyGapRows} 未接 native`);
    if (cff0GapSummary.missingResourceRows) gapDetails.push(`${cff0GapSummary.missingResourceRows} 缺资源`);
    if (cff0GapSummary.missingActionRows) gapDetails.push(`${cff0GapSummary.missingActionRows} 缺 action`);
    if (cff0GapSummary.missingBindingRows) gapDetails.push(`${cff0GapSummary.missingBindingRows} 缺绑定`);
    if (cff0GapSummary.missingTimingRows) gapDetails.push(`${cff0GapSummary.missingTimingRows} 缺时机`);
    details.push(`${cff0GapSummary.gapRows} 条 CFF0 缺口${gapDetails.length ? `（${gapDetails.join(" / ")}）` : ""}`);
  }
  if (gapSummary?.byReason?.["selector-output-unresolved"]) {
    details.push(`${gapSummary.byReason["selector-output-unresolved"]} 条 selector 待解析`);
  }
  if (gapSummary?.kindredCandidateRows) details.push(`${gapSummary.kindredCandidateRows} 条 Kindred 候选待收窄`);
  if (nativeOptionSummary?.optionOffsetRows || nativeOptionSummary?.rawOptionHookRows) {
    const optionDetails = [];
    const optionArgKindSummary = nativeOptionArgKindHealthSummary(nativeOptionSummary);
    const optionArgSourceSummary = nativeOptionArgSourceHealthSummary(nativeOptionSummary);
    if (nativeOptionSummary.knownOptionOffsetRows) {
      optionDetails.push(`${nativeOptionSummary.knownOptionOffsetRows} 条已命名 native 参数`);
    }
    if (nativeOptionSummary.unknownOptionOffsetRows) {
      optionDetails.push(`${nativeOptionSummary.unknownOptionOffsetRows} 条 native 参数待逆向`);
    }
    if (!optionDetails.length && nativeOptionSummary.rawOptionHookRows) {
      optionDetails.push(`${nativeOptionSummary.rawOptionHookRows} 条 native 参数待逆向`);
    }
    if (nativeOptionSummary.numericValueRows) optionDetails.push(`${nativeOptionSummary.numericValueRows} 条带数值`);
    if (nativeOptionSummary.optionArgSourceEntries) optionDetails.push(`${nativeOptionSummary.optionArgSourceEntries} 条参数来源`);
    if (nativeOptionSummary.pfxRuntimeHintMatchRows) optionDetails.push(`${nativeOptionSummary.pfxRuntimeHintMatchRows} 条 PFX 同值`);
    if (optionArgKindSummary) optionDetails.push(`参数形态 ${optionArgKindSummary}`);
    if (optionArgSourceSummary) optionDetails.push(`来源形态 ${optionArgSourceSummary}`);
    details.push(
      `${optionDetails.join("，")}${nativeOptionOffsets ? `（待逆向 ${nativeOptionOffsets}）` : ""}`,
    );
  }
  if (source["native-effect-spawn"]) details.push(`${source["native-effect-spawn"]} 条 native spawn`);
  if (source["native-effect-vcall"]) details.push(`${source["native-effect-vcall"]} 条 native vcall`);
  if (source["native-effect-selector"]) details.push(`${source["native-effect-selector"]} 条 native selector`);
  if (bindKind["direct-locator-effect"]) details.push(`${bindKind["direct-locator-effect"]} 条 locator`);
  if (bindKind["visual-bone-effect"]) details.push(`${bindKind["visual-bone-effect"]} 条骨骼视觉`);
  if (bindKind["selected-attachment-effect"]) details.push(`${bindKind["selected-attachment-effect"]} 条附件选择`);
  return ` 特效 Runtime：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function runtimeEffectProjectileBindingHealthSummary() {
  const summary = runtimeEffectProjectileRuntimeSummary;
  if (!summary?.rows) return "";
  const status = summary.byStatus || {};
  const details = [];
  if (summary.boundRows != null) details.push(`${summary.boundRows} 条已绑定`);
  if (summary.nonRuntimeRows) details.push(`${summary.nonRuntimeRows} 条仅资源库`);
  if (status["effect-library-only"] && !summary.nonRuntimeRows) details.push(`${status["effect-library-only"]} 条仅资源库`);
  if (summary.unboundRows) details.push(`${summary.unboundRows} 条缺 native`);
  if (status["native-runtime-locator-transform"]) details.push(`${status["native-runtime-locator-transform"]} 条 locator`);
  if (status["native-emitter-slot"]) details.push(`${status["native-emitter-slot"]} 条发射点`);
  if (status["native-effect-hook"]) details.push(`${status["native-effect-hook"]} 条特效挂点`);
  if (status["native-nearby-bone"]) details.push(`${status["native-nearby-bone"]} 条附近骨骼`);
  if (status["definition-bone"]) details.push(`${status["definition-bone"]} 条定义骨骼`);
  return ` 弹道绑定：${summary.rows} 条${details.length ? `（${details.join(" / ")}）` : ""}。`;
}

function runtimeEffectProjectileGapHealthSummary() {
  const summary = runtimeEffectProjectileGapSummary;
  if (!summary?.projectileDefinitions) return "";
  const details = [
    `${summary.placedProjectileDefinitions || 0} 条已有发射点/骨骼/locator`,
    `${summary.definitionOnlyProjectileDefinitions || 0} 条只有资源定义`,
    `${summary.actionMismatchProjectileDefinitions || 0} 条 action 不匹配`,
    `${summary.heroMismatchProjectileDefinitions || 0} 条 hero/别名不匹配`,
    `${summary.tokenMissingProjectileDefinitions || 0} 条 token 未覆盖`,
    `${summary.tokenMissingWithPfxCandidateRows || 0} 条 token 有 PFX 候选`,
    `${summary.noCoverageProjectileDefinitions || 0} 条没有完整 runtime 覆盖`,
  ];
  if (summary.blockingProjectileRuntimeRows) details.push(`${summary.blockingProjectileRuntimeRows} 条阻断弹道 runtime`);
  return ` 弹道 runtime 缺口：${summary.projectileDefinitions} 条 projectile 定义（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCreateBridgeHealthSummary() {
  const summary = runtimeEffectProjectileCreateBridgeSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.contextMatchedRows || 0} 条命中 native SkinRep 上下文`,
    `${summary.param2LifecycleRows || 0} 条 param_2 生命周期`,
    `${summary.runtimeFieldRows || 0} 条 runtime 字段`,
    `${summary.runtimePointerStoreRows || 0} 条 runtime 指针存储`,
    `${summary.runtimeVtablePointerRows || 0} 条 runtime vtable`,
    `${summary.targetOwnerQueryRows || 0} 条 owner/target 查询`,
    `${summary.targetVtableDispatchRows || 0} 条 target vtable 分发`,
    `${summary.missingContextRows || 0} 条仍缺 create bridge`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 create bridge：${summary.rows} 条阻断项（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileTargetDispatchHealthSummary() {
  const summary = runtimeEffectProjectileTargetDispatchSummary;
  if (!summary?.rows) return "";
  const byStatus = summary.byStatus || {};
  const details = [
    `${summary.contextMatchedRows || 0} 条命中 native 上下文`,
    `${summary.helperFactoryRows || 0} 条 helper/factory`,
    `${summary.runtimePoolRows || 0} 条 runtime 对象池`,
    `${summary.factoryVtableRows || 0} 条 factory vtable`,
    `${summary.runtimeEffectVtablePointerRows || 0} 条 runtime effect vtable`,
    `${summary.vtableOffsetRows || 0} 条 vtable offset`,
    `${summary.offset38Rows || 0} 条 offset 0x38`,
    `${summary.offset58Rows || 0} 条 offset 0x58`,
    `${summary.releaseHelperRows || 0} 条 release/commit helper`,
    `${summary.callbackCommandRows || 0} 条 callback command`,
    `${summary.callbackRegistrationRows || 0} 条 callback 注册`,
    `${summary.callbackFunctionRows || 0} 条 callback 函数`,
    `${byStatus["target-dispatch-vtable-offsets"] || 0} 条 target-dispatch-vtable-offsets`,
    `${byStatus["target-dispatch-callback-command"] || 0} 条 target-dispatch-callback-command`,
    `${byStatus["target-dispatch-finalize-only"] || 0} 条 target-dispatch-finalize-only`,
    `${byStatus["target-dispatch-helper-only"] || 0} 条 target-dispatch-helper-only/helper-only`,
    `${summary.missingContextRows || 0} 条缺 dispatch 上下文`,
    `${summary.placementPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 target dispatch：${summary.rows} 条 create bridge（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileVtableSlotHealthSummary() {
  const summary = runtimeEffectProjectileVtableSlotSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.sourceTargetDispatchRows || 0} 条 target dispatch 行`,
    `${summary.androidVtablePointerRows || 0} 个 Android vtable`,
    `${summary.exactSlotRows || 0} 条 exact slot`,
    `${summary.descriptorCompanionRows || 0} 条 descriptor companion`,
    `${summary.missingRelocationRows || 0} 条 missing relocation`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 vtable slot：${summary.rows} 条 slot 观测（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileVtableFunctionHealthSummary() {
  const summary = runtimeEffectProjectileVtableFunctionSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.sourceSlotRows || 0} 条 slot 来源`,
    `${summary.functionsInTextRows || 0} 个当前 .text 函数`,
    `${summary.disassembledFunctionRows || 0} 个已反汇编`,
    `${summary.constantOutputWriterRows || 0} 个 constant output writer`,
    `${summary.computedOutputWriterRows || 0} 个 computed output writer`,
    `${summary.helperCallFunctionRows || 0} 个 helper-call function`,
    `${summary.unclassifiedFunctionRows || 0} 个未分类函数`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 vtable 函数：${summary.rows} 个函数（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileVtableOutputLayoutHealthSummary() {
  const summary = runtimeEffectProjectileVtableOutputLayoutSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.functions || 0} 个函数`,
    `${summary.functionsWithOutputRows || 0} 个有输出写入`,
    `${summary.fixedOffsetStoreRows || 0} 条 fixed offset store`,
    `${summary.postIncrementStoreRows || 0} 条 post-increment store`,
    `${summary.helperMemsetZeroRows || 0} 条 memset 清零`,
    `${summary.aliasedOutputStoreRows || 0} 条 x1 alias 写入`,
    `${summary.zeroOutputRows || 0} 条 zero 输出`,
    `${summary.immediateOutputRows || 0} 条 immediate 输出`,
    `${summary.computedOutputRows || 0} 条 computed 输出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 output layout：${summary.rows} 条输出写入（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileVtableCallsitePayloadHealthSummary() {
  const summary = runtimeEffectProjectileVtableCallsitePayloadSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.sourceTargetDispatchRows || 0} 条 target dispatch 行`,
    `${summary.localPayloadRows || 0} 条 local payload`,
    `${summary.callbackPayloadRows || 0} 条 callback payload`,
    `${summary.stringTokenPayloadRows || 0} 条 string token payload`,
    `${summary.immediateScalarPayloadRows || 0} 条 immediate scalar`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 callsite payload：${summary.rows} 条 offset 调用（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileVtableSemanticJoinHealthSummary() {
  const summary = runtimeEffectProjectileVtableSemanticJoinSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.sourceSlotRows || 0} 条 slot 来源`,
    `${summary.uniqueFunctions || 0} 个函数`,
    `${summary.rowsWithOutputWrites || 0} 行带 output 写入`,
    `${summary.rowsWithPayloads || 0} 行带 payload`,
    `${summary.joinedOutputRows || 0} 条 output 写入关联`,
    `${summary.joinedPayloadRows || 0} 条 payload 关联`,
    `${summary.descriptorCompanionRows || 0} 条 descriptor companion`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 semantic join：${summary.rows} 条 offset/function 关联（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileConsumerTraceHealthSummary() {
  const summary = runtimeEffectProjectileConsumerTraceSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.currentStringXrefRows || 0} 条当前 token xref`,
    `${summary.rowsWithCurrentStringXrefs || 0} 行有当前 token`,
    `${summary.rowsWithCurrentVtableSemantics || 0} 行有当前 vtable 语义证据`,
    `${summary.rowsWithCrossBuildConsumerHints || 0} 行有跨版本 consumer 线索`,
    `${summary.semanticJoinRows || 0} 条 semantic join 来源`,
    `${summary.outputWriteReferenceRows || 0} 条 output 写入引用`,
    `${summary.payloadReferenceRows || 0} 条 payload 引用`,
    `${summary.currentConsumerResolvedRows || 0} 条当前 consumer 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 consumer trace：${summary.rows} 条 dispatch 行（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentTokenWindowHealthSummary() {
  const summary = runtimeEffectProjectileCurrentTokenWindowSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.currentXrefRows || 0} 个当前 token xref 窗口`,
    `${summary.currentTokenRuntimeWindowRows || 0} 个 runtime+vtable 窗口`,
    `${summary.currentTokenRuntimeFieldWindowRows || 0} 个 runtime 字段窗口`,
    `${summary.currentTokenVtableWindowRows || 0} 个 vtable 窗口`,
    `${summary.unclassifiedWindowRows || 0} 个未分类窗口`,
    `${summary.runtimeFieldReferenceRows || 0} 条 runtime 字段引用`,
    `${summary.vtableCallRows || 0} 条 vtable 调用`,
    `${summary.branchCallRows || 0} 条分支调用`,
    `${summary.currentConsumerResolvedRows || 0} 条当前 consumer 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 current token window：${summary.rows} 个当前函数窗口（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentBranchTargetHealthSummary() {
  const summary = runtimeEffectProjectileCurrentBranchTargetSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.sourceTokenWindowRows || 0} 条 token 窗口来源`,
    `${summary.sharedBranchTargetRows || 0} 个共享 branch target`,
    `${summary.fieldWriterRows || 0} 个字段写入 helper`,
    `${summary.vtableDispatchRows || 0} 个 vtable dispatch`,
    `${summary.helperRows || 0} 个继续下探 helper`,
    `${summary.unclassifiedRows || 0} 个未分类`,
    `${summary.fieldWriteReferenceRows || 0} 条字段写入引用`,
    `${summary.vtableCallRows || 0} 条 vtable 调用`,
    `${summary.directBranchRows || 0} 条下游分支`,
    `${summary.currentConsumerResolvedRows || 0} 条当前 consumer 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 branch target：${summary.rows} 个当前分支目标（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentFieldWriterCallsiteHealthSummary() {
  const summary = runtimeEffectProjectileCurrentFieldWriterCallsiteSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.fieldWriterCallsiteRows || 0} 个字段 helper 调用点`,
    `${summary.argumentBaseRecoveredRows || 0} 个 x0 base 已恢复`,
    `${summary.loadedPointerRows || 0} 个 loaded pointer`,
    `${summary.unresolvedArgumentRows || 0} 个 x0 未恢复`,
    `${summary.combinedRuntimeFieldRows || 0} 条合成 runtime 字段`,
    `${summary.uniqueCombinedRuntimeFields || 0} 个唯一 runtime 字段`,
    `${summary.currentConsumerResolvedRows || 0} 条当前 consumer 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 field writer callsite：${summary.rows} 个字段写入调用点（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentFieldReaderCandidateHealthSummary() {
  const summary = runtimeEffectProjectileCurrentFieldReaderCandidateSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.readerCandidateRows || 0} 个 reader 候选`,
    `${summary.specificReaderCandidateRows || 0} 个 specific reader 候选`,
    `${summary.genericOnlyReaderCandidateRows || 0} 个 generic-only 候选`,
    `${summary.specificFieldReadRows || 0} 条 specific 读取`,
    `${summary.genericFieldReadRows || 0} 条 generic 读取`,
    `${summary.stackReadIgnoredRows || 0} 条栈读取已忽略`,
    `${summary.directBranchRows || 0} 条下游分支`,
    `${summary.currentConsumerResolvedRows || 0} 条当前 consumer 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 field reader candidate：${summary.rows} 个当前读侧候选（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentFieldReaderCallsiteContextHealthSummary() {
  const summary = runtimeEffectProjectileCurrentFieldReaderCallsiteContextSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.readerCallsiteRows || 0} 个 reader 调用点`,
    `${summary.specificReaderCallsiteRows || 0} 个 specific 调用点`,
    `${summary.genericOnlyReaderCallsiteRows || 0} 个 generic-only 调用点`,
    `${summary.argumentBaseRecoveredRows || 0} 个 x0 base 已恢复`,
    `${summary.unresolvedArgumentRows || 0} 个 x0 未恢复`,
    `${summary.previousBranchRows || 0} 条前置分支`,
    `${summary.followingBranchRows || 0} 条后续分支`,
    `${summary.followingVtableCallRows || 0} 条后续 vtable 调用`,
    `${summary.currentConsumerResolvedRows || 0} 条当前 consumer 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 field reader callsite：${summary.rows} 个读侧调用点上下文（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentFieldReaderDownstreamRouteHealthSummary() {
  const summary = runtimeEffectProjectileCurrentFieldReaderDownstreamRouteSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.specificRouteRows || 0} 条 specific route`,
    `${summary.containerAppendRows || 0} 条容器链表 append`,
    `${summary.objectAppendRows || 0} 条对象链表 append`,
    `${summary.objectAllocatorRows || 0} 条对象分配器`,
    `${summary.primaryVtableResolvedRows || 0} 条主 vtable 已解析`,
    `${summary.vtableSlotResolvedRows || 0} 条 vtable slot 已解析`,
    `${summary.accessorOnlySlotRows || 0} 条 accessor-only slot`,
    `${summary.currentConsumerResolvedRows || 0} 条当前 consumer 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 field reader downstream：${summary.rows} 条读侧下游 route（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentFieldReaderListDispatchHealthSummary() {
  const summary = runtimeEffectProjectileCurrentFieldReaderListDispatchSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.readerBranchTargetRows || 0} 个 reader branch`,
    `${summary.listDispatchFunctionRows || 0} 个链表 dispatch 函数`,
    `${summary.childVtableSlotRows || 0} 条子 vtable dispatch`,
    `${summary.uniqueChildVtableSlots || 0} 个唯一子槽`,
    `${summary.resolvedChildSlotRows || 0} 条子槽已解析`,
    `${summary.retOnlyChildSlotRows || 0} 条 ret-only`,
    `${summary.deleteBranchChildSlotRows || 0} 条 delete 分支`,
    `${summary.missingChildSlotRelocationRows || 0} 条子槽缺 relocation`,
    `${summary.semanticConsumerResolvedRows || 0} 条语义 consumer 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 field reader list dispatch：${summary.rows} 条链表消费证据（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentTokenChildObjectChainHealthSummary() {
  const summary = runtimeEffectProjectileCurrentTokenChildObjectChainSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.objectAppendRows || 0} 条对象 append`,
    `${summary.primaryVtableResolvedRows || 0} 条主 vtable 已解析`,
    `${summary.followingSlotRows || 0} 条后续 vtable slot`,
    `${summary.resolvedFollowingSlotRows || 0} 条 slot 已解析`,
    `${summary.nonNoopFollowingSlotRows || 0} 条非 no-op 入口`,
    `${summary.callbackInstallerFollowingSlotRows || 0} 条 callback installer`,
    `${summary.payloadModeSetterFollowingSlotRows || 0} 条 payload mode setter`,
    `${summary.payloadSetterFollowingSlotRows || 0} 条 payload pointer setter`,
    `${summary.followingArgument1StringRows || 0} 条 x1 字符串`,
    `${summary.accessorOnlyFollowingSlotRows || 0} 条 accessor-only`,
    `${summary.semanticConsumerResolvedRows || 0} 条语义 consumer 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 token child object：${summary.rows} 条子对象链证据（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentTokenChildCallbackBodyHealthSummary() {
  const summary = runtimeEffectProjectileCurrentTokenChildCallbackBodySummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.sourceCallbackInstallerRows || 0} 条 callback installer 来源`,
    `${summary.uniqueCallbackBodies || 0} 个 callback body`,
    `${summary.scalarReturnCallbackRows || 0} 个标量返回 callback`,
    `${summary.argumentOutputWriterRows || 0} 个 x1 输出 callback`,
    `${summary.ownerPointerReadRows || 0} 个读取 owner 指针`,
    `${summary.helperCallRows || 0} 条 helper 调用`,
    `${summary.semanticConsumerResolvedRows || 0} 条语义 consumer 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 token callback body：${summary.rows} 个已安装回调（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentTokenChildClassMethodHealthSummary() {
  const summary = runtimeEffectProjectileCurrentTokenChildClassMethodSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.uniquePrimaryVtables || 0} 个主 vtable`,
    `${summary.sourceChildObjectRows || 0} 条子对象来源`,
    `${summary.sourceMatchedMethodRows || 0} 条 token 直接触达方法`,
    `${summary.callbackInstallerMethodRows || 0} 个 callback installer 方法`,
    `${summary.payloadModeSetterMethodRows || 0} 个 payload mode setter 方法`,
    `${summary.runtimeEvaluatorCandidateRows || 0} 个 runtime evaluator 候选`,
    `${summary.runtimeStateCandidateRows || 0} 个 runtime 状态候选`,
    `${summary.callbackSlotReaderRows || 0} 个 callback 槽位读者`,
    `${summary.helperCallRows || 0} 条 helper 调用`,
    `${summary.semanticConsumerResolvedRows || 0} 条语义 consumer 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 token class method：${summary.rows} 个 vtable 方法（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentTokenChildEvaluatorPayloadHealthSummary() {
  const summary = runtimeEffectProjectileCurrentTokenChildEvaluatorPayloadSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.sourceEvaluatorRows || 0} 个 evaluator 来源`,
    `${summary.entryPayloadConsumerRows || 0} 个入口 payload consumer`,
    `${summary.nestedPayloadConsumerRows || 0} 个嵌套 payload consumer`,
    `${summary.callbackSlotReaderRows || 0} 个 callback 槽位读者`,
    `${summary.parentInstalledCallbackSlotReaderRows || 0} 个命中 parent 已安装 callback 槽`,
    `${summary.helperCallRows || 0} 条 helper 调用`,
    `${summary.semanticConsumerResolvedRows || 0} 条语义 consumer 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 evaluator payload：${summary.rows} 个 payload consumer（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentTokenChildPayloadSetterHealthSummary() {
  const summary = runtimeEffectProjectileCurrentTokenChildPayloadSetterSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.sourcePayloadConsumerRows || 0} 个 payload consumer 来源`,
    `${summary.setterHelperRows || 0} 个 setter helper`,
    `${summary.commitHelperRows || 0} 个 commit/helper`,
    `${summary.commonApplyMatchedHelperRows || 0} 个命中 common-apply 证据`,
    `${summary.commonApplyOpcodeRows || 0} 条 common-apply opcode`,
    `${summary.commonApplyOpcodeMismatchRows || 0} 条 opcode 不匹配`,
    `${summary.objectFieldWriteRows || 0} 条对象字段写入`,
    `${summary.uniqueObjectFieldWriteOffsets || 0} 个唯一写入 offset`,
    `${summary.objectFieldReadRows || 0} 条对象字段读取`,
    `${summary.semanticConsumerResolvedRows || 0} 条语义 consumer 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 payload setter：${summary.rows} 个 helper（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentTokenChildPayloadSetterDownstreamHealthSummary() {
  const summary = runtimeEffectProjectileCurrentTokenChildPayloadSetterDownstreamSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.uniqueDownstreamTargets || 0} 个下游 target`,
    `${summary.sourcePayloadSetterHelperRows || 0} 个 setter helper 来源`,
    `${summary.layoutBObjectArgumentRows || 0} 条 layout-B object 参数`,
    `${summary.object50RuntimeArgumentRows || 0} 条 object+0x50 runtime 参数`,
    `${summary.baseTransformApplyRows || 0} 条 base transform apply`,
    `${summary.managerRuntimeRows || 0} 条 manager runtime`,
    `${summary.commonApplyOpcodeRows || 0} 条 common-apply opcode`,
    `${summary.objectFieldWriteRows || 0} 条对象字段写入`,
    `${summary.objectFieldReadRows || 0} 条对象字段读取`,
    `${summary.managerFieldReadRows || 0} 条 manager 字段读取`,
    `${summary.backingTransformWriteRows || 0} 条 backing transform 写入`,
    `${summary.semanticConsumerResolvedRows || 0} 条语义 consumer 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 payload setter downstream：${summary.rows} 条下游 helper 链路（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentTokenChildManagerRecordBridgeHealthSummary() {
  const summary = runtimeEffectProjectileCurrentTokenChildManagerRecordBridgeSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.projectileManagerRuntimeTargetRows || 0} 条 projectile manager runtime target`,
    `projectile manager ${summary.projectileManagerRuntimeBridgeRecovered ? "已闭合" : "未闭合"}`,
    `target writer ${summary.targetParameterWriterRecovered ? "已闭合" : "未闭合"}`,
    `target payload ${summary.targetPayloadBridgeRecovered ? "已闭合" : "未闭合"}`,
    `manager draw ${summary.managerDrawBridgeRecovered ? "已闭合" : "未闭合"}`,
    `particle draw ${summary.particleDrawChainRecovered ? "已闭合" : "未闭合"}`,
    `PFX owner ${summary.pfxEmitterManagerEntryOwnerRecovered ? "已闭合" : "未闭合"}`,
    `${summary.exactLayoutBParticleFlagProducerRows || 0} 条精确 flag producer`,
    `${summary.closedBridgeRows || 0} 条桥已闭合`,
    `${summary.blockedRows || 0} 条 blocker`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 manager record bridge：${summary.rows} 个阶段（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentTokenChildEffectOwnerCandidateHealthSummary() {
  const summary = runtimeEffectProjectileCurrentTokenChildEffectOwnerCandidateSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.effectOwnerCandidateRows || 0} 条 effect owner candidate`,
    `${summary.createResolveRows || 0} 条 create resolve`,
    `${summary.layoutBSetupCallRows || 0} 条 layout-B setup 调用`,
    `${summary.ownerFieldReadRows || 0} 条 owner 字段读取`,
    `${summary.optionalExternalHandleRows || 0} 条可选外部 handle 链路`,
    `${summary.pfxEmitterOwnerResolvedRows || 0} 条 PFX/emitter owner 已解出`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 effect owner candidate：${summary.rows} 条候选（${details.join(" / ")}）。`;
}

function runtimeEffectProjectileCurrentTokenChildStaticPfxOwnerHealthSummary() {
  const summary = runtimeEffectProjectileCurrentTokenChildStaticPfxOwnerSummary;
  if (!summary?.rows) return "";
  const details = [
    `${summary.staticPfxListCallsiteRows || 0} 条 StaticPfx 列表调用`,
    `${summary.staticPfxSchemaFieldRows || 0} 个 StaticPfx 字段`,
    `${summary.effectOwnerFunctionRows || 0} 个 handler`,
    `${summary.x19StaticPfxResolvedRows || 0} 条 x19 StaticPfx 已闭合`,
    `${summary.managerEntryOwnerResolvedRows || 0} 条 manager entry owner 已闭合`,
    `${summary.renderPromotionAllowedRows || 0} 条允许接管`,
  ];
  return ` 弹道 StaticPfx owner：${summary.rows} 条链路（${details.join(" / ")}）。`;
}

function syncModelHealth() {
  if (modelHealthText) modelHealthText.textContent = materialHealthSummary();
}

function safeFileName(value) {
  return String(value || "vainglory-model")
    .replace(/\.(glb|obj|stl|3mf)$/i, "")
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function timestampFileNamePart(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderSceneOnce() {
  updateCameraClipPlanes();
  if (bloomToggle.checked) composer.render();
  else renderer.render(scene, camera);
}

function updateCharacterMaterialRuntime(deltaSeconds) {
  if (!activeObject) return;
  activeObject.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) advanceCharacterUvRuntime(material, deltaSeconds);
  });
}

function isChildOf(object, parent) {
  let current = object;
  while (current) {
    if (current === parent) return true;
    current = current.parent;
  }
  return false;
}

function bakedGeometryFromMesh(mesh) {
  const source = mesh.geometry;
  const geometry = source.clone();
  const position = source.getAttribute("position");
  if (!position) return geometry;

  const baked = new Float32Array(position.count * 3);
  const vertex = new THREE.Vector3();
  const applyBoneTransform = mesh.applyBoneTransform?.bind(mesh) || mesh.boneTransform?.bind(mesh);
  if (mesh.isSkinnedMesh && mesh.skeleton) mesh.skeleton.update();

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    if (mesh.isSkinnedMesh && mesh.skeleton && applyBoneTransform) applyBoneTransform(index, vertex);
    baked[index * 3] = vertex.x;
    baked[index * 3 + 1] = vertex.y;
    baked[index * 3 + 2] = vertex.z;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(baked, 3));
  geometry.deleteAttribute("skinIndex");
  geometry.deleteAttribute("skinWeight");
  geometry.computeVertexNormals();
  return geometry;
}

function frozenPoseClone() {
  const group = new THREE.Group();
  group.name = safeFileName(activeManifestItem?.modelLabel || activeManifestItem?.character || activeIdentity || "vainglory_pose");
  if (!activeObject) return group;

  activeObject.updateMatrixWorld(true);
  activeObject.traverse((child) => {
    if (!child.visible || !child.isMesh || !child.geometry || isChildOf(child, activeSkeleton)) return;
    const geometry = bakedGeometryFromMesh(child);
    const material = Array.isArray(child.material)
      ? child.material.map((item) => item?.clone?.() || item)
      : child.material?.clone?.() || child.material;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = child.name || child.parent?.name || "mesh";
    mesh.matrix.copy(child.matrixWorld);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  });
  return group;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function threeMfNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)).toString() : "0";
}

function materialDisplayColor(material) {
  const color = material?.color || new THREE.Color(0xc9c0a3);
  const opacity = Number.isFinite(material?.opacity) ? Math.max(0, Math.min(1, material.opacity)) : 1;
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `#${color.getHexString().toUpperCase()}${alpha}`;
}

function textureImageSize(image) {
  const width = image?.width || image?.naturalWidth || image?.videoWidth || 0;
  const height = image?.height || image?.naturalHeight || image?.videoHeight || 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width: Math.round(width), height: Math.round(height) };
}

function imageDataFromTextureSource(image, width, height) {
  if (!image?.data || image.data.length < width * height * 4) return null;
  const data = image.data instanceof Uint8ClampedArray ? image.data : new Uint8ClampedArray(image.data);
  return new ImageData(data.slice(0, width * height * 4), width, height);
}

function applyMaterialTintToCanvas(ctx, width, height, material) {
  const color = material?.color || new THREE.Color(0xffffff);
  const opacity = Number.isFinite(material?.opacity) ? Math.max(0, Math.min(1, material.opacity)) : 1;
  if (color.r === 1 && color.g === 1 && color.b === 1 && opacity === 1) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    data[index] = Math.round(data[index] * color.r);
    data[index + 1] = Math.round(data[index + 1] * color.g);
    data[index + 2] = Math.round(data[index + 2] * color.b);
    data[index + 3] = Math.round(data[index + 3] * opacity);
  }
  ctx.putImageData(imageData, 0, 0);
}

async function textureImageToPngBytes(texture, material) {
  const image = texture?.image;
  const size = textureImageSize(image);
  if (!size) return null;

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const sourceData = imageDataFromTextureSource(image, size.width, size.height);
  if (sourceData) ctx.putImageData(sourceData, 0, 0);
  else ctx.drawImage(image, 0, 0, size.width, size.height);
  applyMaterialTintToCanvas(ctx, size.width, size.height, material);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

function threeMfTileStyle(wrap) {
  if (wrap === THREE.MirroredRepeatWrapping) return "mirror";
  if (wrap === THREE.ClampToEdgeWrapping) return "clamp";
  return "wrap";
}

function threeMfTextureFilter(texture) {
  if (texture?.magFilter === THREE.NearestFilter || texture?.minFilter === THREE.NearestFilter) return "nearest";
  return "linear";
}

function transformedThreeMfUv(texture, uvAttribute, vertexIndex) {
  const uv = new THREE.Vector2(uvAttribute.getX(vertexIndex), uvAttribute.getY(vertexIndex));
  if (!texture) return [uv.x, uv.y];
  if (texture.matrixAutoUpdate) texture.updateMatrix();
  uv.applyMatrix3(texture.matrix);
  if (texture.flipY) uv.y = 1 - uv.y;
  return [uv.x, uv.y];
}

function triangleMaterialForMesh(mesh, triangleOffset) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (materials.length <= 1) return materials[0] || null;

  const group = mesh.geometry.groups.find((candidate) => triangleOffset >= candidate.start && triangleOffset < candidate.start + candidate.count);
  return materials[group?.materialIndex || 0] || materials[0] || null;
}

function materialIndexForThreeMf(material, materials, materialLookup) {
  const color = materialDisplayColor(material);
  const name = material?.name || `material_${materials.length}`;
  const key = `${name}\t${color}`;
  if (materialLookup.has(key)) return materialLookup.get(key);

  const index = materials.length;
  materialLookup.set(key, index);
  materials.push({ name, color });
  return index;
}

async function textureGroupForThreeMf(material, context) {
  const texture = material?.map;
  if (!texture?.image) return null;

  const key = `${texture.uuid || texture.id || context.textures.length}\t${materialDisplayColor(material)}`;
  if (context.textureLookup.has(key)) return context.textureLookup.get(key);

  const data = await textureImageToPngBytes(texture, material);
  if (!data) return null;

  const textureResource = {
    textureId: context.nextResourceId++,
    path: `3D/Textures/texture_${context.textures.length}.png`,
    data,
    tileStyleU: threeMfTileStyle(texture.wrapS),
    tileStyleV: threeMfTileStyle(texture.wrapT),
    filter: threeMfTextureFilter(texture),
  };
  const group = {
    id: context.nextResourceId++,
    textureId: textureResource.textureId,
    uvs: [],
  };

  context.textures.push(textureResource);
  context.textureGroups.push(group);
  context.textureLookup.set(key, group);
  return group;
}

async function collectThreeMfMeshData(object) {
  const vertices = [];
  const triangles = [];
  const materials = [];
  const textureGroups = [];
  const textures = [];
  const context = {
    materials,
    materialLookup: new Map(),
    textureGroups,
    textures,
    textureLookup: new Map(),
    nextResourceId: 2,
  };
  const vertex = new THREE.Vector3();

  object.updateMatrixWorld(true);
  const meshes = [];
  object.traverse((child) => {
    if (!child.visible || !child.isMesh || !child.geometry) return;
    meshes.push(child);
  });

  for (const child of meshes) {
    const position = child.geometry.getAttribute("position");
    if (!position) continue;
    const uvAttribute = child.geometry.getAttribute("uv");

    const vertexOffset = vertices.length;
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld);
      vertices.push([vertex.x, vertex.y, vertex.z]);
    }

    const indexAttribute = child.geometry.index;
    const triangleCount = indexAttribute ? Math.floor(indexAttribute.count / 3) : Math.floor(position.count / 3);
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const triangleOffset = triangleIndex * 3;
      const v1 = vertexOffset + (indexAttribute ? indexAttribute.getX(triangleOffset) : triangleOffset);
      const v2 = vertexOffset + (indexAttribute ? indexAttribute.getX(triangleOffset + 1) : triangleOffset + 1);
      const v3 = vertexOffset + (indexAttribute ? indexAttribute.getX(triangleOffset + 2) : triangleOffset + 2);
      const material = triangleMaterialForMesh(child, triangleOffset);

      const localV1 = indexAttribute ? indexAttribute.getX(triangleOffset) : triangleOffset;
      const localV2 = indexAttribute ? indexAttribute.getX(triangleOffset + 1) : triangleOffset + 1;
      const localV3 = indexAttribute ? indexAttribute.getX(triangleOffset + 2) : triangleOffset + 2;
      const textureGroup = material?.map && uvAttribute ? await textureGroupForThreeMf(material, context) : null;

      if (textureGroup) {
        const p1 = textureGroup.uvs.length;
        textureGroup.uvs.push(transformedThreeMfUv(material.map, uvAttribute, localV1));
        const p2 = textureGroup.uvs.length;
        textureGroup.uvs.push(transformedThreeMfUv(material.map, uvAttribute, localV2));
        const p3 = textureGroup.uvs.length;
        textureGroup.uvs.push(transformedThreeMfUv(material.map, uvAttribute, localV3));
        triangles.push({ v1, v2, v3, propertyId: textureGroup.id, p1, p2, p3 });
        continue;
      }

      const materialIndex = materialIndexForThreeMf(material, materials, context.materialLookup);
      triangles.push({ v1, v2, v3, propertyId: 1, p1: materialIndex, p2: materialIndex, p3: materialIndex });
    }
  }

  if (!materials.length) materials.push({ name: "material_0", color: "#C9C0A3FF" });
  return { vertices, triangles, materials, textures, textureGroups, objectId: context.nextResourceId };
}

async function buildThreeMfModelXml(object) {
  const { vertices, triangles, materials, textures, textureGroups, objectId } = await collectThreeMfMeshData(object);
  const materialXml = materials
    .map((material) => `      <base name="${xmlEscape(material.name)}" displaycolor="${material.color}"/>`)
    .join("\n");
  const textureXml = textures
    .map(
      (texture) =>
        `    <texture2d id="${texture.textureId}" path="${xmlEscape(texture.path)}" contenttype="image/png" tilestyleu="${texture.tileStyleU}" tilestylev="${texture.tileStyleV}" filter="${texture.filter}"/>`,
    )
    .join("\n");
  const textureGroupXml = textureGroups
    .map((group) => {
      const uvXml = group.uvs
        .map((uv) => `      <tex2coord u="${threeMfNumber(uv[0])}" v="${threeMfNumber(uv[1])}"/>`)
        .join("\n");
      return `    <texture2dgroup id="${group.id}" texid="${group.textureId}">
${uvXml}
    </texture2dgroup>`;
    })
    .join("\n");
  const vertexXml = vertices
    .map(([x, y, z]) => `        <vertex x="${threeMfNumber(x)}" y="${threeMfNumber(y)}" z="${threeMfNumber(z)}"/>`)
    .join("\n");
  const triangleXml = triangles
    .map(
      (triangle) =>
        `        <triangle v1="${triangle.v1}" v2="${triangle.v2}" v3="${triangle.v3}" pid="${triangle.propertyId}" p1="${triangle.p1}" p2="${triangle.p2}" p3="${triangle.p3}"/>`,
    )
    .join("\n");

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="zh-CN" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="1">
${materialXml}
    </basematerials>
${textureXml}
${textureGroupXml}
    <object id="${objectId}" type="model">
      <mesh>
        <vertices>
${vertexXml}
        </vertices>
        <triangles>
${triangleXml}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="${objectId}"/>
  </build>
</model>`;
  return { modelXml, textures };
}

function zipCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

const ZIP_CRC_TABLE = zipCrcTable();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = ZIP_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new TextEncoder().encode(String(value));
}

function zipDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { dosDate, dosTime };
}

function concatBytes(parts, totalLength) {
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function buildThreeMfArchive(modelXml, textures) {
  const files = [
    {
      path: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="png" ContentType="image/png"/>
</Types>`,
    },
    {
      path: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/>
</Relationships>`,
    },
    { path: "3D/3dmodel.model", data: modelXml },
    ...textures.map((texture) => ({ path: texture.path, data: texture.data })),
  ];

  const { dosDate, dosTime } = zipDateTime();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const file of files) {
    const nameBytes = zipBytes(file.path);
    const dataBytes = zipBytes(file.data);
    const crc = crc32(dataBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, dataBytes);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + dataBytes.length;
  }

  const centralLength = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralLength, true);
  endView.setUint32(16, localOffset, true);

  return concatBytes([...localParts, ...centralParts, end], localOffset + centralLength + end.length);
}

function exportFrozenPoseGlb() {
  if (!activeObject) return;
  const clone = frozenPoseClone();
  const fileName = `${safeFileName(modelPath.textContent || activeIdentity)}-当前姿势.glb`;
  gltfExporter.parse(
    clone,
    (result) => {
      const blob =
        result instanceof ArrayBuffer
          ? new Blob([result], { type: "model/gltf-binary" })
          : new Blob([JSON.stringify(result)], { type: "model/gltf+json" });
      downloadBlob(blob, fileName);
    },
    (error) => {
      modelStats.textContent = `导出 GLB 失败：${error.message}`;
    },
    { binary: true, onlyVisible: true },
  );
}

function exportFrozenPoseObj() {
  if (!activeObject) return;
  const objText = objExporter.parse(frozenPoseClone());
  const fileName = `${safeFileName(modelPath.textContent || activeIdentity)}-当前姿势.obj`;
  downloadBlob(new Blob([objText], { type: "text/plain;charset=utf-8" }), fileName);
}

function exportFrozenPoseStl() {
  if (!activeObject) return;
  const stlData = stlExporter.parse(frozenPoseClone(), { binary: true });
  const fileName = `${safeFileName(modelPath.textContent || activeIdentity)}-当前姿势.stl`;
  downloadBlob(new Blob([stlData], { type: "model/stl" }), fileName);
}

async function exportFrozenPoseThreeMf() {
  if (!activeObject) return;
  try {
    exportPoseThreeMfButton.disabled = true;
    modelStats.textContent = "正在导出带贴图 3MF...";
    const clone = frozenPoseClone();
    const { modelXml, textures } = await buildThreeMfModelXml(clone);
    const threeMfData = buildThreeMfArchive(modelXml, textures);
    const fileName = `${safeFileName(modelPath.textContent || activeIdentity)}-当前姿势.3mf`;
    downloadBlob(new Blob([threeMfData], { type: "model/3mf" }), fileName);
    modelStats.textContent = `已导出 3MF：${textures.length} 张贴图`;
  } catch (error) {
    modelStats.textContent = `导出 3MF 失败：${error.message}`;
  } finally {
    syncTimelineControls();
  }
}

function animationRecordTime(elapsedMs) {
  const duration = animationDuration();
  if (!duration) return 0;
  return (elapsedMs / 1000) % duration;
}

function preferredVideoMimeType(format = recordFormatSelect?.value || "mp4") {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  const mp4Types = ['video/mp4;codecs="avc1.42E01E"', "video/mp4;codecs=avc1.42E01E", "video/mp4"];
  const webmTypes = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const preferredTypes = format === "webm" ? [...webmTypes, ...mp4Types] : [...mp4Types, ...webmTypes];
  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function recordingQuality() {
  return RECORDING_QUALITY_PRESETS[recordQualitySelect?.value] || RECORDING_QUALITY_PRESETS.high;
}

function playbackSpeed() {
  const value = Number(playbackSpeedSelect?.value);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function setRecordProgress(progress, text) {
  const safeProgress = Math.max(0, Math.min(1, Number(progress) || 0));
  if (recordProgress) recordProgress.hidden = false;
  if (recordProgressBar) recordProgressBar.value = safeProgress;
  if (recordProgressText) recordProgressText.textContent = text;
  if (recordProgressPercent) recordProgressPercent.textContent = `${Math.round(safeProgress * 100)}%`;
}

function resetRecordProgress() {
  if (recordProgress) recordProgress.hidden = true;
  if (recordProgressBar) recordProgressBar.value = 0;
  if (recordProgressText) recordProgressText.textContent = "准备录制";
  if (recordProgressPercent) recordProgressPercent.textContent = "0%";
}

function syncRecordDialogState() {
  if (recordDialog) recordDialog.classList.toggle("is-recording", videoRecording);
  if (recordCameraSelect) recordCameraSelect.disabled = videoRecording;
  if (recordFormatSelect) recordFormatSelect.disabled = videoRecording;
  if (recordQualitySelect) recordQualitySelect.disabled = videoRecording;
  refreshSelectMenus();
}

function recordingFrame() {
  if (!activeObject) {
    return {
      target: new THREE.Vector3(),
      radius: 1,
      height: 0.5,
    };
  }
  activeObject.updateMatrixWorld(true);
  const skinnedSummary = summarizeCurrentSkinnedBounds(0);
  const box = boxFromRobustSkinnedSummary(skinnedSummary) || new THREE.Box3().setFromObject(activeObject);
  const size = box.getSize(new THREE.Vector3());
  const target = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  return {
    target,
    radius: maxDim * 2.55,
    height: Math.max(size.y * 0.32, maxDim * 0.22),
  };
}

function recordCameraPath(elapsedMs, durationMs, frame, mode) {
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, elapsedMs / durationMs)) : 0;
  const angle = progress * Math.PI * 2;
  const target = frame.target.clone();
  const position = new THREE.Vector3();

  if (mode === "top-down") {
    const tilt = Math.sin(progress * Math.PI) * frame.radius * 0.18;
    position.set(target.x + tilt, target.y + frame.radius * 1.2, target.z + frame.radius * 0.38);
    return { position, target };
  }

  if (mode === "left-right") {
    position.set(target.x + (progress * 2 - 1) * frame.radius, target.y + frame.height, target.z + frame.radius * 0.88);
    return { position, target };
  }

  if (mode === "push-in") {
    const distance = frame.radius * (1.18 - progress * 0.38);
    position.set(target.x + Math.sin(Math.PI * 0.16) * distance, target.y + frame.height * 1.08, target.z + Math.cos(Math.PI * 0.16) * distance);
    return { position, target };
  }

  position.set(target.x + Math.sin(angle) * frame.radius, target.y + frame.height, target.z + Math.cos(angle) * frame.radius);
  return { position, target };
}

async function recordTurntableVideo() {
  if (!activeObject || videoRecording) return;
  if (!renderer.domElement.captureStream || typeof MediaRecorder === "undefined") {
    modelStats.textContent = "当前浏览器不支持录制视频。";
    return;
  }

  videoRecording = true;
  syncRecordDialogState();
  setRecordProgress(0, "准备录制");
  const originalText = recordVideoButton.textContent;
  const originalPlayState = poseLoopToggle.checked;
  const originalPosition = camera.position.clone();
  const originalTarget = controls.target.clone();
  const originalDamping = controls.enableDamping;
  const chunks = [];
  const durationMs = 7000;
  const frame = recordingFrame();
  const cameraMode = recordCameraSelect?.value || "static";
  const shouldMoveCamera = cameraMode !== "static";
  let stream = null;
  let recorder = null;
  let recorderStarted = false;
  let stopped = Promise.resolve();

  try {
    const mimeType = preferredVideoMimeType();
    const extension = mimeType.includes("mp4") ? "mp4" : "webm";
    const quality = recordingQuality();
    stream = renderer.domElement.captureStream(quality.frameRate);
    const recorderOptions = {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: quality.videoBitsPerSecond,
    };
    recorder = new MediaRecorder(stream, recorderOptions);
    stopped = new Promise((resolve) => {
      recorder.addEventListener(
        "stop",
        () => {
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" });
          downloadBlob(blob, `${safeFileName(modelPath.textContent || activeIdentity)}-展示视频-${timestampFileNamePart()}.${extension}`);
          setRecordProgress(1, "录制完成");
          resolve();
        },
        { once: true },
      );
    });
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recordVideoButton.textContent = extension === "mp4" ? "录制 MP4 中..." : "录制中...";
    controls.enableDamping = false;
    syncTimelineControls(manualAnimationTime);
    poseLoopToggle.checked = false;
    recorder.start();
    recorderStarted = true;
    setRecordProgress(0, "录制中");
    const start = performance.now();

    while (performance.now() - start < durationMs) {
      const elapsed = performance.now() - start;
      setRecordProgress(Math.min(1, elapsed / durationMs), "录制中");
      if (shouldMoveCamera) {
        const shot = recordCameraPath(elapsed, durationMs, frame, cameraMode);
        camera.position.copy(shot.position);
        camera.lookAt(shot.target);
        controls.target.copy(shot.target);
      }
      controls.update();
      if (selectedAnimation()) applyAnimationAtTime(animationRecordTime(elapsed));
      renderSceneOnce();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    setRecordProgress(1, "整理视频");
  } finally {
    if (recorderStarted && recorder?.state !== "inactive") recorder.stop();
    if (recorderStarted) await stopped;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    controls.enableDamping = originalDamping;
    camera.position.copy(originalPosition);
    controls.target.copy(originalTarget);
    controls.update();
    poseLoopToggle.checked = originalPlayState;
    videoRecording = false;
    syncRecordDialogState();
    recordVideoButton.textContent = originalText;
    syncTimelineControls(manualAnimationTime);
  }
}

function skeletonCandidates(item) {
  if (!item?.rel) return [];
  const explicitSkeletons = (item.skeletons || []).map((skeleton) => skeleton.replace(/\.skeleton$/i, ".json"));
  const rel = item.rel.replace(/\.(obj|glb)$/i, ".json");
  const dir = rel.slice(0, rel.lastIndexOf("/") + 1);
  const baseName = rel.slice(rel.lastIndexOf("/") + 1, -5);
  const candidates = [...explicitSkeletons, rel];
  const baseHero = baseName.match(/^([A-Za-z]+[0-9]*|[a-z]+)(?:_|$)/)?.[1];
  if (baseHero && baseHero !== baseName) candidates.push(`${dir}${baseHero}.json`);
  return [...new Set(candidates)];
}

async function fetchSkeleton(item) {
  for (const candidate of skeletonCandidates(item)) {
    if (!skeletonManifest.has(candidate)) continue;
    const response = await fetch(`../hero_assets_skeletons_json/${candidate}`);
    if (response.ok) return response.json();
  }
  return null;
}

function makeBoneNode(bone) {
  const node = new THREE.Object3D();
  node.name = `bone_${bone.index}_${bone.hash}`;
  node.userData.basePosition = [...bone.translation];
  node.userData.baseRotation = [...bone.rotation];
  node.userData.baseScale = [...bone.scale];
  resetBoneNode(node);
  return node;
}

function cacheBaseTransform(node) {
  if (node.userData.basePosition) return;
  node.userData.basePosition = node.position.toArray();
  node.userData.baseRotation = node.quaternion.toArray();
  node.userData.baseScale = node.scale.toArray();
}

function setBoneQuaternion(node, rotation) {
  node.quaternion.fromArray(rotation);
  if (node.quaternion.lengthSq() > 0.000001) node.quaternion.normalize();
}

function resetBoneNode(node) {
  cacheBaseTransform(node);
  node.position.fromArray(node.userData.basePosition);
  setBoneQuaternion(node, node.userData.baseRotation);
  node.scale.fromArray(node.userData.baseScale);
}

function lerpArray(left, right, alpha) {
  return left.map((value, index) => value + (right[index] - value) * alpha);
}

function skeletonLocalPosition(root, node) {
  const worldPosition = node.getWorldPosition(new THREE.Vector3());
  return root.worldToLocal(worldPosition);
}

function updateSkeletonOverlayGeometry(root) {
  const { linePairs, lines, markers, nodes } = root.userData;
  if (!linePairs || !lines || !markers || !nodes) return;

  root.updateMatrixWorld(true);
  const positionAttribute = lines.geometry.getAttribute("position");
  let cursor = 0;

  for (const [parentIndex, childIndex] of linePairs) {
    const parentPosition = skeletonLocalPosition(root, nodes[parentIndex]);
    const childPosition = skeletonLocalPosition(root, nodes[childIndex]);
    positionAttribute.setXYZ(cursor, parentPosition.x, parentPosition.y, parentPosition.z);
    positionAttribute.setXYZ(cursor + 1, childPosition.x, childPosition.y, childPosition.z);
    cursor += 2;
  }

  positionAttribute.needsUpdate = true;
  lines.geometry.computeBoundingSphere();

  markers.forEach((marker, index) => {
    marker.position.copy(skeletonLocalPosition(root, nodes[index]));
  });
}

function applyPoseToNode(node, pose, blend, options = {}) {
  const includeTranslation = options.includeTranslation ?? true;
  const includeScale = options.includeScale ?? true;
  resetBoneNode(node);
  if (includeTranslation && pose.translation) node.position.fromArray(lerpArray(node.userData.basePosition, pose.translation, blend));
  if (pose.rotation) {
    const baseQuaternion = new THREE.Quaternion().fromArray(node.userData.baseRotation);
    const poseQuaternion = new THREE.Quaternion().fromArray(pose.rotation);
    if (baseQuaternion.lengthSq() > 0.000001) baseQuaternion.normalize();
    if (poseQuaternion.lengthSq() > 0.000001) poseQuaternion.normalize();
    node.quaternion.copy(baseQuaternion);
    node.quaternion.slerp(poseQuaternion, blend);
  }
  if (includeScale && pose.scale) node.scale.fromArray(lerpArray(node.userData.baseScale, pose.scale, blend));
}

function unambiguousPoseByBoneIndex() {
  const mapping = selectedAnimationMapping();
  const poseByIndex = new Map();
  for (const pose of mapping?.poseBones || []) {
    if (!pose.ambiguous) poseByIndex.set(pose.boneIndex, pose);
  }
  return poseByIndex;
}

function applyAnimationPoseToSkeleton(blend = 1, poseByIndex = unambiguousPoseByBoneIndex(), options = {}) {
  if (!activeSkeleton?.userData?.nodes) return;
  const poseOptions = {
    includeTranslation: options.includeTranslation ?? false,
    includeScale: options.includeScale ?? false,
  };

  const nodes = activeSkeleton.userData.nodes;
  for (const node of nodes) resetBoneNode(node);

  for (const [boneIndex, pose] of poseByIndex.entries()) {
    const node = nodes[boneIndex];
    if (!node) continue;
    applyPoseToNode(node, pose, blend, poseOptions);
  }

  updateSkeletonOverlayGeometry(activeSkeleton);
}

function prepareSkinnedMeshBones(object) {
  object.traverse((child) => {
    if (!child.isSkinnedMesh || !child.skeleton?.bones?.length) return;
    child.bindMode = child.bindMode || "attached";
    for (const bone of child.skeleton.bones) {
      if (heroKeyForItem(activeManifestItem) === "SAW" && String(bone?.name || "").toUpperCase() === SAW_KNIFE_BONE_NAME) {
        bone.scale.setScalar(SAW_KNIFE_HIDDEN_SCALE);
      }
      cacheBaseTransform(bone);
    }
  });
}

function skipMainAnimationPose(object) {
  let node = object;
  while (node) {
    if (node.userData?.skipMainAnimationPose) return true;
    node = node.parent;
  }
  return false;
}

function applyPoseToSkinnedMeshesInObject(object, blend = 1, poseByIndex = unambiguousPoseByBoneIndex(), options = {}, shouldSkip = () => false) {
  if (!object) return;
  const poseOptions = {
    includeTranslation: options.includeTranslation ?? false,
    includeScale: options.includeScale ?? false,
  };

  object.traverse((child) => {
    if (!child.isSkinnedMesh || !child.skeleton?.bones?.length) return;
    if (shouldSkip(child)) return;
    child.bindMode = child.bindMode || "attached";
    const bones = child.skeleton.bones;
    for (const bone of bones) resetBoneNode(bone);
    if (poseByIndex.size < Math.ceil(bones.length * MIN_SKINNED_POSE_COVERAGE)) {
      child.skeleton.update();
      return;
    }
    for (const [boneIndex, pose] of poseByIndex.entries()) {
      const bone = bones[boneIndex];
      if (!bone) continue;
      applyPoseToNode(bone, pose, blend, poseOptions);
    }
    child.skeleton.update();
  });
}

function applyAnimationPoseToSkinnedMeshes(blend = 1, poseByIndex = unambiguousPoseByBoneIndex(), options = {}) {
  applyPoseToSkinnedMeshesInObject(activeObject, blend, poseByIndex, options, skipMainAnimationPose);
}

function applyAnimationPose(blend = 1, poseByIndex = unambiguousPoseByBoneIndex(), options = {}) {
  applyAnimationPoseToSkeleton(blend, poseByIndex, options);
  applyAnimationPoseToSkinnedMeshes(blend, poseByIndex, options);
}

function hiddenRuntimeAttachmentBoneIndices() {
  const hiddenBoneIndices = new Set();
  if (!runtimeFormBoneIndices().size) return hiddenBoneIndices;
  const bones = firstActiveSkinnedSkeletonBones();
  const rootPosition = bones[0]?.getWorldPosition(new THREE.Vector3());
  if (!rootPosition) return hiddenBoneIndices;
  const bonePosition = new THREE.Vector3();
  const boneScale = new THREE.Vector3();
  for (let boneIndex = 0; boneIndex < bones.length; boneIndex += 1) {
    const bone = bones[boneIndex];
    if (
      bone &&
      !resolveFormBoneVisibility({
        scale: bone.getWorldScale(boneScale).toArray(),
        translation: bone.getWorldPosition(bonePosition).sub(rootPosition).toArray(),
        hasScaleTrack: false,
      })
    ) {
      hiddenBoneIndices.add(boneIndex);
    }
  }
  return hiddenBoneIndices;
}

function skinnedVertexControlledOnlyByHiddenBones(mesh, vertexIndex, hiddenBoneIndices) {
  if (!hiddenBoneIndices.size) return false;
  const joints = mesh.geometry?.getAttribute("skinIndex");
  const weights = mesh.geometry?.getAttribute("skinWeight");
  if (!joints || !weights) return false;
  const components = Math.min(4, joints.itemSize, weights.itemSize);
  const jointIndices = [];
  const jointWeights = [];
  for (let component = 0; component < components; component += 1) {
    jointIndices.push(attributeComponent(joints, vertexIndex, component));
    jointWeights.push(attributeComponent(weights, vertexIndex, component));
  }
  return isVertexControlledOnlyByHiddenBones({ jointIndices, jointWeights, hiddenBoneIndices });
}

function robustCoordinateRange(values, trimRatio = 0.02) {
  const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!finite.length) return null;
  const maxTrim = Math.floor((finite.length - 1) / 2);
  const trim = finite.length >= 50 ? Math.min(Math.floor(finite.length * trimRatio), maxTrim) : 0;
  return [finite[trim], finite[finite.length - 1 - trim]];
}

function summarizeCurrentSkinnedBounds(limit = 16) {
  if (!activeObject) return null;
  activeObject.updateMatrixWorld(true);
  const hiddenBoneIndices = hiddenRuntimeAttachmentBoneIndices();
  const bounds = new THREE.Box3();
  const outliers = [];
  const vertex = new THREE.Vector3();
  const axisValues = { x: [], y: [], z: [] };

  function pushOutlier(record) {
    outliers.push(record);
    outliers.sort((left, right) => right.distance - left.distance);
    if (outliers.length > limit) outliers.length = limit;
  }

  activeObject.traverse((child) => {
    if (!child.visible || !child.isMesh || !child.geometry) return;
    const position = child.geometry.getAttribute("position");
    if (!position) return;
    const joints = child.geometry.getAttribute("skinIndex");
    const weights = child.geometry.getAttribute("skinWeight");
    if (child.isSkinnedMesh && child.skeleton) child.skeleton.update();

    const indexAttribute = child.geometry.index;
    const drawRange = activeGeometryDrawRange(child.geometry, indexAttribute?.count || position.count);
    const vertexIndices = indexAttribute
      ? [
          ...new Set(
            Array.from({ length: drawRange.count }, (_, index) => indexAttribute.getX(drawRange.start + index)),
          ),
        ]
      : Array.from({ length: drawRange.count }, (_, index) => drawRange.start + index);
    const applyBoneTransform = child.applyBoneTransform?.bind(child) || child.boneTransform?.bind(child);

    for (const index of vertexIndices) {
      if (skinnedVertexControlledOnlyByHiddenBones(child, index, hiddenBoneIndices)) continue;
      vertex.fromBufferAttribute(position, index);
      if (child.isSkinnedMesh && child.skeleton) applyBoneTransform(index, vertex);
      child.localToWorld(vertex);
      bounds.expandByPoint(vertex);
      axisValues.x.push(vertex.x);
      axisValues.y.push(vertex.y);
      axisValues.z.push(vertex.z);
      pushOutlier({
        mesh: child.name || child.parent?.name || "mesh",
        index,
        distance: Number(vertex.length().toFixed(3)),
        position: vertex.toArray().map((value) => Number(value.toFixed(3))),
        joints: joints ? [joints.getX(index), joints.getY(index), joints.getZ(index), joints.getW(index)] : [],
        weights: weights
          ? [weights.getX(index), weights.getY(index), weights.getZ(index), weights.getW(index)].map((value) =>
              Number(value.toFixed(4)),
            )
          : [],
      });
    }
  });

  if (bounds.isEmpty()) return null;

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const robustX = robustCoordinateRange(axisValues.x);
  const robustY = robustCoordinateRange(axisValues.y);
  const robustZ = robustCoordinateRange(axisValues.z);
  const robustBox =
    robustX && robustY && robustZ
      ? new THREE.Box3(new THREE.Vector3(robustX[0], robustY[0], robustZ[0]), new THREE.Vector3(robustX[1], robustY[1], robustZ[1]))
      : null;
  const robustSize = robustBox?.getSize(new THREE.Vector3()) || null;
  const robustCenter = robustBox?.getCenter(new THREE.Vector3()) || null;
  return {
    min: bounds.min.toArray().map((value) => Number(value.toFixed(3))),
    max: bounds.max.toArray().map((value) => Number(value.toFixed(3))),
    size: size.toArray().map((value) => Number(value.toFixed(3))),
    center: center.toArray().map((value) => Number(value.toFixed(3))),
    robustMin: robustBox?.min.toArray().map((value) => Number(value.toFixed(3))) || null,
    robustMax: robustBox?.max.toArray().map((value) => Number(value.toFixed(3))) || null,
    robustSize: robustSize?.toArray().map((value) => Number(value.toFixed(3))) || null,
    robustCenter: robustCenter?.toArray().map((value) => Number(value.toFixed(3))) || null,
    outliers,
  };
}

function summarizeCurrentSkinnedEdgeOutliers(limit = 16, minEdge = 35) {
  if (!activeObject) return null;
  activeObject.updateMatrixWorld(true);
  const hiddenBoneIndices = hiddenRuntimeAttachmentBoneIndices();
  const outliers = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const rawA = new THREE.Vector3();
  const rawB = new THREE.Vector3();
  const rawC = new THREE.Vector3();

  function pushOutlier(record) {
    outliers.push(record);
    outliers.sort((left, right) => right.maxEdge - left.maxEdge);
    if (outliers.length > limit) outliers.length = limit;
  }

  function vertexInfo(mesh, index) {
    const joints = mesh.geometry.getAttribute("skinIndex");
    const weights = mesh.geometry.getAttribute("skinWeight");
    return {
      index,
      joints: joints ? [joints.getX(index), joints.getY(index), joints.getZ(index), joints.getW(index)] : [],
      weights: weights
        ? [weights.getX(index), weights.getY(index), weights.getZ(index), weights.getW(index)].map((value) =>
            Number(value.toFixed(4)),
          )
        : [],
    };
  }

  function materialNameForTriangle(mesh, offset) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const group = (mesh.geometry?.groups || []).find((item) => offset >= item.start && offset < item.start + item.count);
    const materialIndex = Number.isInteger(group?.materialIndex) ? group.materialIndex : 0;
    return materials[materialIndex]?.name || "";
  }

  activeObject.traverse((child) => {
    if (!child.visible || !child.isMesh || !child.geometry) return;
    const position = child.geometry.getAttribute("position");
    const indexAttribute = child.geometry.index;
    if (!position || !indexAttribute) return;
    if (child.isSkinnedMesh && child.skeleton) child.skeleton.update();
    const applyBoneTransform = child.applyBoneTransform?.bind(child) || child.boneTransform?.bind(child);

    function transformedVertex(target, index, skinned = true) {
      target.fromBufferAttribute(position, index);
      if (skinned && child.isSkinnedMesh && child.skeleton) applyBoneTransform(index, target);
      child.localToWorld(target);
    }

    for (let offset = 0; offset + 2 < indexAttribute.count; offset += 3) {
      const ia = indexAttribute.getX(offset);
      const ib = indexAttribute.getX(offset + 1);
      const ic = indexAttribute.getX(offset + 2);
      if (
        skinnedVertexControlledOnlyByHiddenBones(child, ia, hiddenBoneIndices) ||
        skinnedVertexControlledOnlyByHiddenBones(child, ib, hiddenBoneIndices) ||
        skinnedVertexControlledOnlyByHiddenBones(child, ic, hiddenBoneIndices)
      ) {
        continue;
      }
      transformedVertex(a, ia);
      transformedVertex(b, ib);
      transformedVertex(c, ic);
      transformedVertex(rawA, ia, false);
      transformedVertex(rawB, ib, false);
      transformedVertex(rawC, ic, false);
      const ab = a.distanceTo(b);
      const bc = b.distanceTo(c);
      const ca = c.distanceTo(a);
      const rawAb = rawA.distanceTo(rawB);
      const rawBc = rawB.distanceTo(rawC);
      const rawCa = rawC.distanceTo(rawA);
      const maxEdge = Math.max(ab, bc, ca);
      if (maxEdge < minEdge) continue;

      pushOutlier({
        mesh: child.name || child.parent?.name || "mesh",
        materialName: materialNameForTriangle(child, offset),
        triangle: offset / 3,
        indices: [ia, ib, ic],
        maxEdge: Number(maxEdge.toFixed(3)),
        edges: [ab, bc, ca].map((value) => Number(value.toFixed(3))),
        rawMaxEdge: Number(Math.max(rawAb, rawBc, rawCa).toFixed(3)),
        rawEdges: [rawAb, rawBc, rawCa].map((value) => Number(value.toFixed(3))),
        vertices: [vertexInfo(child, ia), vertexInfo(child, ib), vertexInfo(child, ic)],
      });
    }
  });

  return outliers;
}

function summarizeCurrentSkinJointDeltas(jointIndices = []) {
  if (!activeObject) return [];
  activeObject.updateMatrixWorld(true);
  const requested = new Set(jointIndices.map((index) => Number(index)).filter(Number.isInteger));
  const rows = [];

  activeObject.traverse((child) => {
    if (!child.visible || !child.isSkinnedMesh || !child.skeleton?.bones?.length) return;
    child.skeleton.update();
    const matrices = child.skeleton.boneMatrices;
    const indices = requested.size
      ? [...requested]
      : Array.from({ length: child.skeleton.bones.length }, (_, index) => index);

    for (const jointIndex of indices) {
      if (jointIndex < 0 || jointIndex >= child.skeleton.bones.length) continue;
      const matrixOffset = jointIndex * 16;
      let maxIdentityDelta = 0;
      for (let component = 0; component < 16; component += 1) {
        const expected = component % 5 === 0 ? 1 : 0;
        maxIdentityDelta = Math.max(maxIdentityDelta, Math.abs(matrices[matrixOffset + component] - expected));
      }
      rows.push({
        mesh: child.name || child.parent?.name || "mesh",
        jointIndex,
        boneName: child.skeleton.bones[jointIndex]?.name || "",
        maxIdentityDelta: Number(maxIdentityDelta.toFixed(6)),
        boneWorldTranslation: child.skeleton.bones[jointIndex].matrixWorld.elements
          .slice(12, 15)
          .map((value) => Number(value.toFixed(3))),
        boneInverseTranslation: child.skeleton.boneInverses[jointIndex].elements
          .slice(12, 15)
          .map((value) => Number(value.toFixed(3))),
        translation: [matrices[matrixOffset + 12], matrices[matrixOffset + 13], matrices[matrixOffset + 14]].map(
          (value) => Number(value.toFixed(3)),
        ),
      });
    }
  });

  return rows.sort((left, right) => right.maxIdentityDelta - left.maxIdentityDelta);
}

function skinnedBoundsMaxSize(summary) {
  if (!summary) return NaN;
  return Math.max(...summary.size.map((value) => Math.abs(value)).filter(Number.isFinite));
}

function skinnedMaxEdgeRatio() {
  if (!activeObject) return NaN;
  activeObject.updateMatrixWorld(true);
  const hiddenBoneIndices = hiddenRuntimeAttachmentBoneIndices();
  let maxRatio = NaN;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const rawA = new THREE.Vector3();
  const rawB = new THREE.Vector3();
  const rawC = new THREE.Vector3();

  activeObject.traverse((child) => {
    if (!child.visible || !child.isSkinnedMesh || !child.skeleton || !child.geometry?.index) return;
    const position = child.geometry.getAttribute("position");
    if (!position) return;
    child.skeleton.update();
    const applyBoneTransform = child.applyBoneTransform?.bind(child) || child.boneTransform?.bind(child);

    function transformedVertex(target, index, skinned = true) {
      target.fromBufferAttribute(position, index);
      if (skinned) applyBoneTransform(index, target);
      child.localToWorld(target);
    }

    const indexAttribute = child.geometry.index;
    for (let offset = 0; offset + 2 < indexAttribute.count; offset += 3) {
      const ia = indexAttribute.getX(offset);
      const ib = indexAttribute.getX(offset + 1);
      const ic = indexAttribute.getX(offset + 2);
      if (
        skinnedVertexControlledOnlyByHiddenBones(child, ia, hiddenBoneIndices) ||
        skinnedVertexControlledOnlyByHiddenBones(child, ib, hiddenBoneIndices) ||
        skinnedVertexControlledOnlyByHiddenBones(child, ic, hiddenBoneIndices)
      ) {
        continue;
      }
      transformedVertex(a, ia);
      transformedVertex(b, ib);
      transformedVertex(c, ic);
      transformedVertex(rawA, ia, false);
      transformedVertex(rawB, ib, false);
      transformedVertex(rawC, ic, false);

      const maxEdge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const rawMaxEdge = Math.max(rawA.distanceTo(rawB), rawB.distanceTo(rawC), rawC.distanceTo(rawA));
      if (rawMaxEdge <= AUTO_NATIVE_TRANSLATION_EDGE_MIN_RAW) continue;
      const ratio = maxEdge / rawMaxEdge;
      maxRatio = Number.isFinite(maxRatio) ? Math.max(maxRatio, ratio) : ratio;
    }
  });

  return maxRatio;
}

function nativeAnimationFrameIndex(timeSeconds) {
  if (!activeAnimationClip?.frameCount || !activeAnimationClip?.fps) return 0;
  return Math.floor((timeSeconds * activeAnimationClip.fps) % activeAnimationClip.frameCount);
}

function animationDuration(animation = selectedAnimation()) {
  return Math.max(Number(activeAnimationClip?.clipDuration || animation?.duration) || 0, 0);
}

function syncTimelineControls(timeSeconds = manualAnimationTime) {
  const animation = selectedAnimation();
  const duration = animationDuration(animation);
  const animated = isAnimationFormat();
  const hasAnimation = animated && Boolean(animation && duration > 0);
  const safeTime = hasAnimation ? Math.max(0, Math.min(duration, timeSeconds)) : 0;
  const fps = Number(activeAnimationClip?.fps || animation?.fps) || 0;
  const frameIndex = activeAnimationClip ? nativeAnimationFrameIndex(safeTime) : Math.floor(safeTime * fps);
  let selectDisabledChanged = false;

  selectDisabledChanged = setSelectDisabled(animationSelect, !animated || !activeAnimations.length) || selectDisabledChanged;
  poseLoopToggle.disabled = !animated;
  bonesToggle.disabled = !animated;
  syncEffectsToggleAvailability(animated && Boolean(activeRuntimeEffectObjects.length));
  if (animationTimeRange) {
    animationTimeRange.disabled = !hasAnimation;
    animationTimeRange.max = String(duration || 0);
    animationTimeRange.value = String(safeTime);
  }
  if (animationTimeText) animationTimeText.textContent = `${safeTime.toFixed(2)} 秒 / ${duration.toFixed(2)} 秒`;
  if (animationFrameText) animationFrameText.textContent = `第 ${Math.max(0, frameIndex)} 帧`;
  if (playPauseButton) {
    const isPlaying = poseLoopToggle.checked;
    playPauseButton.disabled = !hasAnimation;
    playPauseButton.setAttribute("aria-label", isPlaying ? "暂停动作" : "播放动作");
    playPauseButton.title = isPlaying ? "暂停动作" : "播放动作";
    const icon = playPauseButton.querySelector(".play-icon");
    icon?.classList.toggle("play-icon-pause", isPlaying);
    icon?.classList.toggle("play-icon-play", !isPlaying);
    const label = playPauseButton.querySelector(".sr-only");
    if (label) label.textContent = isPlaying ? "暂停" : "播放";
  }
  selectDisabledChanged = setSelectDisabled(playbackSpeedSelect, !hasAnimation) || selectDisabledChanged;
  if (exportPoseGlbButton) exportPoseGlbButton.disabled = !activeObject;
  if (exportPoseObjButton) exportPoseObjButton.disabled = !activeObject;
  if (exportPoseStlButton) exportPoseStlButton.disabled = !activeObject;
  if (exportPoseThreeMfButton) exportPoseThreeMfButton.disabled = !activeObject;
  if (openExportDialogButton) openExportDialogButton.disabled = !activeObject;
  if (openRecordDialogButton) openRecordDialogButton.disabled = !activeObject || videoRecording;
  if (recordVideoButton) recordVideoButton.disabled = !activeObject || videoRecording;
  if (selectDisabledChanged) refreshSelectMenus();
}

function applyAnimationAtTime(timeSeconds, options = {}) {
  const animation = selectedAnimation();
  const duration = animationDuration(animation);
  const rawTime = Number(timeSeconds) || 0;
  manualAnimationTime =
    options.wrap && duration > 0 ? ((rawTime % duration) + duration) % duration : Math.max(0, Math.min(duration || rawTime, rawTime));

  if (!activeObject || !animation) {
    syncPreviewEffectVisibility();
    syncTimelineControls(manualAnimationTime);
    return;
  }

  syncPreviewEffectVisibility();
  refreshAutoNativeTranslationMode();
  const nativePose = nativeAnimationPoseByBoneIndex(manualAnimationTime);
  if (nativePose) {
    activePoseBlend = 1;
    applyAnimationPose(1, nativePose, { includeTranslation: true, includeScale: true });
  } else if (shouldWaitForNativeAnimationPose()) {
    syncTimelineControls(manualAnimationTime);
    return;
  } else {
    const fallbackDuration = Math.max(duration || 1, 0.25);
    activePoseBlend = (Math.sin((manualAnimationTime / fallbackDuration) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
    applyAnimationPose(activePoseBlend);
  }

  applyAttachmentAnimationsAtTime(manualAnimationTime);
  activeObject.updateMatrixWorld(true);
  syncTimelineControls(manualAnimationTime);
}

function sampleNativeTranslationMaxAt(timeSeconds, mode) {
  const pose = nativeAnimationPoseByBoneIndex(timeSeconds, mode);
  if (!pose) return NaN;
  applyAnimationPose(0);
  applyAnimationPose(1, pose, { includeTranslation: true, includeScale: true });
  activeObject.updateMatrixWorld(true);
  return skinnedBoundsMaxSize(summarizeCurrentSkinnedBounds(0));
}

function sampleNativeTranslationEdgeRatioAt(timeSeconds, mode) {
  const pose = nativeAnimationPoseByBoneIndex(timeSeconds, mode);
  if (!pose) return NaN;
  applyAnimationPose(0);
  applyAnimationPose(1, pose, { includeTranslation: true, includeScale: true });
  activeObject.updateMatrixWorld(true);
  return skinnedMaxEdgeRatio();
}

function sampleNativeTranslationMax(mode) {
  let sampledMax = NaN;
  for (let sampleIndex = 0; sampleIndex < AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT; sampleIndex += 1) {
    const sampleTime = (activeAnimationClip.clipDuration * sampleIndex) / AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT;
    const sampleMax = sampleNativeTranslationMaxAt(sampleTime, mode);
    if (!Number.isFinite(sampleMax)) continue;
    sampledMax = Number.isFinite(sampledMax) ? Math.max(sampledMax, sampleMax) : sampleMax;
  }
  return sampledMax;
}

function sampleNativeTranslationMaxEdgeRatio(mode) {
  let sampledMaxRatio = NaN;
  for (let sampleIndex = 0; sampleIndex < AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT; sampleIndex += 1) {
    const sampleTime = (activeAnimationClip.clipDuration * sampleIndex) / AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT;
    const sampleRatio = sampleNativeTranslationEdgeRatioAt(sampleTime, mode);
    if (!Number.isFinite(sampleRatio)) continue;
    sampledMaxRatio = Number.isFinite(sampledMaxRatio) ? Math.max(sampledMaxRatio, sampleRatio) : sampleRatio;
  }
  return sampledMaxRatio;
}

function sampleNativeTranslationModeChanges() {
  let allWins = false;
  let safeWins = false;
  for (let sampleIndex = 0; sampleIndex < AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT; sampleIndex += 1) {
    const sampleTime = (activeAnimationClip.clipDuration * sampleIndex) / AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT;
    const allMax = sampleNativeTranslationMaxAt(sampleTime, "all");
    const safeMax = sampleNativeTranslationMaxAt(sampleTime, "safe");
    if (!Number.isFinite(allMax) || !Number.isFinite(safeMax)) continue;
    if (allMax <= safeMax) allWins = true;
    if (safeMax < allMax) safeWins = true;
  }
  return allWins && safeWins;
}

function dynamicNativeTranslationModeForTime(timeSeconds) {
  const key = `${autoNativeTranslationKey()}\t${nativeAnimationFrameIndex(timeSeconds)}`;
  if (dynamicNativeTranslationModes.has(key)) return dynamicNativeTranslationModes.get(key);

  applyAnimationPose(0);
  activeObject.updateMatrixWorld(true);
  const bindMax = skinnedBoundsMaxSize(summarizeCurrentSkinnedBounds(0));
  const allMax = sampleNativeTranslationMaxAt(timeSeconds, "all");
  const safeMax = sampleNativeTranslationMaxAt(timeSeconds, "safe");
  const noneMax = sampleNativeTranslationMaxAt(timeSeconds, "none");
  const allEdgeRatio = sampleNativeTranslationEdgeRatioAt(timeSeconds, "all");
  const safeEdgeRatio = sampleNativeTranslationEdgeRatioAt(timeSeconds, "safe");
  const noneEdgeRatio = sampleNativeTranslationEdgeRatioAt(timeSeconds, "none");
  const allEdgeIsSafe = nativeTranslationAllEdgeIsSafe(allEdgeRatio, safeEdgeRatio, noneEdgeRatio);
  const safeActsLikeNone = nativeTranslationSafeActsLikeNone(safeMax, noneMax);
  const safeHasCoverage = hasExpandedNativeTranslationSafeCoverage(selectedAnimationMapping());
  let mode = "safe";
  if (!safeHasCoverage && safeActsLikeNone) {
    mode = "all";
  } else if (allEdgeIsSafe || (safeActsLikeNone && allMax <= bindMax * AUTO_NATIVE_TRANSLATION_RIGID_MAX_RATIO)) {
    mode = "all";
  } else if (safeHasCoverage && Number.isFinite(allMax) && Number.isFinite(safeMax)) {
    mode = allMax < safeMax / AUTO_NATIVE_TRANSLATION_SAFE_PREFERRED_RATIO ? "all" : "safe";
  } else if (Number.isFinite(allMax) && (!Number.isFinite(safeMax) || allMax <= safeMax)) {
    mode = "all";
  }
  dynamicNativeTranslationModes.set(key, mode);
  applyAnimationPose(0);
  activeObject.updateMatrixWorld(true);
  return mode;
}

function refreshAutoNativeTranslationMode() {
  if (nativeTranslationMode !== "auto" || !activeObject || !activeAnimationClip || !selectedAnimationMapping()) return;
  const key = autoNativeTranslationKey();
  if (autoNativeTranslationModes.has(key)) return;

  const mapping = selectedAnimationMapping();
  const fallbackMode = fallbackAutoNativeTranslationMode(mapping);
  applyAnimationPose(0);
  activeObject.updateMatrixWorld(true);
  const bindMax = skinnedBoundsMaxSize(summarizeCurrentSkinnedBounds(0));
  const allMax = sampleNativeTranslationMax("all");
  const safeMax = sampleNativeTranslationMax("safe");
  const noneMax = sampleNativeTranslationMax("none");
  const allEdgeRatio = sampleNativeTranslationMaxEdgeRatio("all");
  const safeEdgeRatio = sampleNativeTranslationMaxEdgeRatio("safe");
  const noneEdgeRatio = sampleNativeTranslationMaxEdgeRatio("none");
  const safeHasCoverage = hasExpandedNativeTranslationSafeCoverage(mapping);

  autoNativeTranslationModes.set(
    key,
    chooseSampledNativeTranslationMode(
      bindMax,
      allMax,
      safeMax,
      noneMax,
      fallbackMode,
      allEdgeRatio,
      safeEdgeRatio,
      noneEdgeRatio,
      safeHasCoverage,
    ),
  );
  applyAnimationPose(0);
  activeObject.updateMatrixWorld(true);
}

window.__vaingloryDebug = {
  skinnedBounds: summarizeCurrentSkinnedBounds,
  skinnedEdgeOutliers: summarizeCurrentSkinnedEdgeOutliers,
  skinJointDeltas: summarizeCurrentSkinJointDeltas,
  meshes() {
    const rows = [];
    activeObject?.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      rows.push({
        name: child.name || "",
        visible: child.visible,
        material: materials.map((material) => material?.name || ""),
        indexCount: child.geometry?.index?.count || 0,
        positionCount: child.geometry?.getAttribute("position")?.count || 0,
      });
    });
    return rows;
  },
  setMeshVisible(name, visible) {
    let changed = false;
    activeObject?.traverse((child) => {
      if (child.isMesh && child.name === name) {
        child.visible = visible;
        changed = true;
      }
    });
    return changed;
  },
  resetPose() {
    activePoseBlend = 0;
    applyAnimationPose(0);
    activeObject?.updateMatrixWorld(true);
    return Boolean(activeObject);
  },
  applyNativePose(timeSeconds = 0, mode = nativeTranslationMode) {
    this.setNativeTranslationMode(mode);
    refreshAutoNativeTranslationMode();
    applyAnimationPose(0);
    const nativePose = nativeAnimationPoseByBoneIndex(timeSeconds);
    if (!nativePose) return false;
    applyAnimationPose(1, nativePose, { includeTranslation: true, includeScale: true });
    activeObject?.updateMatrixWorld(true);
    return true;
  },
  applyNativePoseSkippingBones(timeSeconds = 0, skippedBoneIndices = [], mode = nativeTranslationMode) {
    this.setNativeTranslationMode(mode);
    refreshAutoNativeTranslationMode();
    applyAnimationPose(0);
    const nativePose = nativeAnimationPoseByBoneIndex(timeSeconds);
    if (!nativePose) return false;
    const skipped = new Set(skippedBoneIndices.map((index) => Number(index)).filter(Number.isInteger));
    for (const boneIndex of skipped) nativePose.delete(boneIndex);
    applyAnimationPose(1, nativePose, { includeTranslation: true, includeScale: true });
    activeObject?.updateMatrixWorld(true);
    return true;
  },
  nativePoseBones(timeSeconds = 0, boneIndices = [], mode = nativeTranslationMode) {
    this.setNativeTranslationMode(mode);
    refreshAutoNativeTranslationMode();
    const nativePose = nativeAnimationPoseByBoneIndex(timeSeconds);
    if (!nativePose) return [];
    const requested = new Set(boneIndices.map((index) => Number(index)).filter(Number.isInteger));
    const entries = requested.size
      ? [...requested].map((boneIndex) => [boneIndex, nativePose.get(boneIndex)])
      : [...nativePose.entries()];
    return entries
      .filter(([, pose]) => pose)
      .map(([boneIndex, pose]) => ({
        boneIndex,
        rotation: pose.rotation?.map((value) => Number(value.toFixed(6))) || null,
        translation: pose.translation?.map((value) => Number(value.toFixed(3))) || null,
        scale: pose.scale?.map((value) => Number(value.toFixed(3))) || null,
      }));
  },
  setNativeTranslationMode(mode) {
    if (!["auto", "all", "safe", "none"].includes(mode)) throw new Error(`unsupported native translation mode: ${mode}`);
    nativeTranslationMode = mode;
  },
  nativeTranslationMode() {
    return nativeTranslationMode;
  },
  runtimeBindSlots() {
    return runtimeBindSlotsForItem();
  },
  runtimeBindingConfigItem() {
    return runtimeBindingConfigItem();
  },
  runtimeAttachmentBindSlots() {
    return runtimeAttachmentBindSlotsForItem();
  },
  runtimeEffectPreviewEntriesForDebug() {
    return runtimeEffectPreviewEntries().map((entry) => runtimeEffectPreviewDebugRow(entry));
  },
  runtimeEffectDefinitionProjectileEntriesForDebug() {
    return runtimeEffectDefinitionProjectileEntriesForItem().map((entry) => {
      const diagnostics = runtimeEffectPreviewCandidateDiagnostics(entry, selectedAnimation());
      return {
        ...runtimeEffectPreviewDebugRow(entry),
        shouldPreview: diagnostics.shouldPreview,
        animationBlockReason: diagnostics.animationBlockReason,
        spatialBlockReason: diagnostics.spatialBlockReason,
        previewBlockReason: diagnostics.previewBlockReason,
        projectileBindingStatus: entry.projectile?.bindingStatus || "",
        projectileResourcePath: entry.projectile?.resourcePath || "",
        nativeEmitterLabel: entry.projectile?.nativeEmitterLabel || "",
        nativeProjectileId: entry.projectile?.nativeProjectileId || "",
      };
    });
  },
  runtimeEffectBlockedPreviewCandidatesForDebug() {
    return runtimeEffectBlockedPreviewCandidateRows();
  },
  runtimeEffectHookPreviewCandidatesForDebug() {
    return runtimeEffectHooksForItem().flatMap((hook) => {
      const bindingTarget = runtimeEffectBindingTarget(hook);
      const sourceKind = hook.sourceKind || "native-effect-hook";
      const effectToken = hook.effectToken || hook.token || "";
      const pfxItems = bindingTarget ? runtimeEffectPfxItemsForHooks([hook]) : [];
      if (!bindingTarget || !pfxItems.length) {
        const resourceStatus = runtimeEffectHookResourceStatus(hook, activeManifestItem);
        const previewBlockReason = runtimeEffectMissingResourcePreviewBlockReason(hook, bindingTarget, activeManifestItem);
        return [
          {
            sourceKind,
            effectToken,
            pfxPath: "",
            activeRel: activeManifestItem?.rel || "",
            activeModelLabel: activeManifestItem?.modelLabel || "",
            activeSkinId: modelSkinId(activeManifestItem),
            resourceDiagnostics: resourceStatus.diagnostics,
            resourceStatus,
            actionKeys: hook.actionKeys || [],
            bindingKind: bindingTarget?.kind || "",
            boneIndex: bindingTarget?.boneIndex ?? null,
            boneToken: bindingTarget?.boneToken || "",
            selectedAttachmentSlot: hook?.runtimeBinding?.selectedAttachmentSlot ?? null,
            shouldPreview: false,
            nativeVisibilityAllowed: false,
            shadergraphCount: 0,
            previewShadergraphCount: 0,
            hasRenderableMaterial: false,
            previewBlockReason,
          },
        ];
      }
      return pfxItems.map((pfxItem) => {
        const pfxBindingProfile = runtimeEffectPfxBindingProfileForEntry(pfxItem, hook);
        const shadergraphItems = runtimeEffectShadergraphItemsForPfx([pfxItem]);
        const entryContext = {
          hook,
          pfxItem,
          pfxBindingProfile,
          shadergraphItems,
          bindingTarget,
          sourceKind,
          effectToken: effectToken || pfxItem.relativePath,
          actionKeys: hook.actionKeys || [],
        };
        const diagnostics = runtimeEffectPreviewCandidateDiagnostics(entryContext);
        return {
          sourceKind,
          effectToken: effectToken || pfxItem.relativePath,
          pfxPath: pfxItem.relativePath || "",
          activeRel: activeManifestItem?.rel || "",
          activeModelLabel: activeManifestItem?.modelLabel || "",
          activeSkinId: modelSkinId(activeManifestItem),
          resourceDiagnostics: runtimeEffectHookResourceDiagnostics(hook, activeManifestItem),
          actionKeys: hook.actionKeys || [],
          bindingKind: bindingTarget?.kind || "",
          boneIndex: bindingTarget?.boneIndex ?? null,
          boneToken: bindingTarget?.boneToken || "",
          selectedAttachmentSlot: hook?.runtimeBinding?.selectedAttachmentSlot ?? null,
          shouldPreview: diagnostics.shouldPreview,
          animationBlockReason: diagnostics.animationBlockReason,
          spatialBlockReason: diagnostics.spatialBlockReason,
          projectileRuntimeCoverage: diagnostics.projectileRuntimeCoverage,
          nativeVisibilityAllowed: diagnostics.nativeVisibilityAllowed,
          shadergraphCount: diagnostics.shadergraphItems.length,
          previewShadergraphCount: diagnostics.previewShadergraphItems.length,
          hasRenderableMaterial: diagnostics.hasRenderableMaterial,
          previewBlockReason: diagnostics.previewBlockReason,
        };
      });
    });
  },
  runtimeEffectCff0EntriesForDebug() {
    return runtimeEffectCff0EntriesForItem().map((entry) => {
      const pfxBindingProfile = runtimeEffectPfxBindingProfileForEntry(entry.pfxItem, entry.hook);
      const shadergraphItems = runtimeEffectShadergraphItemsForPfx([entry.pfxItem]);
      const entryContext = {
        ...entry,
        pfxBindingProfile,
        shadergraphItems,
        previewShadergraphItems: runtimeEffectPreviewShadergraphItems(shadergraphItems, entry.pfxItem, entry),
      };
      const diagnostics = runtimeEffectPreviewCandidateDiagnostics(entryContext);
      return {
        sourceKind: entry.sourceKind || "",
        effectToken: entry.effectToken || "",
        pfxPath: entry.pfxItem?.relativePath || "",
        role: runtimeEffectPreviewRole(entryContext),
        actionKeys: entry.actionKeys || [],
        shouldPreview: diagnostics.shouldPreview,
        animationBlockReason: diagnostics.animationBlockReason,
        spatialBlockReason: diagnostics.spatialBlockReason,
        projectileRuntimeCoverage: diagnostics.projectileRuntimeCoverage,
        previewBlockReason: diagnostics.previewBlockReason,
        hasRequiredSpatialEvidence: runtimeEffectHasRequiredSpatialEvidence(entryContext),
        hasRequiredTimelineEvidence: runtimeEffectHasRequiredTimelineEvidence(entryContext),
        startSeconds: runtimeEffectEntryStartSeconds(entryContext),
        opacity: runtimeEffectPreviewActivity(entryContext, runtimeEffectElapsed).opacity,
        nativeVisibilityAllowed: diagnostics.nativeVisibilityAllowed,
        shadergraphCount: diagnostics.shadergraphItems.length,
        previewShadergraphCount: diagnostics.previewShadergraphItems.length,
        hasRenderableMaterial: diagnostics.hasRenderableMaterial,
        bindingKind: entry?.bindingTarget?.kind || "",
        boneIndex: entry?.bindingTarget?.boneIndex ?? null,
        boneToken: entry?.bindingTarget?.boneToken || "",
        effectChannelFallback: Boolean(entry?.bindingTarget?.effectChannelFallback),
      };
    });
  },
  runtimeEffectCff0RowsForDebug() {
    return cff0EffectInstanceRowsForItem().map((row) => {
      const resourcePaths = runtimeEffectCff0ResourcePaths(row);
      const actionKeys = runtimeEffectCff0ActionKeys(row);
      const startSeconds = runtimeEffectCff0StartSeconds(row);
      const bindingTokens = runtimeEffectCff0BindingTokens(row);
      const bindingTarget = runtimeEffectCff0BindingTarget(row);
      return {
        id: row.id || "",
        ownerLabel: row.ownerLabel || row.modelLabel || "",
        effectToken: row.effectToken || "",
        resourcePaths,
        actionKeys,
        startSeconds,
        bindingTokens,
        hasEntryInputs: Boolean(resourcePaths.length && actionKeys.length && startSeconds.length && bindingTarget),
        bindingKind: bindingTarget?.kind || "",
        boneIndex: bindingTarget?.boneIndex ?? null,
        boneToken: bindingTarget?.boneToken || "",
        effectChannelFallback: Boolean(bindingTarget?.effectChannelFallback),
      };
    });
  },
  runtimeEffectPreviews() {
    return activeRuntimeEffectObjects.map((preview) => {
      const entry = preview.userData.entry || {};
      return runtimeEffectPreviewDebugRow(entry, { visible: preview.visible });
    });
  },
};

function buildSkeletonOverlay(skeleton) {
  const root = new THREE.Group();
  root.name = "skeleton_overlay";
  const nodes = skeleton.bones.map(makeBoneNode);
  const linePairs = [];

  for (const bone of skeleton.bones) {
    if (bone.parent >= 0 && nodes[bone.parent]) nodes[bone.parent].add(nodes[bone.index]);
    else root.add(nodes[bone.index]);
    if (bone.parent >= 0 && nodes[bone.parent]) linePairs.push([bone.parent, bone.index]);
  }

  root.updateMatrixWorld(true);
  const points = new Array(linePairs.length * 6).fill(0);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x66d9ff,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = 10;
  root.add(lines);

  const jointGeometry = new THREE.SphereGeometry(1.25, 8, 6);
  const jointMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd866,
    depthTest: false,
  });
  const markers = [];
  for (const bone of skeleton.bones) {
    const marker = new THREE.Mesh(jointGeometry, jointMaterial);
    marker.renderOrder = 11;
    markers.push(marker);
    root.add(marker);
  }

  root.userData.boneCount = skeleton.boneCount;
  root.userData.nodes = nodes;
  root.userData.linePairs = linePairs;
  root.userData.lines = lines;
  root.userData.markers = markers;
  updateSkeletonOverlayGeometry(root);
  return root;
}

async function syncSkeletonOverlay() {
  disposeSkeleton();
  activeSkeletonStatsText = "";
  renderStats();
  if (!bonesToggle.checked || !activeObject || !activeManifestItem) return;

  const skeleton = await fetchSkeleton(activeManifestItem);
  if (!skeleton) {
    activeSkeletonStatsText = "no skeleton";
    renderStats();
    return;
  }

  activeSkeleton = buildSkeletonOverlay(skeleton);
  activeObject.add(activeSkeleton);
  applyAnimationPose(activePoseBlend);
  activeSkeletonStatsText = `${skeleton.boneCount} bones`;
  renderStats();
}

function setActiveObject(object, label, sourceSize = null, options = {}) {
  const shouldResetCamera = !activeObject;
  const manifestItem = options.manifestItem ?? activeManifestItem;
  if (activeObject) {
    clearAttachmentObjects();
    clearRuntimeEffectObjects();
    scene.remove(activeObject);
    disposeObject(activeObject);
  }
  disposeSkeleton();

  activeCameraClipSphere = null;
  activeObject = object;
  activeSourceSize = sourceSize;
  if (!options.preserveMaterials) applyMaterial(activeObject);
  applyCharacterMaterialRuntimePipeline(
    activeObject,
    (material) => materialRuntimePipelineRowForMaterial(material, manifestItem),
    loadCharacterRuntimeMaterialTexture,
    THREE,
    {
      activeSkinId: modelSkinId(manifestItem),
      rel: manifestItem?.rel || "",
    },
  );
  applyPreviewMaterialFixups(activeObject);
  prepareSkinnedMeshBones(activeObject);
  activeObject.userData.runtimeSkinGraphItem = runtimeSkinGraphItem(manifestItem);
  activeObject.userData.runtimeBindingConfigItem = runtimeBindingConfigItem(manifestItem);
  activeObject.userData.runtimeAttachmentBonesItem = runtimeAttachmentBonesItem(manifestItem);
  activeObject.userData.runtimeBindSlots = runtimeBindSlotsForItem(manifestItem);
  scene.add(activeObject);
  activeObject.userData.modelFormRuntime = prepareActiveModelFormRuntime(manifestItem);
  syncModelFormControls();
  syncModelFormGeometry();
  frameObject(activeObject, { resetCamera: shouldResetCamera });
  syncRuntimeEffectPreviews();
  syncPreviewEffectVisibility();
  scheduleAutoFrameIfCanvasBlank(activeObject, { minProjectedCoverage: MIN_REFIT_PROJECTED_VIEWPORT_COVERAGE });
  emptyState.style.display = "none";

  modelPath.textContent = label;
  activeSkeletonStatsText = "";
  activeAnimationStatsText = "";
  syncBaseStats();
  syncModelHealth();
  syncTimelineControls();
}

function clearActiveModelButtons() {
  for (const button of modelList.querySelectorAll(".model-button.active")) {
    button.classList.remove("active");
    button.setAttribute("aria-pressed", "false");
  }
  if (activeButton) {
    activeButton.classList.remove("active");
    activeButton.setAttribute("aria-pressed", "false");
  }
}

async function loadManifestModel(item, button) {
  const loadToken = ++activeLoadToken;
  const loadFormat = currentFormat();
  const loadRoot = assetRoot(item);
  const shouldResetCameraAfterAnimationPose = !activeObject;
  clearActiveModelButtons();
  activeButton = button;
  activeButton.classList.add("active");
  activeButton.setAttribute("aria-pressed", "true");
  activeIdentity = itemIdentity(item);
  activeManifestItem = item;

  resetViewerControlsForModel();
  modelPath.textContent = item.rel;
  modelStats.textContent = "正在加载...";
  syncAttachmentSelect(item);
  syncFormatControls();

  const object =
    loadFormat !== "obj" ? (await gltfLoader.loadAsync(`${loadRoot}${item.rel}`)).scene : await objLoader.loadAsync(`${loadRoot}${item.rel}`);
  if (loadToken !== activeLoadToken || activeManifestItem !== item || activeIdentity !== itemIdentity(item) || currentFormat() !== loadFormat) {
    disposeObject(object);
    return;
  }
  setActiveObject(object, item.rel, item.size, { preserveMaterials: loadFormat !== "obj", manifestItem: item });
  queueFrameAfterAnimationPose(object, shouldResetCameraAfterAnimationPose);
  syncAnimationSelect(item);
  frameActiveObjectAfterPendingAnimationPose();
  syncSkeletonOverlay().catch((error) => {
    activeSkeletonStatsText = `skeleton failed: ${error.message}`;
    renderStats();
  });
}

function loadObjText(text, label) {
  activeIdentity = "";
  activeManifestItem = null;
  syncAttachmentSelect(null);
  const object = objLoader.parse(text);
  setActiveObject(object, label);
  syncAnimationSelect(null);
}

async function loadGlbBuffer(buffer, label) {
  activeIdentity = "";
  activeManifestItem = null;
  syncAttachmentSelect(null);
  const gltf = await new Promise((resolve, reject) => {
    gltfLoader.parse(buffer, "", resolve, reject);
  });
  setActiveObject(gltf.scene, label, null, { preserveMaterials: true });
  syncAnimationSelect(null);
}

function renderList() {
  const query = normalizeSearchValue(searchInput.value);
  const character = characterSelect.value;
  const queryIsHeroSelection = searchMatchesSelectedHero();
  const filtered = currentManifest().filter((item) => {
    if (character && heroKeyForItem(item) !== character) return false;
    if (!query || queryIsHeroSelection) return true;
    return searchIndexMatches(itemSearchIndex(item), query);
  });

  modelCount.textContent = filtered.length;
  modelList.replaceChildren();

  for (const item of filtered) {
    const selected = itemIdentity(item) === activeIdentity;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "model-button";
    button.dataset.identity = itemIdentity(item);
    button.title = item.rel;
    button.setAttribute("aria-pressed", String(selected));
    const radio = document.createElement("span");
    radio.className = "model-radio";
    radio.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "model-name";
    const title = document.createElement("span");
    title.className = "model-title";
    title.textContent = displayItemCharacter(item);
    const subtitle = document.createElement("span");
    subtitle.className = "model-subtitle";
    subtitle.textContent = displayVariant(item);
    const path = document.createElement("span");
    path.className = "model-path";
    path.textContent = item.rel;
    name.append(title, subtitle, path);
    const meta = document.createElement("span");
    meta.className = "model-meta";
    meta.textContent = `${formatBytes(item.size)}${item.relationshipMatched ? relationshipStats(item) : ""}`;
    button.append(radio, name, meta);
    if (selected) button.classList.add("active");
    button.addEventListener("click", () => {
      loadManifestModel(item, button).catch((error) => {
        modelStats.textContent = `加载失败：${error.message}`;
      });
    });
    modelList.appendChild(button);
  }
}

async function fetchManifest(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  const data = await response.json();
  return data.items || [];
}

async function fetchJson(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

function buttonForItem(item) {
  return [...modelList.querySelectorAll(".model-button")].find((button) => button.dataset.identity === itemIdentity(item));
}

function loadDefaultModel() {
  const manifest = currentManifest();
  const first =
    manifest.find((item) => activeIdentity && itemIdentity(item) === activeIdentity) ||
    manifest.find((item) => heroKeyForItem(item) === "Ringo") ||
    manifest[0];

  if (!first) return;
  loadManifestModel(first, buttonForItem(first) || document.createElement("button")).catch(() => {});
}

function defaultStaticFormat() {
  if (manifests.pbr.length) return "pbr";
  if (manifests.all.length) return "all";
  if (manifests.textured.length) return "textured";
  if (manifests.glb.length) return "glb";
  return "obj";
}

function setPreviewMode(mode) {
  if (mode === "skinned") {
    formatSelect.value = "skinned";
  } else if (isAnimationFormat()) {
    formatSelect.value = defaultStaticFormat();
  }
  formatSelect.dispatchEvent(new Event("change"));
}

async function init() {
  const [
    skinnedManifest,
    skinPbrManifest,
    pbrManifest,
    allManifest,
    texturedManifest,
    glbManifest,
    objManifest,
    skeletons,
    animationBindingManifest,
    animationStructureManifest,
    animationBoneMappingManifest,
    runtimeSkinGraphManifest,
    runtimeBindingConfigManifest,
    runtimeAttachmentBonesManifest,
    runtimeAttachmentVisibilityManifest,
    runtimeEffectHookManifest,
    runtimeEffectNativeOptionProfileManifest,
    runtimeEffectGapManifest,
    runtimeEffectDefinitionNeighborhoodManifest,
    nativeEffectRuntimeSchemaManifest,
    nativeEffectRuntimeLinksManifest,
    nativeParticleRuntimeSchemaManifest,
    nativeParticleCallbackTableScanManifest,
    nativeParticleCallbackSemanticsManifest,
    pfxEncryptedRuntimeTargetManifest,
    pfxNativeCallbackRuntimeTargetManifest,
    pfxNativeCallbackCaptureManifest,
    effectNativeChannelCaptureTargetManifest,
    effectNativeChannelCaptureManifest,
    effectChannelStaticResourceAuditManifest,
    nativeEffectTokenOnlyCallsiteAuditManifest,
    nativeEffectHashMissingOwnerAuditManifest,
    kindredHashPfxRuntimeGateAuditManifest,
    kindredEffectComponentRuntimeChainAuditManifest,
    kindredCurrentParticleBridgeAuditManifest,
    cff0EffectInstanceGraphManifest,
    cff0EffectInstanceGapManifest,
    runtimeEffectPfxManifest,
    runtimeEffectShadergraphManifest,
    runtimeEffectDefinitionProjectileManifest,
    runtimeEffectProjectileRuntimeManifest,
    runtimeEffectProjectileGapManifest,
    runtimeEffectProjectileCreateBridgeManifest,
    runtimeEffectProjectileTargetDispatchManifest,
    runtimeEffectProjectileVtableSlotManifest,
    runtimeEffectProjectileVtableFunctionManifest,
    runtimeEffectProjectileVtableOutputLayoutManifest,
    runtimeEffectProjectileVtableCallsitePayloadManifest,
    runtimeEffectProjectileVtableSemanticJoinManifest,
    runtimeEffectProjectileConsumerTraceManifest,
    runtimeEffectProjectileCurrentTokenWindowManifest,
    runtimeEffectProjectileCurrentBranchTargetManifest,
    runtimeEffectProjectileCurrentFieldWriterCallsiteManifest,
    runtimeEffectProjectileCurrentFieldReaderCandidateManifest,
    runtimeEffectProjectileCurrentFieldReaderCallsiteContextManifest,
    runtimeEffectProjectileCurrentFieldReaderDownstreamRouteManifest,
    runtimeEffectProjectileCurrentFieldReaderListDispatchManifest,
    runtimeEffectProjectileCurrentTokenChildObjectChainManifest,
    runtimeEffectProjectileCurrentTokenChildCallbackBodyManifest,
    runtimeEffectProjectileCurrentTokenChildClassMethodManifest,
    runtimeEffectProjectileCurrentTokenChildEvaluatorPayloadManifest,
    runtimeEffectProjectileCurrentTokenChildPayloadSetterManifest,
    runtimeEffectProjectileCurrentTokenChildPayloadSetterDownstreamManifest,
    runtimeEffectProjectileCurrentTokenChildManagerRecordBridgeManifest,
    runtimeEffectProjectileCurrentTokenChildEffectOwnerCandidateManifest,
    runtimeEffectProjectileCurrentTokenChildStaticPfxOwnerManifest,
    runtimeNativeProjectileManifest,
    runtimeNativeProjectileCallbackManifest,
    runtimeTimelineManifest,
    heroCatalogManifest,
    skinCatalogManifest,
    runtimeResourceCompletenessManifest,
    runtimeSkinVariantAliasManifest,
    runtimeSkinEffectAliasManifest,
    glbMaterialCoverageManifest,
    materialRuntimePipelineManifest,
    materialRenderStateAuditManifest,
    runtimeStateConditionManifest,
    runtimeAttachmentNativeChainManifest,
    nativeEffectBuilderMethodSemanticsManifest,
    nativeTransientEffectPrimitiveChainManifest,
    nativeTransientRenderRecordSchemaManifest,
    nativeTransientRenderRecordCallsiteScanManifest,
    nativeTransientRecordRuntimeExecutorManifest,
    currentNativeParticleDrawChainManifest,
    currentNativeParticleRegistrationChainManifest,
    currentNativeLayoutAOwnerGlobalUsageManifest,
    currentNativeLayoutARefreshStateSourceManifest,
    currentNativeLayoutAStateWriterManifest,
    currentNativeLayoutAStateRegistrationManifest,
    currentNativeLayoutAAddRecordFlagSourceManifest,
    currentNativeParticleMaskCandidateOwnerManifest,
    currentNativeType210PrimitiveBuilderManifest,
    currentNativeType210LevelVisualsBridgeManifest,
    currentNativeLayoutBTypeOwnerManifest,
    currentNativeLayoutBEntryOwnerManifest,
    currentNativeObjectAcWidthOverlapManifest,
    currentNativeObjectAcOwnerTraceManifest,
    currentNativeLayoutBCallbackBoundaryManifest,
    currentNativeLayoutBIndirectSlotManifest,
    currentNativeLayoutBSlotRecordBridgeManifest,
    currentNativeLayoutBActiveRecordLifecycleManifest,
    currentNativeLayoutBTargetPayloadManifest,
    currentNativeLayoutBPfxTargetFactoryManifest,
    currentNativeLayoutBTargetCacheManifest,
    currentNativeLayoutBTargetPayloadNodeChainManifest,
    currentNativeLayoutBPayloadSourceProgramBridgeManifest,
    currentNativeLayoutBManagerDrawBridgeManifest,
    currentNativeLayoutBParticleEntryDispatchManifest,
    currentNativeLayoutBEntryProviderPayloadBridgeManifest,
    currentNativeLayoutBOwnerBVtableDispatchManifest,
    currentNativeLayoutBPrimitiveModeDispatchManifest,
    currentNativeLayoutBMaterialDrawBridgeManifest,
    currentNativeLayoutBFinalPrimitiveConsumerManifest,
    currentNativeLayoutBShaderParameterBridgeManifest,
    currentNativeShaderDataType4ValueSourceManifest,
    currentNativeShaderDataType4EntrySemanticsManifest,
    currentNativeTexDataTextureObjectManifest,
    currentNativeShaderDataTextureSamplerTableManifest,
    currentNativeShaderDataExternalTextureBindingManifest,
    currentNativeTextureSamplerStateSemanticsManifest,
    currentNativeShaderDataInlineTexturePlaceholderManifest,
    currentNativeShadergraphSamplerTexDataJoinManifest,
    currentNativeMaterialSourceProgramCaptureTargetManifest,
    currentNativeMaterialSourceProgramCaptureManifest,
    currentNativeDefinitionShaderParamStaticStringManifest,
    currentNativeDefinitionShaderParamsPayloadStructureManifest,
    currentNativeMaterialSamplerOwnershipGateManifest,
    currentNativeRuntimeCaptureGateManifest,
    currentNativeDynamicSourceTableSemanticsManifest,
    currentNativeStaticMeshSelectorEntryManifest,
    currentNativeShaderParamsSchemaManifest,
    currentNativeStaticMeshShaderParamsCaptureTargetManifest,
    currentNativeStaticMeshShaderParamsCaptureManifest,
    currentNativeShaderParamsValueSemanticsManifest,
    currentNativeLayoutBObjectAcStoreCoverageManifest,
    currentNativeLayoutBObjectAcRuntimeCaptureTargetManifest,
    currentNativeLayoutBObjectAcRuntimeCaptureManifest,
    currentNativeLayoutBObjectAcCandidateDisqualificationManifest,
    currentNativeLayoutBPayloadRecordLayoutManifest,
    currentNativeLayoutBFlagProducerManifest,
    currentNativeLayoutBVisibilityGateManifest,
    currentNativeLayoutBTargetStatusManifest,
    currentNativeLayoutBRefreshModeSplitManifest,
    currentNativeLayoutBQueryApplyPathManifest,
    currentNativeLayoutBSharedStructApplyManifest,
    currentNativeLayoutBCallerStructInitializerManifest,
    currentNativeLayoutBComponentTableEntryManifest,
    currentNativeLayoutBComponentTableOwnerManifest,
    currentNativeLayoutBComponentSlotRegistrationManifest,
    currentNativeLayoutBDirectCallerStructBuilderManifest,
    currentNativeLayoutBResourceCallerDynamicFieldsManifest,
    currentNativeLayoutBCommonApplySetterFieldsManifest,
    currentNativeLayoutBObjectAcProducerGateManifest,
    currentNativePositionSamplerOwnerManifest,
    currentNativeLevelRuntimeOwnerManifest,
    currentNativeRuntimeKeySelectorCaptureTargetManifest,
    runtimeKeySelectorCaptureManifest,
    currentNativeLightProbeChainManifest,
    characterLitProbeBlockerManifest,
    heroPreviewProfileCandidateManifest,
    nativeBinaryVersionAuditManifest,
  ] = await Promise.allSettled([
    fetchManifest("./skinned-glb-pbr-manifest.json"),
    fetchManifest("./skin-glb-pbr-manifest.json"),
    fetchManifest("./textured-glb-pbr-manifest.json"),
    fetchManifest("./all-glb-pbr-manifest.json"),
    fetchManifest("./textured-glb-mtl-manifest.json"),
    fetchManifest("./glb-manifest.json"),
    fetchManifest("./obj-manifest.json"),
    fetchManifest("./skeleton-manifest.json"),
    fetchManifest("./skin-animation-bindings.json"),
    fetchManifest("./animation-structure-manifest.json"),
    fetchManifest("./animation-bone-mapping-manifest.json"),
    fetchManifest("./runtime-skin-graph.json"),
    fetchManifest("./runtime-binding-config.json"),
    fetchManifest("./runtime-attachment-bones.json"),
    fetchManifest("./runtime-attachment-visibility-manifest.json"),
    fetchJson("./effect-hook-runtime-manifest.json"),
    fetchJson("./effect-native-option-profile.json"),
    fetchJson("./effect-runtime-gaps.json"),
    fetchJson("./native-effect-definition-neighborhood.json"),
    fetchJson("./native-effect-runtime-schema.json"),
    fetchJson("./native-effect-runtime-links.json"),
    fetchJson("./native-particle-runtime-schema.json"),
    fetchJson("./native-particle-callback-table-scan.json"),
    fetchJson("./native-particle-callback-semantics.json"),
    fetchJson("./pfx-encrypted-runtime-targets.json"),
    fetchJson("./pfx-native-callback-runtime-targets.json"),
    fetchJson("./pfx-native-callback-capture-summary.json"),
    fetchJson("./effect-native-channel-capture-targets.json"),
    fetchJson("./effect-native-channel-capture-summary.json"),
    fetchJson("./effect-channel-static-resource-audit.json"),
    fetchJson("./native-effect-token-only-callsite-audit.json"),
    fetchJson("./native-effect-hash-missing-owner-audit.json"),
    fetchJson("./kindred-hash-pfx-runtime-gate-audit.json"),
    fetchJson("./kindred-effect-component-runtime-chain-audit.json"),
    fetchJson("./kindred-current-particle-bridge-audit.json"),
    fetchJson("./cff0-effect-instance-graph.json"),
    fetchJson("./cff0-effect-instance-gaps.json"),
    fetchManifest("./effect-pfx-resource-manifest.json"),
    fetchManifest("./effect-shadergraph-material-manifest.json"),
    fetchManifest("./effect-projectile-definition-manifest.json"),
    fetchJson("./effect-projectile-runtime-manifest.json"),
    fetchJson("./effect-projectile-runtime-gap-audit.json"),
    fetchJson("./effect-projectile-create-bridge-audit.json"),
    fetchJson("./effect-projectile-target-dispatch-audit.json"),
    fetchJson("./effect-projectile-vtable-slot-audit.json"),
    fetchJson("./effect-projectile-vtable-function-audit.json"),
    fetchJson("./effect-projectile-vtable-output-layout-audit.json"),
    fetchJson("./effect-projectile-vtable-callsite-payload-audit.json"),
    fetchJson("./effect-projectile-vtable-semantic-join-audit.json"),
    fetchJson("./effect-projectile-runtime-consumer-trace-audit.json"),
    fetchJson("./effect-projectile-current-token-window-audit.json"),
    fetchJson("./effect-projectile-current-branch-target-audit.json"),
    fetchJson("./effect-projectile-current-field-writer-callsite-audit.json"),
    fetchJson("./effect-projectile-current-field-reader-candidate-audit.json"),
    fetchJson("./effect-projectile-current-field-reader-callsite-context-audit.json"),
    fetchJson("./effect-projectile-current-field-reader-downstream-route-audit.json"),
    fetchJson("./effect-projectile-current-field-reader-list-dispatch-audit.json"),
    fetchJson("./effect-projectile-current-token-child-object-chain-audit.json"),
    fetchJson("./effect-projectile-current-token-child-callback-body-audit.json"),
    fetchJson("./effect-projectile-current-token-child-class-method-audit.json"),
    fetchJson("./effect-projectile-current-token-child-evaluator-payload-audit.json"),
    fetchJson("./effect-projectile-current-token-child-payload-setter-audit.json"),
    fetchJson("./effect-projectile-current-token-child-payload-setter-downstream-audit.json"),
    fetchJson("./effect-projectile-current-token-child-manager-record-bridge-audit.json"),
    fetchJson("./effect-projectile-current-token-child-effect-owner-candidate-audit.json"),
    fetchJson("./effect-projectile-current-token-child-static-pfx-owner-audit.json"),
    fetchManifest("./native-projectile-spawn-manifest.json"),
    fetchManifest("./native-projectile-callback-semantics.json"),
    fetchManifest("./native-runtime-timeline-manifest.json"),
    fetchJson("./hero-catalog.json"),
    fetchJson("./skin-catalog.json"),
    fetchJson("./runtime-resource-completeness.json"),
    fetchJson("./runtime-skin-variant-aliases.json"),
    fetchJson("./runtime-skin-effect-aliases.json"),
    fetchJson("./glb-material-coverage.json"),
    fetchJson("./material-runtime-pipeline-manifest.json", { cache: "no-store" }),
    fetchJson("./material-render-state-audit.json"),
    fetchJson("./runtime-state-conditions.json"),
    fetchJson("./runtime-attachment-native-chain-manifest.json"),
    fetchJson("./native-effect-builder-method-semantics.json"),
    fetchJson("./native-transient-effect-primitive-chain.json"),
    fetchJson("./native-transient-render-record-schema.json"),
    fetchJson("./native-transient-render-record-callsite-scan.json"),
    fetchJson("./native-transient-record-runtime-executor.json"),
    fetchJson("./current-native-particle-draw-chain-audit.json"),
    fetchJson("./current-native-particle-registration-chain-audit.json"),
    fetchJson("./current-native-layout-a-owner-global-usage-audit.json"),
    fetchJson("./current-native-layout-a-refresh-state-source-audit.json"),
    fetchJson("./current-native-layout-a-state-writer-audit.json"),
    fetchJson("./current-native-layout-a-state-registration-audit.json"),
    fetchJson("./current-native-layout-a-add-record-flag-source-audit.json"),
    fetchJson("./current-native-particle-mask-candidate-owner-audit.json"),
    fetchJson("./current-native-type210-primitive-builder-audit.json"),
    fetchJson("./current-native-type210-levelvisuals-bridge-audit.json"),
    fetchJson("./current-native-layout-b-type-owner-audit.json"),
    fetchJson("./current-native-layout-b-entry-owner-audit.json"),
    fetchJson("./current-native-object-ac-width-overlap-audit.json"),
    fetchJson("./current-native-object-ac-owner-trace-audit.json"),
    fetchJson("./current-native-layout-b-callback-boundary-audit.json"),
    fetchJson("./current-native-layout-b-indirect-slot-audit.json"),
    fetchJson("./current-native-layout-b-slot-record-bridge-audit.json"),
    fetchJson("./current-native-layout-b-active-record-lifecycle-audit.json"),
    fetchJson("./current-native-layout-b-target-payload-audit.json"),
    fetchJson("./current-native-layout-b-pfx-target-factory-audit.json"),
    fetchJson("./current-native-layout-b-target-cache-audit.json"),
    fetchJson("./current-native-layout-b-target-payload-node-chain-audit.json"),
    fetchJson("./current-native-layout-b-payload-source-program-bridge-audit.json"),
    fetchJson("./current-native-layout-b-manager-draw-bridge-audit.json"),
    fetchJson("./current-native-layout-b-particle-entry-dispatch-audit.json"),
    fetchJson("./current-native-layout-b-entry-provider-payload-bridge-audit.json"),
    fetchJson("./current-native-layout-b-owner-b-vtable-dispatch-audit.json"),
    fetchJson("./current-native-layout-b-primitive-mode-dispatch-audit.json"),
    fetchJson("./current-native-layout-b-material-draw-bridge-audit.json"),
    fetchJson("./current-native-layout-b-final-primitive-consumer-audit.json"),
    fetchJson("./current-native-layout-b-shader-parameter-bridge-audit.json"),
    fetchJson("./current-native-shaderdata-type4-value-source-audit.json"),
    fetchJson("./current-native-shaderdata-type4-entry-semantics-audit.json"),
    fetchJson("./current-native-texdata-texture-object-audit.json"),
    fetchJson("./current-native-shaderdata-texture-sampler-table-audit.json"),
    fetchJson("./current-native-shaderdata-external-texture-binding-audit.json"),
    fetchJson("./current-native-texture-sampler-state-semantics-audit.json"),
    fetchJson("./current-native-shaderdata-inline-texture-placeholder-audit.json"),
    fetchJson("./current-native-shadergraph-sampler-texdata-join-audit.json"),
    fetchJson("./current-native-material-source-program-capture-targets.json"),
    fetchJson("./current-native-material-source-program-capture-summary.json"),
    fetchJson("./current-native-definition-shaderparam-static-string-audit.json"),
    fetchJson("./current-native-definition-shaderparams-payload-structure-audit.json"),
    fetchJson("./current-native-material-sampler-ownership-gate-audit.json"),
    fetchJson("./current-native-runtime-capture-gate-audit.json"),
    fetchJson("./current-native-dynamic-source-table-semantics-audit.json"),
    fetchJson("./current-native-static-mesh-selector-entry-audit.json"),
    fetchJson("./current-native-shaderparams-schema-audit.json"),
    fetchJson("./current-native-static-mesh-shaderparams-capture-targets.json"),
    fetchJson("./current-native-static-mesh-shaderparams-capture-summary.json"),
    fetchJson("./current-native-shaderparams-value-semantics-audit.json"),
    fetchJson("./current-native-layout-b-object-ac-store-coverage-audit.json"),
    fetchJson("./current-native-layout-b-object-ac-runtime-capture-targets.json"),
    fetchJson("./current-native-layout-b-object-ac-runtime-capture-summary.json"),
    fetchJson("./current-native-layout-b-object-ac-candidate-disqualification-audit.json"),
    fetchJson("./current-native-layout-b-payload-record-layout-audit.json"),
    fetchJson("./current-native-layout-b-flag-producer-audit.json"),
    fetchJson("./current-native-layout-b-visibility-gate-audit.json"),
    fetchJson("./current-native-layout-b-target-status-audit.json"),
    fetchJson("./current-native-layout-b-refresh-mode-split-audit.json"),
    fetchJson("./current-native-layout-b-query-apply-path-audit.json"),
    fetchJson("./current-native-layout-b-shared-struct-apply-audit.json"),
    fetchJson("./current-native-layout-b-caller-struct-initializer-audit.json"),
    fetchJson("./current-native-layout-b-component-table-entry-audit.json"),
    fetchJson("./current-native-layout-b-component-table-owner-audit.json"),
    fetchJson("./current-native-layout-b-component-slot-registration-audit.json"),
    fetchJson("./current-native-layout-b-direct-caller-struct-builder-audit.json"),
    fetchJson("./current-native-layout-b-resource-caller-dynamic-fields-audit.json"),
    fetchJson("./current-native-layout-b-common-apply-setter-fields-audit.json"),
    fetchJson("./current-native-layout-b-object-ac-producer-gate-audit.json"),
    fetchJson("./current-native-position-sampler-owner-audit.json"),
    fetchJson("./current-native-level-runtime-owner-audit.json"),
    fetchJson("./current-native-runtime-key-selector-capture-targets.json"),
    fetchJson("./runtime-key-selector-capture-summary.json"),
    fetchJson("./current-native-light-probe-chain-audit.json"),
    fetchJson("./character-lit-probe-blocker-audit.json"),
    fetchJson("./hero-preview-profile-candidates.json"),
    fetchJson("./native-binary-version-audit.json"),
  ]);

  manifests.pbr =
    skinPbrManifest.status === "fulfilled" && skinPbrManifest.value.length
      ? skinPbrManifest.value
      : pbrManifest.status === "fulfilled"
        ? pbrManifest.value
        : [];
  manifests.skinned = skinnedManifest.status === "fulfilled" ? skinnedManifest.value : [];
  {
    runtimeSkinVariantAliasSummary =
      runtimeSkinVariantAliasManifest.status === "fulfilled" ? runtimeSkinVariantAliasManifest.value.summary || null : null;
    const runtimeSkinVariantAliases =
      runtimeSkinVariantAliasManifest.status === "fulfilled" ? runtimeSkinVariantAliasManifest.value.items || [] : [];
    runtimeSkinVariantAliasesBySkinId = buildRuntimeSkinVariantAliasLookup(runtimeSkinVariantAliases);
    manifests.pbr = dedupeManifestItems(applySkinVariantAliasesToManifest(manifests.pbr, runtimeSkinVariantAliases));
    manifests.skinned = dedupeManifestItems(applySkinVariantAliasesToManifest(manifests.skinned, runtimeSkinVariantAliases));
  }
  {
    runtimeSkinEffectAliasSummary =
      runtimeSkinEffectAliasManifest.status === "fulfilled" ? runtimeSkinEffectAliasManifest.value.summary || null : null;
    const runtimeSkinEffectAliases =
      runtimeSkinEffectAliasManifest.status === "fulfilled" ? runtimeSkinEffectAliasManifest.value.items || [] : [];
    runtimeSkinEffectAliasesByModelLabel = buildRuntimeSkinEffectAliasLookup(runtimeSkinEffectAliases);
  }
  manifests.all = dedupeManifestItems(allManifest.status === "fulfilled" ? allManifest.value : []);
  manifests.textured = dedupeManifestItems(texturedManifest.status === "fulfilled" ? texturedManifest.value : []);
  manifests.glb = dedupeManifestItems(glbManifest.status === "fulfilled" ? glbManifest.value : []);
  manifests.obj = dedupeManifestItems(objManifest.status === "fulfilled" ? objManifest.value : []);
  skeletonManifest = new Set((skeletons.status === "fulfilled" ? skeletons.value : []).map((item) => item.rel));
  animationBindings = new Map((animationBindingManifest.status === "fulfilled" ? animationBindingManifest.value : []).map((item) => [item.rel, item]));
  animationStructures = new Map(
    (animationStructureManifest.status === "fulfilled" ? animationStructureManifest.value : []).map((item) => [item.relativePath, item]),
  );
  animationBoneMappings = new Map(
    (animationBoneMappingManifest.status === "fulfilled" ? animationBoneMappingManifest.value : []).map((item) => [
      `${item.animationPath}\t${item.skeletonPath}`,
      item,
    ]),
  );
  runtimeSkinGraph = buildRuntimeLookup(runtimeSkinGraphManifest.status === "fulfilled" ? runtimeSkinGraphManifest.value : []);
  runtimeBindingConfig = buildRuntimeLookup(runtimeBindingConfigManifest.status === "fulfilled" ? runtimeBindingConfigManifest.value : []);
  runtimeAttachmentBones = buildRuntimeLookup(runtimeAttachmentBonesManifest.status === "fulfilled" ? runtimeAttachmentBonesManifest.value : []);
  runtimeAttachmentVisibilityByModel = buildRuntimeAttachmentVisibilityLookup(
    runtimeAttachmentVisibilityManifest.status === "fulfilled" ? runtimeAttachmentVisibilityManifest.value : [],
  );
  {
    runtimeEffectHookSummary = runtimeEffectHookManifest.status === "fulfilled" ? runtimeEffectHookManifest.value.summary || null : null;
    runtimeEffectNativeOptionProfileSummary =
      runtimeEffectNativeOptionProfileManifest.status === "fulfilled" ? runtimeEffectNativeOptionProfileManifest.value.summary || null : null;
    runtimeEffectGapSummary = runtimeEffectGapManifest.status === "fulfilled" ? runtimeEffectGapManifest.value.summary || null : null;
    runtimeEffectDefinitionNeighborhoodSummary =
      runtimeEffectDefinitionNeighborhoodManifest.status === "fulfilled"
        ? runtimeEffectDefinitionNeighborhoodManifest.value.summary || null
        : null;
    nativeEffectRuntimeSchemaSummary =
      nativeEffectRuntimeSchemaManifest.status === "fulfilled"
        ? nativeEffectRuntimeSchemaManifest.value.summary || null
        : null;
    nativeEffectRuntimeLinksSummary =
      nativeEffectRuntimeLinksManifest.status === "fulfilled"
        ? nativeEffectRuntimeLinksManifest.value.summary || null
        : null;
    nativeParticleRuntimeSchemaSummary =
      nativeParticleRuntimeSchemaManifest.status === "fulfilled"
        ? nativeParticleRuntimeSchemaManifest.value.summary || null
        : null;
    nativeParticleCallbackTableScanSummary =
      nativeParticleCallbackTableScanManifest.status === "fulfilled"
        ? nativeParticleCallbackTableScanManifest.value.summary || null
        : null;
    nativeParticleCallbackSemanticsSummary =
      nativeParticleCallbackSemanticsManifest.status === "fulfilled"
        ? nativeParticleCallbackSemanticsManifest.value.summary || null
        : null;
    pfxEncryptedRuntimeTargetSummary =
      pfxEncryptedRuntimeTargetManifest.status === "fulfilled"
        ? pfxEncryptedRuntimeTargetManifest.value.summary || null
        : null;
    pfxNativeCallbackRuntimeTargetSummary =
      pfxNativeCallbackRuntimeTargetManifest.status === "fulfilled"
        ? pfxNativeCallbackRuntimeTargetManifest.value.summary || null
        : null;
    pfxNativeCallbackCaptureSummary =
      pfxNativeCallbackCaptureManifest.status === "fulfilled"
        ? pfxNativeCallbackCaptureManifest.value.summary || null
        : null;
    effectNativeChannelCaptureTargetSummary =
      effectNativeChannelCaptureTargetManifest.status === "fulfilled"
        ? effectNativeChannelCaptureTargetManifest.value.summary || null
        : null;
    effectNativeChannelCaptureSummary =
      effectNativeChannelCaptureManifest.status === "fulfilled"
        ? effectNativeChannelCaptureManifest.value.summary || null
        : null;
    effectChannelStaticResourceAuditSummary =
      effectChannelStaticResourceAuditManifest.status === "fulfilled"
        ? effectChannelStaticResourceAuditManifest.value.summary || null
        : null;
    nativeEffectTokenOnlyCallsiteAuditSummary =
      nativeEffectTokenOnlyCallsiteAuditManifest.status === "fulfilled"
        ? nativeEffectTokenOnlyCallsiteAuditManifest.value.summary || null
        : null;
    nativeEffectHashMissingOwnerAuditSummary =
      nativeEffectHashMissingOwnerAuditManifest.status === "fulfilled"
        ? nativeEffectHashMissingOwnerAuditManifest.value.summary || null
        : null;
    kindredHashPfxRuntimeGateAuditSummary =
      kindredHashPfxRuntimeGateAuditManifest.status === "fulfilled"
        ? kindredHashPfxRuntimeGateAuditManifest.value.summary || null
        : null;
    kindredEffectComponentRuntimeChainAuditSummary =
      kindredEffectComponentRuntimeChainAuditManifest.status === "fulfilled"
        ? kindredEffectComponentRuntimeChainAuditManifest.value.summary || null
        : null;
    kindredCurrentParticleBridgeAuditSummary =
      kindredCurrentParticleBridgeAuditManifest.status === "fulfilled"
        ? kindredCurrentParticleBridgeAuditManifest.value.summary || null
        : null;
    cff0EffectInstanceGraphSummary =
      cff0EffectInstanceGraphManifest.status === "fulfilled"
        ? cff0EffectInstanceGraphManifest.value.summary || null
        : null;
    cff0EffectInstanceGapSummary =
      cff0EffectInstanceGapManifest.status === "fulfilled"
        ? cff0EffectInstanceGapManifest.value.summary || null
        : null;
    cff0EffectInstanceGraphByModelLabel = buildCff0EffectInstanceGraphLookup(
      cff0EffectInstanceGraphManifest.status === "fulfilled"
        ? cff0EffectInstanceGraphManifest.value.items || []
        : [],
    );
    runtimeEffectDefinitionNeighborhoodByModelLabel = buildRuntimeEffectDefinitionNeighborhoodLookup(
      runtimeEffectDefinitionNeighborhoodManifest.status === "fulfilled"
        ? runtimeEffectDefinitionNeighborhoodManifest.value.items || []
        : [],
    );
    const effectHookLookup = buildRuntimeEffectHookLookup(
      runtimeEffectHookManifest.status === "fulfilled" ? runtimeEffectHookManifest.value.items || [] : [],
    );
    runtimeEffectHooksByDefinition = effectHookLookup.byDefinition;
    runtimeEffectHooksByHero = effectHookLookup.byHero;
  }
  runtimeEffectPfxByPath = buildRuntimeEffectPfxLookup(runtimeEffectPfxManifest.status === "fulfilled" ? runtimeEffectPfxManifest.value : []);
  runtimeEffectPfxByHero = buildRuntimeEffectPfxHeroLookup(runtimeEffectPfxManifest.status === "fulfilled" ? runtimeEffectPfxManifest.value : []);
  runtimeEffectShadergraphByPath = buildRuntimeEffectShadergraphLookup(
      runtimeEffectShadergraphManifest.status === "fulfilled" ? runtimeEffectShadergraphManifest.value : [],
    );
    runtimeEffectDefinitionProjectilesByModelLabel = buildRuntimeEffectDefinitionProjectileLookup(
      runtimeEffectDefinitionProjectileManifest.status === "fulfilled" ? runtimeEffectDefinitionProjectileManifest.value : [],
    );
    runtimeEffectProjectileRuntimeLoaded = runtimeEffectProjectileRuntimeManifest.status === "fulfilled";
    runtimeEffectProjectileRuntimeSummary =
      runtimeEffectProjectileRuntimeLoaded ? runtimeEffectProjectileRuntimeManifest.value.summary || null : null;
    runtimeEffectProjectileGapSummary =
      runtimeEffectProjectileGapManifest.status === "fulfilled" ? runtimeEffectProjectileGapManifest.value.summary || null : null;
    runtimeEffectProjectileCreateBridgeSummary =
      runtimeEffectProjectileCreateBridgeManifest.status === "fulfilled"
        ? runtimeEffectProjectileCreateBridgeManifest.value.summary || null
        : null;
    runtimeEffectProjectileTargetDispatchSummary =
      runtimeEffectProjectileTargetDispatchManifest.status === "fulfilled"
        ? runtimeEffectProjectileTargetDispatchManifest.value.summary || null
        : null;
    runtimeEffectProjectileVtableSlotSummary =
      runtimeEffectProjectileVtableSlotManifest.status === "fulfilled"
        ? runtimeEffectProjectileVtableSlotManifest.value.summary || null
        : null;
    runtimeEffectProjectileVtableFunctionSummary =
      runtimeEffectProjectileVtableFunctionManifest.status === "fulfilled"
        ? runtimeEffectProjectileVtableFunctionManifest.value.summary || null
        : null;
    runtimeEffectProjectileVtableOutputLayoutSummary =
      runtimeEffectProjectileVtableOutputLayoutManifest.status === "fulfilled"
        ? runtimeEffectProjectileVtableOutputLayoutManifest.value.summary || null
        : null;
    runtimeEffectProjectileVtableCallsitePayloadSummary =
      runtimeEffectProjectileVtableCallsitePayloadManifest.status === "fulfilled"
        ? runtimeEffectProjectileVtableCallsitePayloadManifest.value.summary || null
        : null;
    runtimeEffectProjectileVtableSemanticJoinSummary =
      runtimeEffectProjectileVtableSemanticJoinManifest.status === "fulfilled"
        ? runtimeEffectProjectileVtableSemanticJoinManifest.value.summary || null
        : null;
    runtimeEffectProjectileConsumerTraceSummary =
      runtimeEffectProjectileConsumerTraceManifest.status === "fulfilled"
        ? runtimeEffectProjectileConsumerTraceManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentTokenWindowSummary =
      runtimeEffectProjectileCurrentTokenWindowManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentTokenWindowManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentBranchTargetSummary =
      runtimeEffectProjectileCurrentBranchTargetManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentBranchTargetManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentFieldWriterCallsiteSummary =
      runtimeEffectProjectileCurrentFieldWriterCallsiteManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentFieldWriterCallsiteManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentFieldReaderCandidateSummary =
      runtimeEffectProjectileCurrentFieldReaderCandidateManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentFieldReaderCandidateManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentFieldReaderCallsiteContextSummary =
      runtimeEffectProjectileCurrentFieldReaderCallsiteContextManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentFieldReaderCallsiteContextManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentFieldReaderDownstreamRouteSummary =
      runtimeEffectProjectileCurrentFieldReaderDownstreamRouteManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentFieldReaderDownstreamRouteManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentFieldReaderListDispatchSummary =
      runtimeEffectProjectileCurrentFieldReaderListDispatchManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentFieldReaderListDispatchManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentTokenChildObjectChainSummary =
      runtimeEffectProjectileCurrentTokenChildObjectChainManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentTokenChildObjectChainManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentTokenChildCallbackBodySummary =
      runtimeEffectProjectileCurrentTokenChildCallbackBodyManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentTokenChildCallbackBodyManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentTokenChildClassMethodSummary =
      runtimeEffectProjectileCurrentTokenChildClassMethodManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentTokenChildClassMethodManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentTokenChildEvaluatorPayloadSummary =
      runtimeEffectProjectileCurrentTokenChildEvaluatorPayloadManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentTokenChildEvaluatorPayloadManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentTokenChildPayloadSetterSummary =
      runtimeEffectProjectileCurrentTokenChildPayloadSetterManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentTokenChildPayloadSetterManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentTokenChildPayloadSetterDownstreamSummary =
      runtimeEffectProjectileCurrentTokenChildPayloadSetterDownstreamManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentTokenChildPayloadSetterDownstreamManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentTokenChildManagerRecordBridgeSummary =
      runtimeEffectProjectileCurrentTokenChildManagerRecordBridgeManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentTokenChildManagerRecordBridgeManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentTokenChildEffectOwnerCandidateSummary =
      runtimeEffectProjectileCurrentTokenChildEffectOwnerCandidateManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentTokenChildEffectOwnerCandidateManifest.value.summary || null
        : null;
    runtimeEffectProjectileCurrentTokenChildStaticPfxOwnerSummary =
      runtimeEffectProjectileCurrentTokenChildStaticPfxOwnerManifest.status === "fulfilled"
        ? runtimeEffectProjectileCurrentTokenChildStaticPfxOwnerManifest.value.summary || null
        : null;
    runtimeEffectProjectileRuntimeByModelLabel = buildRuntimeEffectProjectileRuntimeLookup(
      runtimeEffectProjectileRuntimeLoaded ? runtimeEffectProjectileRuntimeManifest.value.items || [] : [],
    );
    runtimeNativeProjectilesByHero = buildRuntimeNativeProjectileLookup(
      runtimeNativeProjectileManifest.status === "fulfilled" ? runtimeNativeProjectileManifest.value : [],
    );
    runtimeNativeProjectileCallbacksByHero = buildRuntimeNativeProjectileCallbackLookup(
      runtimeNativeProjectileCallbackManifest.status === "fulfilled" ? runtimeNativeProjectileCallbackManifest.value : [],
    );
    runtimeTimelineByHero = buildRuntimeTimelineLookup(runtimeTimelineManifest.status === "fulfilled" ? runtimeTimelineManifest.value : []);
    runtimeResourceCompletenessSummary =
      runtimeResourceCompletenessManifest.status === "fulfilled" ? runtimeResourceCompletenessManifest.value.summary || null : null;
    runtimeResourceCompletenessByLookup = buildRuntimeResourceCompletenessLookup(
      runtimeResourceCompletenessManifest.status === "fulfilled" ? runtimeResourceCompletenessManifest.value.items || [] : [],
    );
    glbMaterialCoverageSummary = glbMaterialCoverageManifest.status === "fulfilled" ? glbMaterialCoverageManifest.value.summary || null : null;
    glbMaterialCoverageByLookup = buildGlbMaterialCoverageLookup(
      glbMaterialCoverageManifest.status === "fulfilled" ? glbMaterialCoverageManifest.value.items || [] : [],
    );
    materialRuntimePipelineSummary =
      materialRuntimePipelineManifest.status === "fulfilled" ? materialRuntimePipelineManifest.value.summary || null : null;
    materialRuntimePipelineByLookup = buildGlbMaterialCoverageLookup(
      materialRuntimePipelineManifest.status === "fulfilled" ? materialRuntimePipelineManifest.value.items || [] : [],
    );
    materialRenderStateAuditSummary =
      materialRenderStateAuditManifest.status === "fulfilled" ? materialRenderStateAuditManifest.value.summary || null : null;
    runtimeStateConditionSummary =
      runtimeStateConditionManifest.status === "fulfilled" ? runtimeStateConditionManifest.value.summary || null : null;
    runtimeStateConditionsByKey = buildRuntimeStateConditionLookup(
      runtimeStateConditionManifest.status === "fulfilled" ? runtimeStateConditionManifest.value.items || [] : [],
    );
    runtimeAttachmentNativeChainSummary =
      runtimeAttachmentNativeChainManifest.status === "fulfilled" ? runtimeAttachmentNativeChainManifest.value.summary || null : null;
    runtimeAttachmentNativeChainsByKey = buildRuntimeAttachmentNativeChainLookup(
      runtimeAttachmentNativeChainManifest.status === "fulfilled" ? runtimeAttachmentNativeChainManifest.value.items || [] : [],
    );
    nativeEffectBuilderMethodSemanticsSummary =
      nativeEffectBuilderMethodSemanticsManifest.status === "fulfilled"
        ? nativeEffectBuilderMethodSemanticsManifest.value.summary || null
        : null;
    nativeTransientEffectPrimitiveChainSummary =
      nativeTransientEffectPrimitiveChainManifest.status === "fulfilled"
        ? nativeTransientEffectPrimitiveChainManifest.value.summary || null
        : null;
    nativeTransientRenderRecordSchemaSummary =
      nativeTransientRenderRecordSchemaManifest.status === "fulfilled"
        ? nativeTransientRenderRecordSchemaManifest.value.summary || null
        : null;
    nativeTransientRenderRecordCallsiteScanSummary =
      nativeTransientRenderRecordCallsiteScanManifest.status === "fulfilled"
        ? nativeTransientRenderRecordCallsiteScanManifest.value.summary || null
        : null;
    nativeTransientRecordRuntimeExecutorSummary =
      nativeTransientRecordRuntimeExecutorManifest.status === "fulfilled"
        ? nativeTransientRecordRuntimeExecutorManifest.value.summary || null
        : null;
    currentNativeParticleDrawChainSummary =
      currentNativeParticleDrawChainManifest.status === "fulfilled"
        ? currentNativeParticleDrawChainManifest.value.summary || null
        : null;
    currentNativeParticleRegistrationChainSummary =
      currentNativeParticleRegistrationChainManifest.status === "fulfilled"
        ? currentNativeParticleRegistrationChainManifest.value.summary || null
        : null;
    currentNativeLayoutAOwnerGlobalUsageSummary =
      currentNativeLayoutAOwnerGlobalUsageManifest.status === "fulfilled"
        ? currentNativeLayoutAOwnerGlobalUsageManifest.value.summary || null
        : null;
    currentNativeLayoutARefreshStateSourceSummary =
      currentNativeLayoutARefreshStateSourceManifest.status === "fulfilled"
        ? currentNativeLayoutARefreshStateSourceManifest.value.summary || null
        : null;
    currentNativeLayoutAStateWriterSummary =
      currentNativeLayoutAStateWriterManifest.status === "fulfilled"
        ? currentNativeLayoutAStateWriterManifest.value.summary || null
        : null;
    currentNativeLayoutAStateRegistrationSummary =
      currentNativeLayoutAStateRegistrationManifest.status === "fulfilled"
        ? currentNativeLayoutAStateRegistrationManifest.value.summary || null
        : null;
    currentNativeLayoutAAddRecordFlagSourceSummary =
      currentNativeLayoutAAddRecordFlagSourceManifest.status === "fulfilled"
        ? currentNativeLayoutAAddRecordFlagSourceManifest.value.summary || null
        : null;
    currentNativeParticleMaskCandidateOwnerSummary =
      currentNativeParticleMaskCandidateOwnerManifest.status === "fulfilled"
        ? currentNativeParticleMaskCandidateOwnerManifest.value.summary || null
        : null;
    currentNativeType210PrimitiveBuilderSummary =
      currentNativeType210PrimitiveBuilderManifest.status === "fulfilled"
        ? currentNativeType210PrimitiveBuilderManifest.value.summary || null
        : null;
    currentNativeType210LevelVisualsBridgeSummary =
      currentNativeType210LevelVisualsBridgeManifest.status === "fulfilled"
        ? currentNativeType210LevelVisualsBridgeManifest.value.summary || null
        : null;
    currentNativeLayoutBTypeOwnerSummary =
      currentNativeLayoutBTypeOwnerManifest.status === "fulfilled"
        ? currentNativeLayoutBTypeOwnerManifest.value.summary || null
        : null;
    currentNativeLayoutBEntryOwnerSummary =
      currentNativeLayoutBEntryOwnerManifest.status === "fulfilled"
        ? currentNativeLayoutBEntryOwnerManifest.value.summary || null
        : null;
    currentNativeObjectAcWidthOverlapSummary =
      currentNativeObjectAcWidthOverlapManifest.status === "fulfilled"
        ? currentNativeObjectAcWidthOverlapManifest.value.summary || null
        : null;
    currentNativeObjectAcOwnerTraceSummary =
      currentNativeObjectAcOwnerTraceManifest.status === "fulfilled"
        ? currentNativeObjectAcOwnerTraceManifest.value.summary || null
        : null;
    currentNativeLayoutBCallbackBoundarySummary =
      currentNativeLayoutBCallbackBoundaryManifest.status === "fulfilled"
        ? currentNativeLayoutBCallbackBoundaryManifest.value.summary || null
        : null;
    currentNativeLayoutBIndirectSlotSummary =
      currentNativeLayoutBIndirectSlotManifest.status === "fulfilled"
        ? currentNativeLayoutBIndirectSlotManifest.value.summary || null
        : null;
    currentNativeLayoutBSlotRecordBridgeSummary =
      currentNativeLayoutBSlotRecordBridgeManifest.status === "fulfilled"
        ? currentNativeLayoutBSlotRecordBridgeManifest.value.summary || null
        : null;
    currentNativeLayoutBActiveRecordLifecycleSummary =
      currentNativeLayoutBActiveRecordLifecycleManifest.status === "fulfilled"
        ? currentNativeLayoutBActiveRecordLifecycleManifest.value.summary || null
        : null;
    currentNativeLayoutBTargetPayloadSummary =
      currentNativeLayoutBTargetPayloadManifest.status === "fulfilled"
        ? currentNativeLayoutBTargetPayloadManifest.value.summary || null
        : null;
    currentNativeLayoutBPfxTargetFactorySummary =
      currentNativeLayoutBPfxTargetFactoryManifest.status === "fulfilled"
        ? currentNativeLayoutBPfxTargetFactoryManifest.value.summary || null
        : null;
    currentNativeLayoutBTargetCacheSummary =
      currentNativeLayoutBTargetCacheManifest.status === "fulfilled"
        ? currentNativeLayoutBTargetCacheManifest.value.summary || null
        : null;
    currentNativeLayoutBTargetPayloadNodeChainSummary =
      currentNativeLayoutBTargetPayloadNodeChainManifest.status === "fulfilled"
        ? currentNativeLayoutBTargetPayloadNodeChainManifest.value.summary || null
        : null;
    currentNativeLayoutBPayloadSourceProgramBridgeSummary =
      currentNativeLayoutBPayloadSourceProgramBridgeManifest.status === "fulfilled"
        ? currentNativeLayoutBPayloadSourceProgramBridgeManifest.value.summary || null
        : null;
    currentNativeLayoutBManagerDrawBridgeSummary =
      currentNativeLayoutBManagerDrawBridgeManifest.status === "fulfilled"
        ? currentNativeLayoutBManagerDrawBridgeManifest.value.summary || null
        : null;
    currentNativeLayoutBParticleEntryDispatchSummary =
      currentNativeLayoutBParticleEntryDispatchManifest.status === "fulfilled"
        ? currentNativeLayoutBParticleEntryDispatchManifest.value.summary || null
        : null;
    currentNativeLayoutBEntryProviderPayloadBridgeSummary =
      currentNativeLayoutBEntryProviderPayloadBridgeManifest.status === "fulfilled"
        ? currentNativeLayoutBEntryProviderPayloadBridgeManifest.value.summary || null
        : null;
    currentNativeLayoutBOwnerBVtableDispatchSummary =
      currentNativeLayoutBOwnerBVtableDispatchManifest.status === "fulfilled"
        ? currentNativeLayoutBOwnerBVtableDispatchManifest.value.summary || null
        : null;
    currentNativeLayoutBPrimitiveModeDispatchSummary =
      currentNativeLayoutBPrimitiveModeDispatchManifest.status === "fulfilled"
        ? currentNativeLayoutBPrimitiveModeDispatchManifest.value.summary || null
        : null;
    currentNativeLayoutBMaterialDrawBridgeSummary =
      currentNativeLayoutBMaterialDrawBridgeManifest.status === "fulfilled"
        ? currentNativeLayoutBMaterialDrawBridgeManifest.value.summary || null
        : null;
    currentNativeLayoutBFinalPrimitiveConsumerSummary =
      currentNativeLayoutBFinalPrimitiveConsumerManifest.status === "fulfilled"
        ? currentNativeLayoutBFinalPrimitiveConsumerManifest.value.summary || null
        : null;
    currentNativeLayoutBShaderParameterBridgeSummary =
      currentNativeLayoutBShaderParameterBridgeManifest.status === "fulfilled"
        ? currentNativeLayoutBShaderParameterBridgeManifest.value.summary || null
        : null;
    currentNativeShaderDataType4ValueSourceSummary =
      currentNativeShaderDataType4ValueSourceManifest.status === "fulfilled"
        ? currentNativeShaderDataType4ValueSourceManifest.value.summary || null
        : null;
    currentNativeShaderDataType4EntrySemanticsSummary =
      currentNativeShaderDataType4EntrySemanticsManifest.status === "fulfilled"
        ? currentNativeShaderDataType4EntrySemanticsManifest.value.summary || null
        : null;
    currentNativeTexDataTextureObjectSummary =
      currentNativeTexDataTextureObjectManifest.status === "fulfilled"
        ? currentNativeTexDataTextureObjectManifest.value.summary || null
        : null;
    currentNativeShaderDataTextureSamplerTableSummary =
      currentNativeShaderDataTextureSamplerTableManifest.status === "fulfilled"
        ? currentNativeShaderDataTextureSamplerTableManifest.value.summary || null
        : null;
    currentNativeShaderDataExternalTextureBindingSummary =
      currentNativeShaderDataExternalTextureBindingManifest.status === "fulfilled"
        ? currentNativeShaderDataExternalTextureBindingManifest.value.summary || null
        : null;
    currentNativeTextureSamplerStateSemanticsSummary =
      currentNativeTextureSamplerStateSemanticsManifest.status === "fulfilled"
        ? currentNativeTextureSamplerStateSemanticsManifest.value.summary || null
        : null;
    currentNativeShaderDataInlineTexturePlaceholderSummary =
      currentNativeShaderDataInlineTexturePlaceholderManifest.status === "fulfilled"
        ? currentNativeShaderDataInlineTexturePlaceholderManifest.value.summary || null
        : null;
    currentNativeShadergraphSamplerTexDataJoinSummary =
      currentNativeShadergraphSamplerTexDataJoinManifest.status === "fulfilled"
        ? currentNativeShadergraphSamplerTexDataJoinManifest.value.summary || null
        : null;
    currentNativeMaterialSourceProgramCaptureTargetSummary =
      currentNativeMaterialSourceProgramCaptureTargetManifest.status === "fulfilled"
        ? currentNativeMaterialSourceProgramCaptureTargetManifest.value.summary || null
        : null;
    currentNativeMaterialSourceProgramCaptureSummary =
      currentNativeMaterialSourceProgramCaptureManifest.status === "fulfilled"
        ? currentNativeMaterialSourceProgramCaptureManifest.value.summary || null
        : null;
    currentNativeDefinitionShaderParamStaticStringSummary =
      currentNativeDefinitionShaderParamStaticStringManifest.status === "fulfilled"
        ? currentNativeDefinitionShaderParamStaticStringManifest.value.summary || null
        : null;
    currentNativeDefinitionShaderParamsPayloadStructureSummary =
      currentNativeDefinitionShaderParamsPayloadStructureManifest.status === "fulfilled"
        ? currentNativeDefinitionShaderParamsPayloadStructureManifest.value.summary || null
        : null;
    currentNativeMaterialSamplerOwnershipGateSummary =
      currentNativeMaterialSamplerOwnershipGateManifest.status === "fulfilled"
        ? currentNativeMaterialSamplerOwnershipGateManifest.value.summary || null
        : null;
    currentNativeRuntimeCaptureGateSummary =
      currentNativeRuntimeCaptureGateManifest.status === "fulfilled"
        ? currentNativeRuntimeCaptureGateManifest.value.summary || null
        : null;
    currentNativeRuntimeCaptureGateItems =
      currentNativeRuntimeCaptureGateManifest.status === "fulfilled"
        ? currentNativeRuntimeCaptureGateManifest.value.items || []
        : [];
    currentNativeDynamicSourceTableSemanticsSummary =
      currentNativeDynamicSourceTableSemanticsManifest.status === "fulfilled"
        ? currentNativeDynamicSourceTableSemanticsManifest.value.summary || null
        : null;
    currentNativeStaticMeshSelectorEntrySummary =
      currentNativeStaticMeshSelectorEntryManifest.status === "fulfilled"
        ? currentNativeStaticMeshSelectorEntryManifest.value.summary || null
        : null;
    currentNativeShaderParamsSchemaSummary =
      currentNativeShaderParamsSchemaManifest.status === "fulfilled"
        ? currentNativeShaderParamsSchemaManifest.value.summary || null
        : null;
    currentNativeStaticMeshShaderParamsCaptureTargetSummary =
      currentNativeStaticMeshShaderParamsCaptureTargetManifest.status === "fulfilled"
        ? currentNativeStaticMeshShaderParamsCaptureTargetManifest.value.summary || null
        : null;
    currentNativeStaticMeshShaderParamsCaptureSummary =
      currentNativeStaticMeshShaderParamsCaptureManifest.status === "fulfilled"
        ? currentNativeStaticMeshShaderParamsCaptureManifest.value.summary || null
        : null;
    currentNativeShaderParamsValueSemanticsSummary =
      currentNativeShaderParamsValueSemanticsManifest.status === "fulfilled"
        ? currentNativeShaderParamsValueSemanticsManifest.value.summary || null
        : null;
    currentNativeLayoutBObjectAcStoreCoverageSummary =
      currentNativeLayoutBObjectAcStoreCoverageManifest.status === "fulfilled"
        ? currentNativeLayoutBObjectAcStoreCoverageManifest.value.summary || null
        : null;
    currentNativeLayoutBObjectAcRuntimeCaptureTargetSummary =
      currentNativeLayoutBObjectAcRuntimeCaptureTargetManifest.status === "fulfilled"
        ? currentNativeLayoutBObjectAcRuntimeCaptureTargetManifest.value.summary || null
        : null;
    currentNativeLayoutBObjectAcRuntimeCaptureSummary =
      currentNativeLayoutBObjectAcRuntimeCaptureManifest.status === "fulfilled"
        ? currentNativeLayoutBObjectAcRuntimeCaptureManifest.value.summary || null
        : null;
    currentNativeLayoutBObjectAcCandidateDisqualificationSummary =
      currentNativeLayoutBObjectAcCandidateDisqualificationManifest.status === "fulfilled"
        ? currentNativeLayoutBObjectAcCandidateDisqualificationManifest.value.summary || null
        : null;
    currentNativeLayoutBPayloadRecordLayoutSummary =
      currentNativeLayoutBPayloadRecordLayoutManifest.status === "fulfilled"
        ? currentNativeLayoutBPayloadRecordLayoutManifest.value.summary || null
        : null;
    currentNativeLayoutBFlagProducerSummary =
      currentNativeLayoutBFlagProducerManifest.status === "fulfilled"
        ? currentNativeLayoutBFlagProducerManifest.value.summary || null
        : null;
    currentNativeLayoutBVisibilityGateSummary =
      currentNativeLayoutBVisibilityGateManifest.status === "fulfilled"
        ? currentNativeLayoutBVisibilityGateManifest.value.summary || null
        : null;
    currentNativeLayoutBTargetStatusSummary =
      currentNativeLayoutBTargetStatusManifest.status === "fulfilled"
        ? currentNativeLayoutBTargetStatusManifest.value.summary || null
        : null;
    currentNativeLayoutBRefreshModeSplitSummary =
      currentNativeLayoutBRefreshModeSplitManifest.status === "fulfilled"
        ? currentNativeLayoutBRefreshModeSplitManifest.value.summary || null
        : null;
    currentNativeLayoutBQueryApplyPathSummary =
      currentNativeLayoutBQueryApplyPathManifest.status === "fulfilled"
        ? currentNativeLayoutBQueryApplyPathManifest.value.summary || null
        : null;
    currentNativeLayoutBSharedStructApplySummary =
      currentNativeLayoutBSharedStructApplyManifest.status === "fulfilled"
        ? currentNativeLayoutBSharedStructApplyManifest.value.summary || null
        : null;
    currentNativeLayoutBCallerStructInitializerSummary =
      currentNativeLayoutBCallerStructInitializerManifest.status === "fulfilled"
        ? currentNativeLayoutBCallerStructInitializerManifest.value.summary || null
        : null;
    currentNativeLayoutBComponentTableEntrySummary =
      currentNativeLayoutBComponentTableEntryManifest.status === "fulfilled"
        ? currentNativeLayoutBComponentTableEntryManifest.value.summary || null
        : null;
    currentNativeLayoutBComponentTableOwnerSummary =
      currentNativeLayoutBComponentTableOwnerManifest.status === "fulfilled"
        ? currentNativeLayoutBComponentTableOwnerManifest.value.summary || null
        : null;
    currentNativeLayoutBComponentSlotRegistrationSummary =
      currentNativeLayoutBComponentSlotRegistrationManifest.status === "fulfilled"
        ? currentNativeLayoutBComponentSlotRegistrationManifest.value.summary || null
        : null;
    currentNativeLayoutBDirectCallerStructBuilderSummary =
      currentNativeLayoutBDirectCallerStructBuilderManifest.status === "fulfilled"
        ? currentNativeLayoutBDirectCallerStructBuilderManifest.value.summary || null
        : null;
    currentNativeLayoutBResourceCallerDynamicFieldsSummary =
      currentNativeLayoutBResourceCallerDynamicFieldsManifest.status === "fulfilled"
        ? currentNativeLayoutBResourceCallerDynamicFieldsManifest.value.summary || null
        : null;
    currentNativeLayoutBCommonApplySetterFieldsSummary =
      currentNativeLayoutBCommonApplySetterFieldsManifest.status === "fulfilled"
        ? currentNativeLayoutBCommonApplySetterFieldsManifest.value.summary || null
        : null;
    currentNativeLayoutBObjectAcProducerGateSummary =
      currentNativeLayoutBObjectAcProducerGateManifest.status === "fulfilled"
        ? currentNativeLayoutBObjectAcProducerGateManifest.value.summary || null
        : null;
    currentNativePositionSamplerOwnerSummary =
      currentNativePositionSamplerOwnerManifest.status === "fulfilled"
        ? currentNativePositionSamplerOwnerManifest.value.summary || null
        : null;
    currentNativeLevelRuntimeOwnerSummary =
      currentNativeLevelRuntimeOwnerManifest.status === "fulfilled"
        ? currentNativeLevelRuntimeOwnerManifest.value.summary || null
        : null;
    currentNativeRuntimeKeySelectorCaptureTargetSummary =
      currentNativeRuntimeKeySelectorCaptureTargetManifest.status === "fulfilled"
        ? currentNativeRuntimeKeySelectorCaptureTargetManifest.value.summary || null
        : null;
    runtimeKeySelectorCaptureSummary =
      runtimeKeySelectorCaptureManifest.status === "fulfilled" ? runtimeKeySelectorCaptureManifest.value || null : null;
    currentNativeLightProbeChainSummary =
      currentNativeLightProbeChainManifest.status === "fulfilled"
        ? currentNativeLightProbeChainManifest.value.summary || null
        : null;
    characterLitProbeBlockerSummary =
      characterLitProbeBlockerManifest.status === "fulfilled"
        ? characterLitProbeBlockerManifest.value.summary || null
        : null;
    heroPreviewProfileCandidateSummary =
      heroPreviewProfileCandidateManifest.status === "fulfilled"
        ? heroPreviewProfileCandidateManifest.value.summary || null
        : null;
    nativeBinaryVersionAuditSummary =
      nativeBinaryVersionAuditManifest.status === "fulfilled" ? nativeBinaryVersionAuditManifest.value.summary || null : null;
    heroCatalog = new Map(Object.entries(heroCatalogManifest.status === "fulfilled" ? heroCatalogManifest.value.heroes || {} : {}));
  skinCatalog = new Map(Object.entries(skinCatalogManifest.status === "fulfilled" ? skinCatalogManifest.value.skins || {} : {}));
  itemSearchIndexes = new WeakMap();

  if (manifests.skinned.length) {
    formatSelect.value = "skinned";
  } else if (!manifests.pbr.length) {
    formatSelect.value = manifests.textured.length ? "textured" : manifests.glb.length ? "glb" : "obj";
  }
  searchInput.value = "";
  characterSelect.value = "";
  resetViewerControlsForModel();
  syncCharacters();
  renderList();
  loadDefaultModel();
}

function openActionDialog(dialog) {
  if (!dialog) return;
  if (dialog === recordDialog && !videoRecording) resetRecordProgress();
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  refreshSelectMenus();
}

function closeActionDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  else dialog.removeAttribute("open");
}

for (const dialog of [exportDialog, recordDialog]) {
  dialog?.addEventListener("click", (event) => {
    if (dialog === recordDialog && videoRecording) return;
    if (event.target === dialog) closeActionDialog(dialog);
  });
}

document.querySelectorAll("[data-dialog-close]").forEach((button) => {
  button.addEventListener("click", () => {
    const dialog = button.closest("dialog");
    if (dialog === recordDialog && videoRecording) return;
    closeActionDialog(dialog);
  });
});

selectMenus = [
  formatSelect,
  lightingSelect,
  animationSelect,
  modelFormSelect,
  playbackSpeedSelect,
  attachmentSelect,
  recordCameraSelect,
  recordFormatSelect,
  recordQualitySelect,
].map((select) => createSelectMenu(select));
heroCombobox = createCombobox({
  input: searchInput,
  popup: heroSearchOptions,
  triggerButton: heroDropdownButton,
  clearButton: clearSearchButton,
  onQueryChange: syncSearchSelection,
  onSelect: selectHeroSearchItem,
  onClear: () => {
    characterSelect.value = "";
    renderList();
    return filteredHeroSearchItems("");
  },
  itemLabel: (item) => item.label,
  itemMeta: heroSearchMeta,
});
characterSelect.addEventListener("change", () => {
  searchInput.value = characterSelect.value ? displayCharacter(characterSelect.value) : "";
  renderList();
  heroCombobox?.setItems(filteredHeroSearchItems(searchInput.value));
});
for (const button of previewModeButtons) {
  button.addEventListener("click", () => {
    setPreviewMode(button.dataset.previewMode);
  });
}
formatSelect.addEventListener("change", () => {
  resetViewerControlsForModel();
  syncCharacters();
  renderList();
  loadDefaultModel();
});

lightingSelect.addEventListener("change", applyLightingPreset);
backgroundPanelToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  setBackgroundPanelOpen(backgroundPanel.hidden);
});
backgroundPanel.addEventListener("click", (event) => {
  event.stopPropagation();
});
document.addEventListener("click", (event) => {
  if (backgroundPanel.hidden || event.target.closest("#backgroundControl")) return;
  setBackgroundPanelOpen(false);
});
backgroundColorButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeBackgroundColor = button.dataset.backgroundColor;
    syncBackgroundControlButtons();
    applyPreviewBackground();
  });
});
animationSelect.addEventListener("change", () => {
  const modelFormRuntime = activeModelFormRuntime();
  if (modelFormRuntime?.profile.supportsFollowAnimation) {
    modelFormRuntime.mode = MODEL_FORM_MODE.FOLLOW;
    modelFormSelect.value = MODEL_FORM_MODE.FOLLOW;
    syncModelFormGeometry();
    refreshSelectMenus();
  }
  manualAnimationTime = 0;
  poseClock.start();
  syncAnimationStats();
  syncRuntimeEffectPreviews();
  syncPreviewEffectVisibility();
  syncBaseStats();
  syncTimelineControls(manualAnimationTime);
});
modelFormSelect.addEventListener("change", () => {
  selectModelFormMode(modelFormSelect.value);
});
attachmentSelect.addEventListener("change", () => {
  loadSelectedAttachments().catch((error) => {
    modelStats.textContent = `附属资源加载失败：${error.message}`;
  });
});
poseLoopToggle.addEventListener("change", () => {
  activePoseBlend = 0;
  syncAnimationStats();
});
animationTimeRange.addEventListener("input", () => {
  poseLoopToggle.checked = false;
  applyAnimationAtTime(Number(animationTimeRange.value) || 0);
});
playPauseButton.addEventListener("click", () => {
  poseLoopToggle.checked = !poseLoopToggle.checked;
  if (poseLoopToggle.checked) poseClock.start();
  syncAnimationStats();
});
playbackSpeedSelect.addEventListener("change", () => {
  if (poseLoopToggle.checked) poseClock.start();
});

wireToggle.addEventListener("change", () => {
  if (!activeObject) return;
  activeObject.traverse((child) => {
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.wireframe = wireToggle.checked;
  });
});

bonesToggle.addEventListener("change", () => {
  syncSkeletonOverlay().catch((error) => {
    activeSkeletonStatsText = `skeleton failed: ${error.message}`;
    renderStats();
  });
});

effectsToggle.addEventListener("change", () => {
  syncPreviewEffectVisibility();
  syncBaseStats();
  syncModelHealth();
});

frameButton.addEventListener("click", () => {
  if (activeObject) frameObject(activeObject, { resetCamera: true });
});

diagnoseMaterialsButton?.addEventListener("click", syncModelHealth);
openExportDialogButton.addEventListener("click", () => openActionDialog(exportDialog));
openRecordDialogButton.addEventListener("click", () => openActionDialog(recordDialog));
exportPoseGlbButton.addEventListener("click", () => {
  closeActionDialog(exportDialog);
  exportFrozenPoseGlb();
});
exportPoseObjButton.addEventListener("click", () => {
  closeActionDialog(exportDialog);
  exportFrozenPoseObj();
});
exportPoseStlButton.addEventListener("click", () => {
  closeActionDialog(exportDialog);
  exportFrozenPoseStl();
});
exportPoseThreeMfButton.addEventListener("click", () => {
  closeActionDialog(exportDialog);
  exportFrozenPoseThreeMf();
});
recordVideoButton.addEventListener("click", () => {
  recordTurntableVideo().catch((error) => {
    modelStats.textContent = `录制失败：${error.message}`;
    videoRecording = false;
    syncRecordDialogState();
    setRecordProgress(0, "录制失败");
    syncTimelineControls();
  });
});

window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(viewport);

function animate() {
  controls.update();
  const runtimeEffectDelta = runtimeEffectClock.getDelta();
  runtimeEffectElapsed += runtimeEffectDelta;
  updateRuntimeEffectPreviews(runtimeEffectDelta, runtimeEffectElapsed);
  updateCharacterMaterialRuntime(runtimeEffectDelta);
  if (isAnimationFormat() && poseLoopToggle.checked && activeObject) {
    applyAnimationAtTime(manualAnimationTime + poseClock.getDelta() * playbackSpeed(), { wrap: true });
  }
  renderSceneOnce();
requestAnimationFrame(animate);
}

syncBackgroundControlButtons();
applyPreviewBackground();
applyLightingPreset();
syncTimelineControls();
syncModelHealth();
syncEffectDiagnostics();
resize();
animate();
init().catch((error) => {
  modelStats.textContent = `查看器初始化失败：${error.message}`;
});
