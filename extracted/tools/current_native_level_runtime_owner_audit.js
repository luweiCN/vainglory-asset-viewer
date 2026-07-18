#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64, scanTextReferences } = require("./current_native_anchor_audit");
const { findDirectBranchCallers, findU64References } = require("./current_native_light_probe_chain_audit");
const { engineHashHex, engineHashString } = require("./engine_hash");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-level-runtime-owner-audit.json";
const defaultJsonOut = "extracted/reports/current_native_level_runtime_owner_audit.json";
const defaultTsvOut = "extracted/reports/current_native_level_runtime_owner_audit.tsv";
const defaultBuildResourceIndexPath = "extracted/reports/build_resource_index.json";
const defaultLocalVgrSearchRoots = ["extracted/android_raw", "extracted/android_apktool", "extracted/ios_raw"];
const defaultIosRawDataRoot = "extracted/ios_raw/Payload/GameKindred.app/Data";
const typedObjectPayloadTypeIds = new Map([
  [0x03e9, { name: "inline-runtime-key-writer", minimumBytes: 0x67 }],
  [0x03f3, { name: "object-builder-b", minimumBytes: 0x2ec }],
  [0x046f, { name: "runtime-key-selection", minimumBytes: 0x47 }],
]);
const typedObjectRawPrefixScanBytes = 256;
const typedObjectRawCff0PrefixScanBytes = 4096;
const typedObjectRawDeepScanBytes = 64 * 1024;
const typedObjectRawFrameBufferCapacity = 0x2800;

const addresses = {
  levelRuntimeVtableBase: 0x26c8a40,
  levelRuntimeVtablePrimary: 0x26c8a50,
  levelRuntimeSecondaryVtable: 0x26c8aa8,
  levelRuntimeConstructor: 0x8cbe40,
  levelRuntimeDestructor: 0x8cbe98,
  levelRuntimeModuleRegistration: 0x8cbedc,
  levelRuntimeObjectInitializer: 0x8ccfcc,
  levelRuntimeVirtualInvokeCallback: 0x8ccfe8,
  levelRuntimeOwnerDispatch: 0x8cbdd4,
  levelRuntimeOwnerDispatchCallsite: 0xc79b28,
  levelRuntimeOwnerDispatchCallerFunction: 0xc79ad4,
  levelRuntimeVisualsLoader: 0x8cbf40,
  levelRuntimeVisualsLoaderTailThunk: 0x8cc63c,
  levelVisualsApplyProcessor: 0x8cc27c,
  levelVisualsApplySelectorListA: 0x8cc2b4,
  levelVisualsApplySelectorListACall: 0x8cc2cc,
  levelVisualsApplyTransformListA: 0x8cc2d8,
  levelVisualsApplyTransformListACall: 0x8cc2ec,
  levelVisualsApplyRuntimeListPredicateCall: 0x8cc2f8,
  levelVisualsApplyConditionalSelectorListA: 0x8cc300,
  levelVisualsApplyConditionalSelectorListACall: 0x8cc318,
  levelVisualsApplyConditionalTransformListA: 0x8cc324,
  levelVisualsApplyConditionalTransformListACall: 0x8cc338,
  levelVisualsApplyFallbackSelectorList: 0x8cc348,
  levelVisualsApplyFallbackSelectorListCall: 0x8cc360,
  levelVisualsApplyFallbackTransformList: 0x8cc36c,
  levelVisualsApplyFallbackTransformListCall: 0x8cc380,
  levelVisualsApplyAuxList38: 0x8cc38c,
  levelVisualsApplyAuxList38IndexLoad: 0x8cc3a0,
  levelVisualsApplyAuxList38Call: 0x8cc3b4,
  levelVisualsApplyAuxList40: 0x8cc3c0,
  levelVisualsApplyAuxList40IndexLoad: 0x8cc3d4,
  levelVisualsApplyAuxList40Call: 0x8cc3e8,
  levelVisualsApplyStaticLensFlareList: 0x8cc3f4,
  levelVisualsApplyStaticLensFlareObjectIndexLoad: 0x8cc414,
  levelVisualsApplyStaticLensFlareResourceAccessorCall: 0x8cc424,
  levelVisualsApplyStaticLensFlareResourceResolveCall: 0x8cc42c,
  levelVisualsApplyStaticLensFlarePrimaryCall: 0x8cc484,
  levelVisualsApplyStaticLensFlareSecondaryCall: 0x8cc4e4,
  levelVisualsApplyProfilePayloadLoad: 0x8cc4f8,
  levelVisualsApplyProfilePayloadValidateCall: 0x8cc4fc,
  levelVisualsApplyProfileTempCallA: 0x8cc514,
  levelVisualsApplyProfileTempCallB: 0x8cc534,
  levelVisualsApplyProfileTempCallC: 0x8cc550,
  levelVisualsApplyProfilePayloadDispatchCall: 0x8cc568,
  levelVisualsApplySourceTableSelectorHelper: 0x8cca64,
  levelVisualsApplyTransformShapeHelper: 0x8ccd14,
  levelVisualsApplyAuxList38Helper: 0x8dbac8,
  levelVisualsApplyAuxList40Helper: 0x8dc410,
  levelVisualsApplyStaticLensFlarePrimaryHelper: 0x8cb108,
  levelVisualsApplyStaticLensFlareSecondaryHelper: 0x8cb180,
  levelVisualsApplyRuntimePredicate: 0x830e00,
  levelSetupModuleRegistrationHubCallsite: 0xc716c0,
  levelSetupModuleRegistration: 0xc799f4,
  levelSetupVtableBase: 0x2724120,
  levelSetupVtablePrimary: 0x2724130,
  levelSetupModuleObjectInitializer: 0xc7a630,
  levelSetupModuleVirtualInvokeCallback: 0xc7a6ac,
  levelSetupRegisteredCallback: 0xc79ad4,
  levelSetupCallbackGenericRegistrationCallsite: 0xc79ac4,
  levelSetupRuntimeIndexGlobalSlot: 0x2d44e98,
  levelSetupRegistryRecordGlobalSlot: 0x2ae61c8,
  levelSetupDescriptorPointerSlot: 0x2af0cf8,
  levelTypeDescriptor: 0x3047e90,
  levelTypeDescriptorInitializer: 0x7cd9e0,
  levelTypeDescriptorInitCallsite: 0x7cda20,
  levelTypeDescriptorNameString: 0x1af545e,
  levelTypeFieldTableStart: 0x30506e0,
  levelTypeFieldTableEnd: 0x3050858,
  levelSetupSecondaryResourceGlobalSlot: 0x2ae7ed8,
  levelSetupPrimaryListHandlerIndexGlobalSlot: 0x30561e4,
  levelSetupConditionalListHandlerIndexGlobalSlot: 0x30afa60,
  levelSetupPrimaryListHandler: 0xc7e7b4,
  levelSetupConditionalListHandler: 0xc67444,
  levelVisualsSecondaryCallbackDescriptorGlobalSlot: 0x2ae29a8,
  genericCallbackRegistryGlobalSlot: 0x311a968,
  genericCallbackDispatchHelper: 0x188e338,
  genericCallbackDispatchHelperCallsiteManifestA: 0x81c9a8,
  genericCallbackDispatchHelperCallsiteManifestB: 0x81ca94,
  genericCallbackDispatchHelperCallsiteManifestC: 0x826554,
  genericCallbackDispatchHelperCallsiteRuntimeA: 0x8bef6c,
  genericCallbackDispatchHelperCallsiteRuntimeB: 0x8befac,
  genericCallbackDispatchHelperCallsiteObjectBuilderA: 0xc0374c,
  genericCallbackDispatchHelperCallsiteObjectBuilderB: 0xc04b98,
  descriptorPayloadResolverShim: 0x188cc88,
  descriptorPayloadResolver: 0x188f8f8,
  kindredManifestSymbolString: 0x1a9870d,
  definitionManifestPathString: 0x1a9871f,
  resourceKeyTableGlobalRootSlot: 0x30afbe8,
  resourceKeyTablePrimaryConstructor: 0xc72994,
  resourceKeyTableDestructor: 0xc729bc,
  resourceKeyTableSecondaryConstructor: 0xc72ed0,
  resourceKeyTableGlobalAccessor: 0xc72dbc,
  resourceKeyByIdLookup: 0xc72da8,
  resourceKeyByIdPayloadLookup: 0xc72df4,
  resourceKeyByIdTypedLookup: 0xc72e2c,
  resourceKeyByStringLookup: 0xc72dc8,
  resourceKeyToStringLookup: 0xc72cec,
  typedObjectDispatcher: 0x82dc04,
  typedObjectDispatcherFrameStreamFunction: 0x8130b0,
  typedObjectFrameSourceConstructor: 0x812fd0,
  typedObjectFrameSourceVtableAddressPoint: 0x26bf328,
  typedObjectFrameSourceClearPending: 0x813000,
  typedObjectFrameSourceResetLikeFunction: 0x813090,
  typedObjectDispatcherFrameStreamBufferedCountLoad: 0x8130ec,
  typedObjectDispatcherFrameStreamByteReadCallsite: 0x813108,
  typedObjectDispatcherFrameStreamFrameLengthLoad: 0x813184,
  typedObjectDispatcherFrameStreamBufferCompactCallsite: 0x81321c,
  typedObjectDispatcherFrameCallerCallsite: 0x8131fc,
  typedObjectDispatcherTimedQueueFunction: 0x8444e4,
  typedObjectTimedSourceConstructorA: 0x8440dc,
  typedObjectTimedSourceConstructorB: 0x844110,
  typedObjectTimedSourceDestructor: 0x844144,
  typedObjectTimedSourceChildFrameOwnerInitializer: 0x844184,
  typedObjectTimedSourceVtableAddressPoint: 0x26c0ad0,
  typedObjectDispatcherTimedQueueVtableSlotUpdate: 0x26c0ba8,
  typedObjectDispatcherTimedQueuePayloadPointer: 0x84453c,
  typedObjectDispatcherTimedQueueReadCallsite: 0x84455c,
  typedObjectDispatcherTimedQueueLengthLoad: 0x844580,
  typedObjectDispatcherTimedQueueCallerCallsite: 0x844588,
  typedObjectAlternateReplaySourceConstructor: 0x844420,
  typedObjectAlternateReplaySourceVtableAddressPoint: 0x26c0b68,
  typedObjectReplaySourceSelector: 0x844624,
  typedObjectReplaySourceSelectorRuntimeSwitchCaller: 0x81b0c0,
  typedObjectReplaySourceSelectorRuntimeSwitchCallsite: 0x81b13c,
  typedObjectReplaySourceSelectorRuntimeSwitchModeOneValue: 0x81b120,
  typedObjectReplaySourceSelectorRuntimeSwitchModeZeroValue: 0x81b138,
  typedObjectReplaySourceSelectorStartupInitCaller: 0x81bd0c,
  typedObjectReplaySourceSelectorStartupInitCallsite: 0x81bd58,
  typedObjectReplaySourceSelectorStartupAllocator: 0x8225dc,
  typedObjectReplaySourceSelectorStartupAllocatorCallsite: 0x822620,
  typedObjectReplaySourceSelectorModeZeroThunk: 0x81bf54,
  typedObjectReplaySourceSelectorModeZeroThunkCallsite: 0x81bf58,
  typedObjectReplaySourceGlobalSlot: 0x2b82450,
  typedObjectReplaySourceModeTimedAllocCallsite: 0x844650,
  typedObjectReplaySourceModeAlternateAllocCallsite: 0x84467c,
  typedObjectReplaySourceGlobalStore: 0x8446b0,
  typedObjectReplaySourceGlobalLoad: 0x8446bc,
  typedObjectReplaySourceSlot10Forwarder: 0x8446c4,
  typedObjectReplaySourceSlot20Forwarder: 0x844754,
  typedObjectReplaySourceSlot28Forwarder: 0x844768,
  typedObjectReplaySourceSlot30Forwarder: 0x84477c,
  typedObjectReplaySourceSlot38Forwarder: 0x844790,
  typedObjectReplaySourceSlot40Forwarder: 0x8447dc,
  typedObjectReplaySourceSlot68Forwarder: 0x8447f0,
  typedObjectReplaySourceSlot78Forwarder: 0x844810,
  typedObjectReplaySourceSlot80Forwarder: 0x84482c,
  typedObjectDispatcherJumpTable: 0x1a995b0,
  objectBuilderBDispatchCase: 0x82e4ac,
  objectBuilderBParserWrapper: 0x82adb8,
  objectBuilderBConstructor: 0xc0458c,
  objectBuilderBVtableObjectPointer: 0x2717420,
  objectBuilderBTypeId: 0x3f3,
  typedObjectVgrPathBuilder: 0x825f90,
  typedObjectVgrOpenFunction: 0x825a70,
  typedObjectVgrReadFunction: 0x825960,
  typedObjectVgrReplayInputSetup: 0x82648c,
  typedObjectVgrReplayReadListAppend: 0x826664,
  typedObjectVgrReplayTypedObjectDecode: 0x8266ec,
  typedObjectVgrPathFormatString: 0x1a99551,
  typedObjectReplayBaseNameString: 0x1a9950c,
  typedObjectReplayManifestNameString: 0x1a99514,
  typedObjectVgrFileModeString: 0x1ae9d62,
  typedObjectVgrTimestampFormatString: 0x1a99537,
  typedObjectVgrFileWriteModeString: 0x1a9954e,
  typedObjectFreadWrapper: 0xd6e15c,
  typedObjectRuntimeKeySelectionDispatchCase: 0x82fbcc,
  typedObjectRuntimeKeySelectionHelper: 0x82d870,
  typedObjectInlineKeyWriterDispatchCase: 0x82dc80,
  typedObjectInlineKeyWriterHelper: 0x82b68c,
  typedObjectInlineKeyWriterHelperCallsite: 0x82dcdc,
  runtimeResourceKeySelectionSetter: 0x8bf530,
  runtimeResourceKeyGlobalSetter: 0xbebf7c,
  runtimeResourceKeyGlobalResolver: 0xbebf9c,
  runtimeResourceKeyResolvedAccessor: 0xbebf54,
  runtimeResourceKeyPostAccessor: 0xbec044,
  runtimeResourceKeyGlobalStringSlot: 0x3051220,
  runtimeResourceKeyGlobalResolvedSlot: 0x3051218,
  runtimeResourceKeyStatusPredicate: 0xbec208,
  runtimeCurrentKeyOwnerGlobalSlot: 0x3034cf8,
  runtimeCurrentKeyOwnerGlobalMaybeSlot: 0x3034cf0,
  runtimeCurrentKeyOwnerAccessor: 0x8be0b0,
  runtimeCurrentKeyOwnerStatusAccessor: 0x8be09c,
  runtimeCurrentKeyOwnerConstructor: 0x8be378,
  runtimeCurrentKeyOwnerGlobalStoreCallsite: 0x8be62c,
  runtimeCurrentKeyOwnerDestructor: 0x8bed64,
  runtimeCurrentKeyOwnerGlobalClearCallsite: 0x8bed9c,
  runtimeCurrentKeyOwnerChildIndexGlobalSlot: 0x3034d10,
  runtimeCurrentKeyOwnerChildIndexRegistration: 0x919530,
  runtimeCurrentKeyOwnerChildIndexStoreCallsite: 0x9195a8,
  runtimeCurrentKeyOwnerChildSlot2Callback: 0x9195d0,
  runtimeCurrentKeyOwnerChildSlot4Callback: 0x9195d4,
  runtimeCurrentSecondaryObjectIndexGlobalSlot: 0x2d44e78,
  runtimeCurrentSecondaryObjectIndexRegistration: 0x9131dc,
  runtimeCurrentSecondaryObjectIndexStoreCallsite: 0x913258,
  runtimeCurrentSecondaryObjectKeyedCallbackFirst: 0x9135e0,
  runtimeCurrentSecondaryObjectSlot2Callback: 0x914c34,
  runtimeCurrentSecondaryObjectSlot4Callback: 0x914c98,
  runtimeCurrentOwnerChildAccessor: 0x8bf6c8,
  runtimeCurrentOwnerActiveStateBridge: 0x8d0598,
  runtimeCurrentOwnerPositionBridge: 0x8d07d0,
  runtimeCurrentOwnerStateRefreshBridge: 0x8d0fc4,
  runtimeCurrentOwnerStateCleanupBridge: 0x8d120c,
  runtimeCurrentOwnerStateBridgeThunkA: 0x8cfb70,
  runtimeCurrentOwnerStateBridgeThunkB: 0x8cfb74,
  runtimeCurrentOwnerRegistrationHubCallsite: 0x8badcc,
  runtimeCurrentOwnerRegistrationBuilder: 0x8cfb7c,
  runtimeCurrentOwnerRegistryIndexGlobalSlot: 0x3035264,
  runtimeCurrentOwnerRegistryIndexLazyInitializer: 0x79f37c,
  runtimeCurrentOwnerRegistryIndexLazyStoreCallsite: 0x79f3a0,
  runtimeCurrentOwnerRegistryIndexLazyGuardSlot: 0x3035268,
  runtimeCurrentOwnerRegistryIndexLazySourceSlot: 0x2addc30,
  runtimeCurrentOwnerPrimaryCallbackTable: 0x8d2100,
  runtimeCurrentOwnerSecondaryCallbackTable: 0x8d2124,
  runtimeCurrentOwnerSlot4Callback: 0x8cfbec,
  runtimeCurrentOwnerSlot4UpdateDispatcher: 0x8cfd5c,
  runtimeCurrentOwnerStatePositionProjector: 0x8cfe60,
  runtimeCurrentOwnerStateAttach: 0x8cff24,
  runtimeCurrentOwnerPostAttachTransformRefresh: 0x8d014c,
  runtimeCurrentOwnerHudMinimapConstructor: 0x94ad7c,
  runtimeCurrentOwnerHudMinimapDestructor: 0x94ae70,
  runtimeCurrentOwnerHudMinimapDeleteThunk: 0x94aed4,
  runtimeCurrentOwnerHudMinimapUpdate: 0x94aef8,
  runtimeCurrentOwnerHudMinimapLargeOwnerConstructorCallsiteA: 0x93a540,
  runtimeCurrentOwnerHudMinimapLargeOwnerConstructorCallsiteB: 0x974ac8,
  runtimeCurrentOwnerHudMinimapLargeOwnerConstructorCallsiteC: 0xb05b98,
  runtimeCurrentOwnerHudMinimapUpdateCallsiteA: 0x93cadc,
  runtimeCurrentOwnerHudMinimapUpdateCallsiteB: 0x974c78,
  runtimeCurrentOwnerHudMinimapUpdateCallsiteC: 0xb05fa4,
  runtimeCurrentOwnerHudMinimapVtablePrimary: 0x26d01f0,
  runtimeCurrentOwnerHudMinimapSubobjectInitializer: 0x94c650,
  runtimeCurrentOwnerHudMinimapSubobjectDestructor: 0x94c6c8,
  runtimeCurrentOwnerHudMinimapSubobjectUpdate: 0x94c79c,
  runtimeCurrentOwnerHudMinimapSubobjectLayoutUpdate: 0x94c8ec,
  runtimeCurrentOwnerHudMinimapPositionSampler: 0x94cb00,
  runtimeCurrentOwnerHudMinimapSubobjectVtablePrimary: 0x26d0440,
  runtimeCurrentOwnerHudMinimapPositionSamplerVtableSlot: 0x26d0488,
  hudMinimapString: 0x1aa4e1a,
  hudMinimapBuildPathFormatString: 0x1aa4e40,
  runtimePlayerLockIndexGlobalSlot: 0x2b0f0b0,
  runtimePlayerLockRegistrationHubCallsite: 0x8bae1c,
  runtimePlayerLockRegistration: 0x90c9a4,
  runtimePlayerLockObjectInitializer: 0x90cd10,
  runtimePlayerLockVirtualInvokeCallback: 0x90cd44,
  runtimePlayerLockSlotInstallerCallsite: 0x90ca20,
  runtimePlayerLockKeyedCallbackRegistrationCallsite: 0x90ca44,
  runtimePlayerLockIndexMatchCallback: 0x90ca48,
  runtimePlayerLockOwnerCreateFromCurrentKey: 0x8017b0,
  runtimePlayerLockOwnerCreateIndexLoad: 0x80180c,
  runtimePlayerLockOwnerCreateCallsite: 0x801814,
  runtimePlayerLockSimpleIndexQuery: 0x8881e4,
  runtimePlayerLockSimpleIndexQueryLoad: 0x888210,
  runtimePlayerLockSimpleIndexQueryCallsite: 0x88821c,
  runtimePlayerLockResolvedKeyQueryA: 0x8c5368,
  runtimePlayerLockResolvedKeyQueryACallsite: 0x8c538c,
  runtimePlayerLockResolvedKeyQueryB: 0x9166b4,
  runtimePlayerLockResolvedKeyQueryBCallsite: 0x9166d8,
  runtimePlayerLockResolvedKeyQueryC: 0x95d520,
  runtimePlayerLockResolvedKeyQueryCCallsite: 0x95d544,
  runtimePlayerLockKeyedDispatchLoop: 0xbab884,
  runtimePlayerLockKeyedDispatchLoopResolvedKeyGetter: 0xbab8b0,
  runtimePlayerLockKeyedDispatchLoopCallsite: 0xbab8d0,
  runtimePlayerLockKeyedCallbackIdCallsite: 0xbab930,
  playerLockString: 0x1a9c0a7,
  hudRuntimeString: 0x1a9c078,
  tutorialFiveClientString: 0x1a9630d,
  visionTotemString: 0x1ac4f04,
  runtimeResolvedKeyObjectRequestOwnerRegistrationHubCallsite: 0x8bad0c,
  runtimeResolvedKeyObjectRequestOwnerRegistration: 0x8bee60,
  runtimeResolvedKeyObjectRequestOwnerPrimaryCallback: 0x8bef18,
  runtimeResolvedKeyObjectRequestOwnerSlot0RegisterCallsite: 0x8beedc,
  runtimeResolvedKeyObjectRequestOwnerSlot1Callback: 0x8bf03c,
  runtimeResolvedKeyObjectRequestOwnerSlot1RegisterCallsite: 0x8beef4,
  runtimeResolvedKeyObjectRequestOwnerSlot4Callback: 0x8bf064,
  runtimeResolvedKeyObjectRequestOwnerSlot4RegisterCallsite: 0x8bef14,
  runtimeModuleCallbackSlotInstaller: 0x188c2f4,
  runtimeModuleCallbackSlotDispatch: 0x188bf3c,
  runtimeModuleCallbackSlotDispatchRecords: 0x188c638,
  runtimeModuleCallbackFrameDispatch: 0x188e614,
  runtimeModuleCallbackFrameDispatchSlot6: 0x188e714,
  runtimeModuleCallbackFrameDispatchCallsite: 0x8228b0,
  runtimeModuleCallbackFrameDispatchSlot6Callsite: 0x8228c0,
  runtimeModuleCallbackLateSlotDispatchCallsite: 0x8228f8,
  runtimeModuleObjectCreateWrapper: 0x188e2ac,
  runtimeModuleObjectLookupOrCreate: 0x188c490,
  runtimeModuleObjectSlot0Create: 0x188bb94,
  runtimeResolvedKeyObjectRequestOwnerResolveIndexGlobalSlot: 0x3034d00,
  runtimeResolvedKeyObjectRequestOwnerResolveIndexRegistration: 0xc74158,
  runtimeResolvedKeyObjectRequestOwnerResolveIndexStoreCallsite: 0xc741c0,
  runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadKnownRequest: 0x8bef88,
  runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterA: 0x936cec,
  runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterB: 0x936e58,
  runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterC: 0x976048,
  runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterD: 0xac2384,
  runtimeResolvedKeyOwnerResolveIndexQueryCGetter: 0x976038,
  runtimeResolvedKeyOwnerResolveIndexQueryCCallsite: 0x97605c,
  runtimeResolvedKeyOwnerResolveIndexQueryDGetterA: 0xac2378,
  runtimeResolvedKeyOwnerResolveIndexQueryDGetterB: 0xac23e8,
  runtimeResolvedKeyOwnerResolveIndexQueryDCallsite: 0xac239c,
  runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadValueA: 0xc06270,
  runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadValueB: 0xc06320,
  runtimeResolvedKeyObjectRequestRelatedCreateIndexGlobalSlot: 0x3034ce0,
  runtimeResolvedKeyObjectRequestRelatedCreateIndexRegistration: 0x8b90a0,
  runtimeResolvedKeyObjectRequestRelatedCreateIndexStoreCallsite: 0x8b9108,
  runtimeResolvedKeyObjectRequestOwnerResolveCallsite: 0x8bef90,
  runtimeResolvedKeyObjectRequestRelatedCreateCallsite: 0x8befc0,
  runtimeResolvedKeyObjectRequestRelatedStoreCallsite: 0x8befcc,
  runtimeResolvedKeyObjectRequestGetterCallsite: 0x8bef98,
  runtimeResolvedKeyObjectRequestPostAccessorCallsite: 0x8bef9c,
  runtimeResolvedKeyObjectRequestHelperCallsite: 0x8befac,
  runtimeResolvedKeyObjectRequestLevelSetupIndexLoad: 0x8befdc,
  runtimeResolvedKeyObjectRequestIndexQueryCallsite: 0x8befec,
  runtimeResolvedKeyObjectRequestResultLoad: 0x8beff0,
  runtimeResolvedKeyObjectRequestContextAccessor: 0xc74ce4,
  runtimeResolvedKeyObjectRequestContextListAApplyCallsite: 0x8bf000,
  runtimeResolvedKeyObjectRequestContextListBApplyCallsite: 0x8bf010,
  runtimeResolvedKeyObjectListProcessor: 0xca3bd0,
  runtimeResolvedKeyObjectListProcessorArrayLookup: 0xc7a400,
  runtimeResolvedKeyObjectListProcessorArrayHashLookup: 0xc7a488,
  runtimeResolvedKeyObjectListProcessorSingleLookup: 0xc7a2fc,
  runtimeResolvedKeyObjectListProcessorSingleHashLookup: 0xc7a384,
  runtimeResolvedKeyObjectEntryApply: 0xca3564,
  runtimeResolvedKeyObjectEntryRegistryIndexGlobalSlot: 0x2b84a40,
  runtimeResolvedKeyObjectEntryDefaultScaleGlobalSlot: 0x2ae2b90,
  runtimeResolvedKeyObjectEntrySecondaryIndexGlobalSlot: 0x30af5b0,
  runtimeResolvedKeyObjectEntryTransformWriter: 0xc72fd8,
  runtimeResolvedKeyObjectEntrySecondaryAttach: 0xc7ab28,
  runtimeResolvedKeyObjectEntryScratchBuilder: 0xbb7d00,
  runtimeResolvedKeyObjectEntryHashInsert: 0xca3ffc,
  typedObjectRuntimeKeySelectionTypeId: 0x46f,
  typedObjectInlineKeyWriterTypeId: 0x3e9,
  characterLobbyOwnerInitializer: 0xa7c7a4,
  characterLobbyOwnerPrimaryVtable: 0x26ed4f8,
  characterLobbyRuntimeKeySwitchCallback: 0xa7ca30,
  characterLobbyRuntimeKeySwitchVtableSlot: 0x26ed630,
  characterLobbyRuntimeKeySwitchThunk: 0xa7cb0c,
  characterLobbySubobjectVtable: 0x26ed688,
  characterLobbyStateRefresh: 0xa7c808,
  characterLobbyModeSwitcher: 0xa7c934,
  characterLobbyStateAConstructor: 0xad54a0,
  characterLobbyStateARefresh: 0xad57d4,
  characterLobbyStateADestructor: 0xad58dc,
  characterLobbyStateAApplyPayload: 0xad5a90,
  characterLobbyStateAPayloadSelect: 0xad5b50,
  characterLobbyStateARebuildVisualLists: 0xad5d60,
  characterLobbyStateAUpdateVisualItems: 0xad5fc8,
  characterLobbyStateBConstructor: 0xacd3cc,
  characterLobbyStateBRefresh: 0xacd764,
  characterLobbyStateBDestructor: 0xacd7ec,
  characterLobbyStateBApplyPayload: 0xacda40,
  characterLobbyStateBPayloadSelect: 0xacdcb4,
  characterLobbyStateBRebuildVisualLists: 0xacdfa0,
  characterLobbyStateBUpdateVisualItems: 0xacea44,
  uiCharacterLobbyEnteredSoundString: 0x1abb1ac,
  characterLobbyDraftSelectHeroString: 0x1abebd2,
  characterLobbyDraftLockInHeroString: 0x1abebf7,
  characterLobbyDraftLockedInButtonString: 0x1abf1f0,
  characterLobbyDraftHeroBanSoundString: 0x1abed97,
  characterLobbyDraftLockInSoundString: 0x1abedce,
  characterLobbyDraftSwapHeroesVoiceString: 0x1abee0c,
  characterLobbyDraftNamedAllySelectingString: 0x1abec1d,
  characterLobbyDraftNamedEnemySelectingString: 0x1abec49,
  characterLobbyDraftNamedEnemyBanningString: 0x1abeba7,
  objectBuilderAFunction: 0xc036f4,
  objectBuilderBFunction: 0xc04b3c,
  objectBuilderBLevelSetupIndexQueryCallsite: 0xc04c20,
  genericCallbackIndexQuery: 0x188e540,
  genericCallbackDispatch: 0x188eba4,
  genericCallbackDispatchCallsiteFromLevelRuntimeVisualsLoader: 0x8cc03c,
  genericCallbackDispatchCallsiteFromLevelSetup: 0xc79b1c,
  genericCallbackDispatchCallsiteFromGlobalDispatch: 0x188e3ec,
  genericCallbackDispatchPayloadResolver: 0x18902bc,
  genericCallbackRegistration: 0x188eca4,
  genericCallbackRegistrationTreeInsert: 0x188ed48,
  genericCallbackRegistrationTreeLinker: 0x188ee14,
  sceneProbeProfilePayloadLoad: 0xe36f38,
  moduleRegistryRootCallsite: 0x8bada4,
  moduleRegistrationCallWindowStart: 0x8bad80,
  moduleRegistrationCallWindowEnd: 0x8badc8,
  moduleRegistryIndexGlobalSlot: 0x30350a8,
};

const instructionChecks = [
  {
    address: 0x8cbe34,
    expectedOpcodeHex: "f9000009",
    label: "inline initializer stores primary vtable at owner +0x0",
  },
  {
    address: 0x8cbe38,
    expectedOpcodeHex: "a902fc08",
    label: "inline initializer stores secondary vtable and null active Level area at owner +0x28",
  },
  {
    address: 0x8cbe60,
    expectedOpcodeHex: "f9000009",
    label: "constructor stores primary vtable at owner +0x0",
  },
  {
    address: 0x8cbe64,
    expectedOpcodeHex: "f9001408",
    label: "constructor stores secondary vtable at owner +0x28",
  },
  {
    address: 0x8cbeb8,
    expectedOpcodeHex: "f9000009",
    label: "destructor restores primary vtable at owner +0x0",
  },
  {
    address: 0x8cbebc,
    expectedOpcodeHex: "f9001408",
    label: "destructor restores secondary vtable at owner +0x28",
  },
  {
    address: 0x8cbf08,
    expectedOpcodeHex: "a90b2d48",
    label: "module registration stores object initializer and virtual invoke callback into registry record +0xb0",
  },
  {
    address: 0x8cbf14,
    expectedOpcodeHex: "2914ad49",
    label: "module registration stores registry index and runtime kind 0x38 at record +0xa4",
  },
  {
    address: 0x8cbf2c,
    expectedOpcodeHex: "f828680a",
    label: "module registration stores this runtime record pointer at registry +0x13fb8",
  },
  {
    address: 0x8cbf34,
    expectedOpcodeHex: "b900a909",
    label: "module registration stores this runtime record index in global slot 0x30350a8",
  },
  {
    address: 0x8cbdec,
    expectedOpcodeHex: "b940a901",
    label: "owner dispatch loads this runtime record index from global slot 0x30350a8",
  },
  {
    address: 0x8cbdf0,
    expectedOpcodeHex: "943efeb2",
    label: "owner dispatch resolves the runtime owner record through the generic registry lookup",
  },
  {
    address: 0x8cbdfc,
    expectedOpcodeHex: "aa1303e1",
    label: "owner dispatch forwards the original x1 active Level argument to the owner virtual call",
  },
  {
    address: 0x8cbe04,
    expectedOpcodeHex: "f9401108",
    label: "owner dispatch loads owner vtable slot +0x20",
  },
  {
    address: 0x8cbe08,
    expectedOpcodeHex: "d63f0100",
    label: "owner dispatch calls the loaded vtable +0x20 slot, which resolves to the visuals loader",
  },
  {
    address: 0xc716c0,
    expectedOpcodeHex: "940020cd",
    label: "module registration hub calls the Level setup module registration function",
  },
  {
    address: 0xc79a00,
    expectedOpcodeHex: "5287f608",
    label: "Level setup module registration prepares registry count offset 0x13fb0",
  },
  {
    address: 0xc79a34,
    expectedOpcodeHex: "a90b2d48",
    label: "Level setup module registration stores setup object initializer and virtual invoke callback at record +0xb0",
  },
  {
    address: 0xc79a40,
    expectedOpcodeHex: "2914ad49",
    label: "Level setup module registration stores registry index and setup kind 0x2b0 at record +0xa4",
  },
  {
    address: 0xc79a5c,
    expectedOpcodeHex: "f828680a",
    label: "Level setup module registration stores setup record pointer at registry +0x13fb8",
  },
  {
    address: 0xc79a6c,
    expectedOpcodeHex: "b90e9909",
    label: "Level setup module registration stores setup record index in global slot 0x2d44e98",
  },
  {
    address: 0xc79ab8,
    expectedOpcodeHex: "912b5042",
    label: "Level setup module registration prepares 0xc79ad4 as the registered callback address",
  },
  {
    address: 0xc79abc,
    expectedOpcodeHex: "f9400101",
    label: "Level setup module registration loads callback registration descriptor from 0x2ae61c8",
  },
  {
    address: 0xc79ac4,
    expectedOpcodeHex: "14305478",
    label: "Level setup module registration tail-calls generic callback registration 0x188eca4",
  },
  {
    address: 0x7cda00,
    expectedOpcodeHex: "913a4273",
    label: "Level type descriptor initializer prepares descriptor record 0x3047e90",
  },
  {
    address: 0x7cda08,
    expectedOpcodeHex: "91117842",
    label: "Level type descriptor initializer prepares the type name string Level",
  },
  {
    address: 0x7cda0c,
    expectedOpcodeHex: "320003e1",
    label: "Level type descriptor initializer marks Level as kind 1",
  },
  {
    address: 0x7cda10,
    expectedOpcodeHex: "52803303",
    label: "Level type descriptor initializer records Level object size 0x198",
  },
  {
    address: 0x7cda20,
    expectedOpcodeHex: "944309ff",
    label: "Level type descriptor initializer calls generic type descriptor init 0x189021c",
  },
  {
    address: 0x7cda2c,
    expectedOpcodeHex: "911b8108",
    label: "Level type descriptor initializer prepares Level field-table start 0x30506e0",
  },
  {
    address: 0x7cda30,
    expectedOpcodeHex: "91216129",
    label: "Level type descriptor initializer prepares Level field-table end/count slot 0x3050858",
  },
  {
    address: 0x7cda34,
    expectedOpcodeHex: "a9012668",
    label: "Level type descriptor initializer stores Level field-table pointers at descriptor +0x10",
  },
  {
    address: 0xc7a674,
    expectedOpcodeHex: "f8088408",
    label: "Level setup object initializer stores setup primary vtable and advances to bulk-zero object tail",
  },
  {
    address: 0xc7a688,
    expectedOpcodeHex: "3d80a660",
    label: "Level setup object initializer clears active Level and returned runtime-owner state at +0x290",
  },
  {
    address: 0xc7a6ac,
    expectedOpcodeHex: "f9400008",
    label: "Level setup registered invoke callback loads setup owner primary vtable",
  },
  {
    address: 0xc7a6b0,
    expectedOpcodeHex: "f9400101",
    label: "Level setup registered invoke callback loads setup vtable slot +0x0",
  },
  {
    address: 0xc7a6b4,
    expectedOpcodeHex: "d61f0020",
    label: "Level setup registered invoke callback branches through the loaded virtual slot",
  },
  {
    address: 0x188ecc4,
    expectedOpcodeHex: "f9000be2",
    label: "generic callback registration preserves callback payload pointer x2 on its stack",
  },
  {
    address: 0x188ecd4,
    expectedOpcodeHex: "9400001d",
    label: "generic callback registration inserts/updates the keyed callback record through 0x188ed48",
  },
  {
    address: 0x188ede8,
    expectedOpcodeHex: "3d800800",
    label: "generic callback registry tree insert stores the callback key/payload pair into the new node",
  },
  {
    address: 0x188ee34,
    expectedOpcodeHex: "f9400108",
    label: "generic callback registry tree linker follows the current tree root while linking a node",
  },
  {
    address: 0x188e338,
    expectedOpcodeHex: "d101c3ff",
    label: "generic callback dispatch helper allocates temporary state for descriptor/payload resolution",
  },
  {
    address: 0x188e3a4,
    expectedOpcodeHex: "f904d373",
    label: "generic callback dispatch helper optionally installs temporary callback context at global 0x311a9a0",
  },
  {
    address: 0x188e3ac,
    expectedOpcodeHex: "f904d561",
    label: "generic callback dispatch helper optionally installs a temporary payload-list pointer at global 0x311a9a8",
  },
  {
    address: 0x188e3b0,
    expectedOpcodeHex: "b90786df",
    label: "generic callback dispatch helper resets temporary payload-list cursor before resolution",
  },
  {
    address: 0x188e3b4,
    expectedOpcodeHex: "b9078ae2",
    label: "generic callback dispatch helper stores temporary payload-list count before resolution",
  },
  {
    address: 0x188e3c0,
    expectedOpcodeHex: "f944a520",
    label: "generic callback dispatch helper loads descriptor resolver source global 0x311a948",
  },
  {
    address: 0x188e3c4,
    expectedOpcodeHex: "b9493141",
    label: "generic callback dispatch helper loads descriptor resolver bucket/key index global 0x311a930",
  },
  {
    address: 0x188e3cc,
    expectedOpcodeHex: "aa0803e2",
    label: "generic callback dispatch helper forwards its input key as resolver x2",
  },
  {
    address: 0x188e3d4,
    expectedOpcodeHex: "97fffa2d",
    label: "generic callback dispatch helper resolves descriptor/payload through 0x188cc88",
  },
  {
    address: 0x188e3d8,
    expectedOpcodeHex: "aa0003e2",
    label: "generic callback dispatch helper moves resolved payload into dispatcher x2",
  },
  {
    address: 0x188e3e4,
    expectedOpcodeHex: "f944b500",
    label: "generic callback dispatch helper loads global callback registry 0x311a968",
  },
  {
    address: 0x188e3e8,
    expectedOpcodeHex: "f94003e1",
    label: "generic callback dispatch helper loads resolved descriptor output from its stack",
  },
  {
    address: 0x188e408,
    expectedOpcodeHex: "f904d51a",
    label: "generic callback dispatch helper restores the temporary payload-list pointer after dispatch",
  },
  {
    address: 0x188cc88,
    expectedOpcodeHex: "f9400808",
    label: "descriptor/payload resolver shim loads the registry vector from source +0x10",
  },
  {
    address: 0x188cc8c,
    expectedOpcodeHex: "f8615900",
    label: "descriptor/payload resolver shim selects the registry bucket by index",
  },
  {
    address: 0x188cc90,
    expectedOpcodeHex: "aa0203e1",
    label: "descriptor/payload resolver shim forwards the original key pointer as x1",
  },
  {
    address: 0x188cc94,
    expectedOpcodeHex: "aa0303e2",
    label: "descriptor/payload resolver shim forwards the descriptor-output pointer as x2",
  },
  {
    address: 0x188cc98,
    expectedOpcodeHex: "14000b18",
    label: "descriptor/payload resolver shim tail-calls 0x188f8f8",
  },
  {
    address: 0x188f918,
    expectedOpcodeHex: "97d37772",
    label: "descriptor/payload resolver measures/hashes the key before tree lookup",
  },
  {
    address: 0x188f91c,
    expectedOpcodeHex: "528acf02",
    label: "descriptor/payload resolver prepares hash seed low half 0x5678",
  },
  {
    address: 0x188f928,
    expectedOpcodeHex: "aa1503e0",
    label: "descriptor/payload resolver forwards the key pointer into the hash function",
  },
  {
    address: 0x188f930,
    expectedOpcodeHex: "f8420e89",
    label: "descriptor/payload resolver loads the registry tree root from bucket +0x20",
  },
  {
    address: 0x188f93c,
    expectedOpcodeHex: "b940212a",
    label: "descriptor/payload resolver compares the hashed key against tree node +0x20",
  },
  {
    address: 0x188f970,
    expectedOpcodeHex: "f9401909",
    label: "descriptor/payload resolver writes matched descriptor node +0x30 to the output pointer",
  },
  {
    address: 0x188f978,
    expectedOpcodeHex: "f9401500",
    label: "descriptor/payload resolver returns matched payload node +0x28",
  },
  {
    address: 0x81c970,
    expectedOpcodeHex: "900093e2",
    label: "manifest caller A prepares *KindredManifest* as descriptor/payload key",
  },
  {
    address: 0x81c974,
    expectedOpcodeHex: "911c3442",
    label: "manifest caller A completes *KindredManifest* key address",
  },
  {
    address: 0x81c9a8,
    expectedOpcodeHex: "9441c664",
    label: "manifest caller A dispatches the manifest key through the generic callback helper",
  },
  {
    address: 0x81ca5c,
    expectedOpcodeHex: "900093e2",
    label: "manifest caller B prepares *KindredManifest* as descriptor/payload key",
  },
  {
    address: 0x81ca60,
    expectedOpcodeHex: "911c3442",
    label: "manifest caller B completes *KindredManifest* key address",
  },
  {
    address: 0x81ca94,
    expectedOpcodeHex: "9441c629",
    label: "manifest caller B dispatches the manifest key through the generic callback helper",
  },
  {
    address: 0x82651c,
    expectedOpcodeHex: "d0009382",
    label: "manifest caller C prepares *KindredManifest* as descriptor/payload key",
  },
  {
    address: 0x826520,
    expectedOpcodeHex: "911c3442",
    label: "manifest caller C completes *KindredManifest* key address",
  },
  {
    address: 0x826554,
    expectedOpcodeHex: "94419f79",
    label: "manifest caller C dispatches the manifest key through the generic callback helper",
  },
  {
    address: 0xc7299c,
    expectedOpcodeHex: "b00121e9",
    label: "resource key table primary constructor prepares global root slot page 0x30afbe8",
  },
  {
    address: 0xc729a4,
    expectedOpcodeHex: "f900141f",
    label: "resource key table primary constructor clears object +0x28",
  },
  {
    address: 0xc729a8,
    expectedOpcodeHex: "b900381f",
    label: "resource key table primary constructor clears object +0x38 count",
  },
  {
    address: 0xc729ac,
    expectedOpcodeHex: "f900201f",
    label: "resource key table primary constructor clears object +0x40 vector/table pointer",
  },
  {
    address: 0xc729b0,
    expectedOpcodeHex: "f9000008",
    label: "resource key table primary constructor writes its vtable pointer",
  },
  {
    address: 0xc729b4,
    expectedOpcodeHex: "f905f520",
    label: "resource key table primary constructor publishes this object into global root slot 0x30afbe8",
  },
  {
    address: 0xc729fc,
    expectedOpcodeHex: "f9001a7f",
    label: "resource key table destructor clears object +0x30 backing pointer",
  },
  {
    address: 0xc72a04,
    expectedOpcodeHex: "f900227f",
    label: "resource key table destructor clears object +0x40 vector/table pointer",
  },
  {
    address: 0xc72a08,
    expectedOpcodeHex: "f905f51f",
    label: "resource key table destructor clears global root slot 0x30afbe8",
  },
  {
    address: 0xc72ed8,
    expectedOpcodeHex: "b00121e9",
    label: "resource key table secondary constructor prepares global root slot page 0x30afbe8",
  },
  {
    address: 0xc72ee8,
    expectedOpcodeHex: "f900201f",
    label: "resource key table secondary constructor clears object +0x40 vector/table pointer",
  },
  {
    address: 0xc72ef0,
    expectedOpcodeHex: "f905f520",
    label: "resource key table secondary constructor publishes this object into global root slot 0x30afbe8",
  },
  {
    address: 0xc72dbc,
    expectedOpcodeHex: "b00121e8",
    label: "resource key table accessor loads the global resource key table owner",
  },
  {
    address: 0xc72dc0,
    expectedOpcodeHex: "f945f500",
    label: "resource key table accessor reads global root slot 0x30afbe8",
  },
  {
    address: 0xc72da8,
    expectedOpcodeHex: "f9402008",
    label: "resource key by id lookup loads the table vector from owner +0x40",
  },
  {
    address: 0xc72db4,
    expectedOpcodeHex: "f9400100",
    label: "resource key by id lookup returns the selected key pointer",
  },
  {
    address: 0xc72cec,
    expectedOpcodeHex: "a9be4ff4",
    label: "resource key hash/string lookup begins string-to-entry scan",
  },
  {
    address: 0xc72d1c,
    expectedOpcodeHex: "b9403a6a",
    label: "resource key hash/string lookup loads owner +0x38 entry count",
  },
  {
    address: 0xc72d28,
    expectedOpcodeHex: "f9401a6b",
    label: "resource key hash/string lookup loads owner +0x30 hash array",
  },
  {
    address: 0xc72d60,
    expectedOpcodeHex: "f9402268",
    label: "resource key hash/string lookup loads owner +0x40 table vector on hash match",
  },
  {
    address: 0xc72d6c,
    expectedOpcodeHex: "f9400500",
    label: "resource key hash/string lookup returns matched entry +0x8",
  },
  {
    address: 0xc72dc8,
    expectedOpcodeHex: "f81e0ff3",
    label: "resource key by string lookup begins the resolver bridge",
  },
  {
    address: 0xc72dd4,
    expectedOpcodeHex: "aa0103f3",
    label: "resource key by string lookup preserves the input key string",
  },
  {
    address: 0xc72dd8,
    expectedOpcodeHex: "94306d2d",
    label: "resource key by string lookup reads the global resource registry root",
  },
  {
    address: 0xc72de0,
    expectedOpcodeHex: "2a1f03e1",
    label: "resource key by string lookup selects registry bucket index 0",
  },
  {
    address: 0xc72de4,
    expectedOpcodeHex: "aa1303e2",
    label: "resource key by string lookup forwards the preserved key as resolver x2",
  },
  {
    address: 0xc72de8,
    expectedOpcodeHex: "aa1f03e3",
    label: "resource key by string lookup passes no descriptor-output pointer",
  },
  {
    address: 0xc72df0,
    expectedOpcodeHex: "143067a6",
    label: "resource key by string lookup tail-calls descriptor/payload resolver 0x188cc88",
  },
  {
    address: 0xc72df4,
    expectedOpcodeHex: "f81e0ff3",
    label: "resource key by id payload lookup begins resolver bridge",
  },
  {
    address: 0xc72e00,
    expectedOpcodeHex: "f9402008",
    label: "resource key by id payload lookup loads owner +0x40 table vector",
  },
  {
    address: 0xc72e0c,
    expectedOpcodeHex: "f9400113",
    label: "resource key by id payload lookup reads selected entry +0 key",
  },
  {
    address: 0xc72e10,
    expectedOpcodeHex: "94306d1f",
    label: "resource key by id payload lookup reads the global resource registry root",
  },
  {
    address: 0xc72e20,
    expectedOpcodeHex: "aa1f03e3",
    label: "resource key by id payload lookup passes no descriptor-output pointer",
  },
  {
    address: 0xc72e28,
    expectedOpcodeHex: "14306798",
    label: "resource key by id payload lookup tail-calls descriptor/payload resolver 0x188cc88",
  },
  {
    address: 0xc72e2c,
    expectedOpcodeHex: "d10103ff",
    label: "resource key by id typed lookup begins descriptor-checked resolver bridge",
  },
  {
    address: 0xc72e54,
    expectedOpcodeHex: "b9403809",
    label: "resource key by id typed lookup loads owner +0x38 entry count",
  },
  {
    address: 0xc72e64,
    expectedOpcodeHex: "f9402108",
    label: "resource key by id typed lookup loads owner +0x40 table vector",
  },
  {
    address: 0xc72e70,
    expectedOpcodeHex: "f9400114",
    label: "resource key by id typed lookup reads selected entry +0 key",
  },
  {
    address: 0xc72e74,
    expectedOpcodeHex: "f90003ff",
    label: "resource key by id typed lookup clears stack descriptor-output slot",
  },
  {
    address: 0xc72e88,
    expectedOpcodeHex: "94306780",
    label: "resource key by id typed lookup calls descriptor/payload resolver 0x188cc88",
  },
  {
    address: 0xc72e8c,
    expectedOpcodeHex: "f94003e8",
    label: "resource key by id typed lookup reads resolved descriptor from stack",
  },
  {
    address: 0xc72e94,
    expectedOpcodeHex: "b9400508",
    label: "resource key by id typed lookup reads resolved descriptor +0x4 type id",
  },
  {
    address: 0xc72e98,
    expectedOpcodeHex: "b9400669",
    label: "resource key by id typed lookup reads expected descriptor +0x4 type id",
  },
  {
    address: 0xc72ea4,
    expectedOpcodeHex: "aa1f03e0",
    label: "resource key by id typed lookup returns null on descriptor mismatch",
  },
  {
    address: 0x82dc04,
    expectedOpcodeHex: "a9bc5ffc",
    label: "typed object dispatcher function prologue for the 0x03f3 object-builder B case",
  },
  {
    address: 0x82dc34,
    expectedOpcodeHex: "78402668",
    label: "typed object dispatcher reads the big-endian 16-bit type id from the input stream",
  },
  {
    address: 0x82dc38,
    expectedOpcodeHex: "5ac00917",
    label: "typed object dispatcher byte-swaps the type id word",
  },
  {
    address: 0x82dc50,
    expectedOpcodeHex: "53107ef5",
    label: "typed object dispatcher keeps the normalized type id in w21",
  },
  {
    address: 0x82dc60,
    expectedOpcodeHex: "510fa6a8",
    label: "typed object dispatcher subtracts base type id 0x3e9 before jump-table lookup",
  },
  {
    address: 0x82dc64,
    expectedOpcodeHex: "71029d1f",
    label: "typed object dispatcher bounds-checks 0xa8 jump-table entries",
  },
  {
    address: 0x82dc6c,
    expectedOpcodeHex: "90009369",
    label: "typed object dispatcher prepares jump table page 0x1a995b0",
  },
  {
    address: 0x82dc70,
    expectedOpcodeHex: "9116c129",
    label: "typed object dispatcher completes jump table address 0x1a995b0",
  },
  {
    address: 0x82dc74,
    expectedOpcodeHex: "b8a87928",
    label: "typed object dispatcher loads the signed jump-table offset for the normalized type id",
  },
  {
    address: 0x82dc78,
    expectedOpcodeHex: "8b090108",
    label: "typed object dispatcher adds the jump-table base to the selected offset",
  },
  {
    address: 0x82dc7c,
    expectedOpcodeHex: "d61f0100",
    label: "typed object dispatcher branches to the selected typed-object case",
  },
  {
    address: 0xc03734,
    expectedOpcodeHex: "9401bda2",
    label: "object builder A loads the global resource key table owner",
  },
  {
    address: 0xc0373c,
    expectedOpcodeHex: "9401bd9b",
    label: "object builder A resolves a resource key from input +0x1c",
  },
  {
    address: 0xc03740,
    expectedOpcodeHex: "910003e1",
    label: "object builder A passes stack output pointer as generic helper x1",
  },
  {
    address: 0xc03744,
    expectedOpcodeHex: "320003e2",
    label: "object builder A requests one payload through generic helper x2",
  },
  {
    address: 0xc03748,
    expectedOpcodeHex: "aa1f03e3",
    label: "object builder A passes null context as generic helper x3",
  },
  {
    address: 0xc0374c,
    expectedOpcodeHex: "94322afb",
    label: "object builder A requests one object through the generic callback dispatch helper",
  },
  {
    address: 0xc04b7c,
    expectedOpcodeHex: "9401b890",
    label: "object builder B loads the global resource key table owner",
  },
  {
    address: 0x82e4ac,
    expectedOpcodeHex: "910043e0",
    label: "typed object case 0x03f3 prepares its stack copy before object builder B parsing",
  },
  {
    address: 0x82e4b0,
    expectedOpcodeHex: "52805d42",
    label: "typed object case 0x03f3 copies 0x2ea bytes for object builder B serialized input",
  },
  {
    address: 0x82e4c0,
    expectedOpcodeHex: "97fd959c",
    label: "typed object case 0x03f3 copies serialized input bytes before endian fixups",
  },
  {
    address: 0x82ea98,
    expectedOpcodeHex: "97fff0c8",
    label: "typed object case 0x03f3 calls the object builder B parser wrapper",
  },
  {
    address: 0x82b0e8,
    expectedOpcodeHex: "29400668",
    label: "object builder B parser wrapper loads payload word0 and word1 from the decoded 0x03f3 payload",
  },
  {
    address: 0x82b0ec,
    expectedOpcodeHex: "b9011fe8",
    label: "object builder B parser wrapper preserves payload word0 before constructor argument setup",
  },
  {
    address: 0x82b1b8,
    expectedOpcodeHex: "b9411fe1",
    label: "object builder B parser wrapper reloads payload word0 as constructor argument w1",
  },
  {
    address: 0x82b278,
    expectedOpcodeHex: "940f64c5",
    label: "object builder B parser wrapper calls constructor 0xc0458c",
  },
  {
    address: 0x82fbcc,
    expectedOpcodeHex: "910043e0",
    label: "typed object case 0x046f prepares its runtime key selection payload stack copy",
  },
  {
    address: 0x82fbd0,
    expectedOpcodeHex: "528008a2",
    label: "typed object case 0x046f copies 0x45 bytes for runtime key selection",
  },
  {
    address: 0x82fbd8,
    expectedOpcodeHex: "97fd8fd6",
    label: "typed object case 0x046f copies serialized runtime key selection bytes",
  },
  {
    address: 0x82fbe4,
    expectedOpcodeHex: "5ac00908",
    label: "typed object case 0x046f byte-swaps the float/time field at payload +0x40",
  },
  {
    address: 0x82fbec,
    expectedOpcodeHex: "97fff721",
    label: "typed object case 0x046f calls runtime key selection helper 0x82d870",
  },
  {
    address: 0x82d894,
    expectedOpcodeHex: "94024207",
    label: "runtime key selection helper obtains the current runtime/profile owner through 0x8be0b0",
  },
  {
    address: 0x82d8a4,
    expectedOpcodeHex: "97ff3c36",
    label: "runtime key selection helper copies the payload-leading string into a temporary key string",
  },
  {
    address: 0x82d8a8,
    expectedOpcodeHex: "39411268",
    label: "runtime key selection helper reads the payload flag at +0x44",
  },
  {
    address: 0x82d8ac,
    expectedOpcodeHex: "bd404260",
    label: "runtime key selection helper reads the payload float/time field at +0x40",
  },
  {
    address: 0x82d8bc,
    expectedOpcodeHex: "1a9f07e2",
    label: "runtime key selection helper converts payload +0x44 into a boolean argument",
  },
  {
    address: 0x82d8c0,
    expectedOpcodeHex: "9402471c",
    label: "runtime key selection helper calls 0x8bf530 with owner, key string, float, and flag",
  },
  {
    address: 0x82dc80,
    expectedOpcodeHex: "910043e0",
    label: "typed-object type 0x03e9 dispatch case prepares a local decoded payload buffer",
  },
  {
    address: 0x82dc84,
    expectedOpcodeHex: "52800ca2",
    label: "typed-object type 0x03e9 dispatch case copies a 0x65-byte payload",
  },
  {
    address: 0x82dc8c,
    expectedOpcodeHex: "97fd97a9",
    label: "typed-object type 0x03e9 dispatch case copies stream payload bytes",
  },
  {
    address: 0x82dccc,
    expectedOpcodeHex: "97ffe1ae",
    label: "typed-object type 0x03e9 dispatch case applies a post-decode guard before helper dispatch",
  },
  {
    address: 0x82dcd8,
    expectedOpcodeHex: "910043e0",
    label: "typed-object type 0x03e9 dispatch case passes the decoded payload buffer to helper 0x82b68c",
  },
  {
    address: 0x82dcdc,
    expectedOpcodeHex: "97fff66c",
    label: "typed-object type 0x03e9 dispatch case calls helper 0x82b68c",
  },
  {
    address: 0x82b68c,
    expectedOpcodeHex: "d10443ff",
    label: "typed-object type 0x03e9 helper prologue",
  },
  {
    address: 0x82b6ac,
    expectedOpcodeHex: "91008001",
    label: "typed-object type 0x03e9 helper treats payload +0x20 as the runtime key string",
  },
  {
    address: 0x82b6b8,
    expectedOpcodeHex: "97ff44b1",
    label: "typed-object type 0x03e9 helper copies the payload key string into a temporary string",
  },
  {
    address: 0x8bf558,
    expectedOpcodeHex: "9104a000",
    label: "runtime key setter prepares owner +0x128 state before key switch",
  },
  {
    address: 0x8bf550,
    expectedOpcodeHex: "aa0103f4",
    label: "runtime key setter preserves function arg1 as the selected key string object",
  },
  {
    address: 0x8bf570,
    expectedOpcodeHex: "aa1403e0",
    label: "runtime key setter passes preserved arg1 string object to the global resource-key setter",
  },
  {
    address: 0x8bf574,
    expectedOpcodeHex: "940cb282",
    label: "runtime key setter writes the selected key string into the global resource-key slot",
  },
  {
    address: 0x8bf578,
    expectedOpcodeHex: "940cb289",
    label: "runtime key setter resolves/caches the global resource key immediately after writing it",
  },
  {
    address: 0x82b6c0,
    expectedOpcodeHex: "940f022f",
    label: "third current global resource-key setter caller writes an inline copied key string",
  },
  {
    address: 0x82b6dc,
    expectedOpcodeHex: "940f0230",
    label: "third current global resource-key setter caller resolves/caches the key immediately after the global write",
  },
  {
    address: 0x81ca98,
    expectedOpcodeHex: "940f3d41",
    label: "manifest fallback path resolves/caches the global runtime key through 0xbebf9c",
  },
  {
    address: 0x826558,
    expectedOpcodeHex: "940f1691",
    label: ".vgr manifest/input setup path resolves/caches the global runtime key through 0xbebf9c",
  },
  {
    address: 0x82b6d4,
    expectedOpcodeHex: "bd406260",
    label: "typed-object type 0x03e9 helper reads payload +0x60 as a float/time field",
  },
  {
    address: 0x82b6d8,
    expectedOpcodeHex: "940f0251",
    label: "typed-object type 0x03e9 helper applies the payload +0x60 float/time field",
  },
  {
    address: 0x82b6e0,
    expectedOpcodeHex: "940f01bc",
    label: "typed-object type 0x03e9 helper checks the resolved runtime key state before optional object construction",
  },
  {
    address: 0x8bf588,
    expectedOpcodeHex: "bd02bea8",
    label: "runtime key setter stores the payload float/time field at owner +0x2bc",
  },
  {
    address: 0xbebf7c,
    expectedOpcodeHex: "d0012328",
    label: "global runtime resource-key setter prepares string slot 0x3051220",
  },
  {
    address: 0xbebf8c,
    expectedOpcodeHex: "17f04cc1",
    label: "global runtime resource-key setter tail-calls the string assignment helper",
  },
  {
    address: 0xbebf9c,
    expectedOpcodeHex: "a9bf7bfd",
    label: "global runtime resource-key resolver prologue",
  },
  {
    address: 0xbebfc0,
    expectedOpcodeHex: "94021b82",
    label: "global runtime resource-key resolver resolves the string through 0xc72dc8",
  },
  {
    address: 0xbebfc8,
    expectedOpcodeHex: "f9010d00",
    label: "global runtime resource-key resolver stores the resolved key at 0x3051218",
  },
  {
    address: 0x8bad0c,
    expectedOpcodeHex: "94001055",
    label: "runtime module registration hub calls the resolved-key object request owner registration",
  },
  {
    address: 0x8bee80,
    expectedOpcodeHex: "913c6042",
    label: "resolved-key object request owner registration prepares slot 0 callback 0x8bef18",
  },
  {
    address: 0x8beedc,
    expectedOpcodeHex: "943f3506",
    label: "resolved-key object request owner registration installs slot 0 callback through 0x188c2f4",
  },
  {
    address: 0x8beee4,
    expectedOpcodeHex: "9100f042",
    label: "resolved-key object request owner registration prepares slot 1 callback 0x8bf03c",
  },
  {
    address: 0x8beef4,
    expectedOpcodeHex: "943f3500",
    label: "resolved-key object request owner registration installs slot 1 callback through 0x188c2f4",
  },
  {
    address: 0x8bef00,
    expectedOpcodeHex: "91019042",
    label: "resolved-key object request owner registration prepares slot 4 callback 0x8bf064",
  },
  {
    address: 0x8bef14,
    expectedOpcodeHex: "143f34f8",
    label: "resolved-key object request owner registration tail-installs slot 4 callback through 0x188c2f4",
  },
  {
    address: 0x188c2f4,
    expectedOpcodeHex: "5287f708",
    label: "runtime module callback slot installer prepares owner callback table offset 0x13fb8",
  },
  {
    address: 0x188c304,
    expectedOpcodeHex: "f8215922",
    label: "runtime module callback slot installer stores callback pointer into slot w1",
  },
  {
    address: 0x188c320,
    expectedOpcodeHex: "b900a109",
    label: "runtime module callback slot installer updates callback availability bitmask",
  },
  {
    address: 0x188bf50,
    expectedOpcodeHex: "f8615809",
    label: "runtime module callback slot dispatch loads the callback pointer for requested slot w1",
  },
  {
    address: 0x188bf6c,
    expectedOpcodeHex: "94000a85",
    label: "runtime module callback slot dispatch enters the optional pre-dispatch helper when the slot callback is present",
  },
  {
    address: 0x188bf8c,
    expectedOpcodeHex: "f8757a6b",
    label: "runtime module callback slot dispatch reloads the callback pointer for each active record",
  },
  {
    address: 0x188bf9c,
    expectedOpcodeHex: "d63f0160",
    label: "runtime module callback slot dispatch invokes the slot callback through blr x11",
  },
  {
    address: 0x188bfb4,
    expectedOpcodeHex: "f9402923",
    label: "runtime module callback slot dispatch loads the tail callback from slot record +0x50",
  },
  {
    address: 0x188bfd8,
    expectedOpcodeHex: "d61f0060",
    label: "runtime module callback slot dispatch tail-branches to the slot record tail callback",
  },
  {
    address: 0x188c638,
    expectedOpcodeHex: "f81b0ff9",
    label: "runtime module callback record dispatcher entry starts at 0x188c638",
  },
  {
    address: 0x188c658,
    expectedOpcodeHex: "2a0103f4",
    label: "runtime module callback record dispatcher preserves requested slot w1 in w20",
  },
  {
    address: 0x188c67c,
    expectedOpcodeHex: "97fffdfa",
    label: "runtime module callback record dispatcher collects/checks active records before slot dispatch",
  },
  {
    address: 0x188c684,
    expectedOpcodeHex: "f8766909",
    label: "runtime module callback record dispatcher checks the requested slot callback pointer",
  },
  {
    address: 0x188c690,
    expectedOpcodeHex: "f9402908",
    label: "runtime module callback record dispatcher checks the requested slot tail callback pointer",
  },
  {
    address: 0x188c69c,
    expectedOpcodeHex: "2a1403e1",
    label: "runtime module callback record dispatcher forwards the preserved slot to 0x188bf3c",
  },
  {
    address: 0x188c6a0,
    expectedOpcodeHex: "97fffe27",
    label: "runtime module callback record dispatcher calls slot dispatch 0x188bf3c",
  },
  {
    address: 0x188c6a8,
    expectedOpcodeHex: "97fffdef",
    label: "runtime module callback record dispatcher refreshes active-record state after slot dispatch",
  },
  {
    address: 0x188e614,
    expectedOpcodeHex: "6dbd23e9",
    label: "runtime module frame dispatch wrapper begins the slot 2-5 phase",
  },
  {
    address: 0x188e638,
    expectedOpcodeHex: "f944ae60",
    label: "runtime module frame dispatch wrapper loads global module manager before slot 2 dispatch",
  },
  {
    address: 0x188e63c,
    expectedOpcodeHex: "321f03e1",
    label: "runtime module frame dispatch wrapper prepares slot 2",
  },
  {
    address: 0x188e640,
    expectedOpcodeHex: "97fff7fe",
    label: "runtime module frame dispatch wrapper dispatches slot 2 through 0x188c638",
  },
  {
    address: 0x188e688,
    expectedOpcodeHex: "f944ae60",
    label: "runtime module frame dispatch wrapper reloads global module manager before slot 3 dispatch",
  },
  {
    address: 0x188e68c,
    expectedOpcodeHex: "320007e1",
    label: "runtime module frame dispatch wrapper prepares slot 3",
  },
  {
    address: 0x188e690,
    expectedOpcodeHex: "97fff7ea",
    label: "runtime module frame dispatch wrapper dispatches slot 3 through 0x188c638",
  },
  {
    address: 0x188e6b0,
    expectedOpcodeHex: "f944ae60",
    label: "runtime module frame dispatch wrapper reloads global module manager before slot 4 dispatch",
  },
  {
    address: 0x188e6b4,
    expectedOpcodeHex: "321e03e1",
    label: "runtime module frame dispatch wrapper prepares slot 4",
  },
  {
    address: 0x188e6b8,
    expectedOpcodeHex: "97fff7e0",
    label: "runtime module frame dispatch wrapper dispatches slot 4 through 0x188c638",
  },
  {
    address: 0x188e6d8,
    expectedOpcodeHex: "528000a1",
    label: "runtime module frame dispatch wrapper prepares slot 5",
  },
  {
    address: 0x188e6dc,
    expectedOpcodeHex: "97fff7d7",
    label: "runtime module frame dispatch wrapper dispatches slot 5 through 0x188c638",
  },
  {
    address: 0x188e714,
    expectedOpcodeHex: "9000c468",
    label: "runtime module late frame dispatch wrapper begins the slot 6 phase",
  },
  {
    address: 0x188e71c,
    expectedOpcodeHex: "321f07e1",
    label: "runtime module late frame dispatch wrapper prepares slot 6",
  },
  {
    address: 0x188e720,
    expectedOpcodeHex: "17fff7c6",
    label: "runtime module late frame dispatch wrapper tail-dispatches slot 6 through 0x188c638",
  },
  {
    address: 0x8228b0,
    expectedOpcodeHex: "9441af59",
    label: "native frame loop calls runtime module frame dispatch wrapper for slots 2-5",
  },
  {
    address: 0x8228c0,
    expectedOpcodeHex: "9441af95",
    label: "native frame loop calls runtime module late frame dispatch wrapper for slot 6",
  },
  {
    address: 0x8228f8,
    expectedOpcodeHex: "9441af8b",
    label: "native frame loop calls the late runtime slot dispatch helper after frame presentation work",
  },
  {
    address: 0x188b8d4,
    expectedOpcodeHex: "940002ef",
    label: "generic registry lookup calls object lookup/create helper 0x188c490",
  },
  {
    address: 0x188c490,
    expectedOpcodeHex: "f9400008",
    label: "runtime module object lookup/create wrapper loads the module object array",
  },
  {
    address: 0x188c49c,
    expectedOpcodeHex: "17fffdbe",
    label: "runtime module object lookup/create wrapper tail-enters object creation path 0x188bb94",
  },
  {
    address: 0x188bbfc,
    expectedOpcodeHex: "f9405a68",
    label: "runtime module object creation path loads record initializer at +0xb0",
  },
  {
    address: 0x188bc04,
    expectedOpcodeHex: "d63f0100",
    label: "runtime module object creation path invokes record initializer",
  },
  {
    address: 0x188bc08,
    expectedOpcodeHex: "f9400268",
    label: "runtime module object creation path loads slot 0 callback from record +0x0",
  },
  {
    address: 0x188bc14,
    expectedOpcodeHex: "d63f0100",
    label: "runtime module object creation path invokes slot 0 callback",
  },
  {
    address: 0x188e2bc,
    expectedOpcodeHex: "f944ad08",
    label: "runtime module public object-create wrapper loads global module manager 0x311a958",
  },
  {
    address: 0x188e2cc,
    expectedOpcodeHex: "97fff871",
    label: "runtime module public object-create wrapper calls object lookup/create helper 0x188c490",
  },
  {
    address: 0x188e2f4,
    expectedOpcodeHex: "97fff582",
    label: "runtime module public object-create wrapper optionally links the created object into the caller list",
  },
  {
    address: 0x8b90a0,
    expectedOpcodeHex: "5287f608",
    label: "resolved-key related-create registry owner registration prepares shared module record count offset",
  },
  {
    address: 0x8b90cc,
    expectedOpcodeHex: "a90b214b",
    label: "resolved-key related-create registry owner registration stores initializer/destructor callbacks",
  },
  {
    address: 0x8b9108,
    expectedOpcodeHex: "b90ce109",
    label: "resolved-key related-create registry owner registration stores its index in global slot 0x3034ce0",
  },
  {
    address: 0xc74158,
    expectedOpcodeHex: "f81e0ff3",
    label: "resolved-key owner-resolve registry owner registration begins",
  },
  {
    address: 0xc74194,
    expectedOpcodeHex: "a90b2d48",
    label: "resolved-key owner-resolve registry owner registration stores initializer/destructor callbacks",
  },
  {
    address: 0xc741c0,
    expectedOpcodeHex: "b90d0109",
    label: "resolved-key owner-resolve registry owner registration stores its index in global slot 0x3034d00",
  },
  {
    address: 0x8bef40,
    expectedOpcodeHex: "910003e8",
    label: "runtime pre-owner callback passes stack string object pointer in x8",
  },
  {
    address: 0x8bef48,
    expectedOpcodeHex: "940c92c1",
    label: "runtime pre-owner callback builds request key from resolved runtime key object +0x8",
  },
  {
    address: 0xbe3a5c,
    expectedOpcodeHex: "9400213e",
    label: "runtime pre-owner key builder reads the cached resolved runtime key object through 0xbebf54",
  },
  {
    address: 0xbe3a60,
    expectedOpcodeHex: "f9400401",
    label: "runtime pre-owner key builder loads resolved object +0x8 as the request key string",
  },
  {
    address: 0xbe3a70,
    expectedOpcodeHex: "17f063c3",
    label: "runtime pre-owner key builder copies resolved object +0x8 into the stack string object",
  },
  {
    address: 0x8bef58,
    expectedOpcodeHex: "12800002",
    label: "runtime pre-owner dispatch requests fallback payload count -1 through generic helper x2",
  },
  {
    address: 0x8bef64,
    expectedOpcodeHex: "aa1f03e1",
    label: "runtime pre-owner dispatch passes no output payload list pointer as generic helper x1",
  },
  {
    address: 0x8bef68,
    expectedOpcodeHex: "aa1303e3",
    label: "runtime pre-owner dispatch forwards owner/context x19 as generic helper x3",
  },
  {
    address: 0x8bef6c,
    expectedOpcodeHex: "943f3cf3",
    label: "runtime pre-owner dispatch invokes generic helper 0x188e338 with temporary request key",
  },
  {
    address: 0x8bef88,
    expectedOpcodeHex: "b94d0101",
    label: "resolved-key object request reads owner-resolve registry index 0x3034d00",
  },
  {
    address: 0x936cec,
    expectedOpcodeHex: "b94d0102",
    label: "owner-resolve derived counter A reads registry index 0x3034d00",
  },
  {
    address: 0x936cf8,
    expectedOpcodeHex: "943d5e12",
    label: "owner-resolve derived counter A queries indexed objects through 0x188e540",
  },
  {
    address: 0x936e58,
    expectedOpcodeHex: "b94d0102",
    label: "owner-resolve derived counter B reads registry index 0x3034d00",
  },
  {
    address: 0x936e64,
    expectedOpcodeHex: "943d5db7",
    label: "owner-resolve derived counter B queries indexed objects through 0x188e540",
  },
  {
    address: 0x976048,
    expectedOpcodeHex: "b94d0102",
    label: "owner-resolve stats refresh reads registry index 0x3034d00",
  },
  {
    address: 0x97605c,
    expectedOpcodeHex: "943c6139",
    label: "owner-resolve stats refresh queries indexed objects through 0x188e540",
  },
  {
    address: 0xac2384,
    expectedOpcodeHex: "b94d0102",
    label: "owner-resolve stats refresh B reads registry index 0x3034d00",
  },
  {
    address: 0xac239c,
    expectedOpcodeHex: "94373069",
    label: "owner-resolve stats refresh B queries indexed objects through 0x188e540",
  },
  {
    address: 0xc06270,
    expectedOpcodeHex: "b94d0102",
    label: "owner-resolve value application A reads registry index 0x3034d00",
  },
  {
    address: 0xc06284,
    expectedOpcodeHex: "943220af",
    label: "owner-resolve value application A queries indexed objects through 0x188e540",
  },
  {
    address: 0xc06320,
    expectedOpcodeHex: "b94d0102",
    label: "owner-resolve value application B reads registry index 0x3034d00",
  },
  {
    address: 0xc0632c,
    expectedOpcodeHex: "94322085",
    label: "owner-resolve value application B queries indexed objects through 0x188e540",
  },
  {
    address: 0x8bef90,
    expectedOpcodeHex: "943f324a",
    label: "resolved-key object request path resolves/creates the owner object through generic registry lookup",
  },
  {
    address: 0x8befc0,
    expectedOpcodeHex: "943f3cbb",
    label: "resolved-key object request path creates a related runtime object through 0x188e2ac",
  },
  {
    address: 0x8befcc,
    expectedOpcodeHex: "f9015a60",
    label: "resolved-key object request path stores the created related runtime object at owner +0x2b0",
  },
  {
    address: 0x8bef98,
    expectedOpcodeHex: "940cb3ef",
    label: "runtime object request path reads the resolved runtime resource key through 0xbebf54",
  },
  {
    address: 0x8bef9c,
    expectedOpcodeHex: "940cb42a",
    label: "runtime object request path normalizes/prepares the resolved key through 0xbec044",
  },
  {
    address: 0xbec044,
    expectedOpcodeHex: "f9401000",
    label: "runtime post-accessor returns resolved runtime key object +0x20 as the dispatch key",
  },
  {
    address: 0x83f70c,
    expectedOpcodeHex: "940eb212",
    label: "settings/preferredBuildPath path reads the cached runtime resource key through 0xbebf54",
  },
  {
    address: 0x83f710,
    expectedOpcodeHex: "940eb24d",
    label: "settings/preferredBuildPath path normalizes cached runtime resource key through 0xbec044",
  },
  {
    address: 0x83f870,
    expectedOpcodeHex: "940eb1b9",
    label: "second settings/preferredBuildPath path reads the cached runtime resource key through 0xbebf54",
  },
  {
    address: 0x83f874,
    expectedOpcodeHex: "940eb1f4",
    label: "second settings/preferredBuildPath path normalizes cached runtime resource key through 0xbec044",
  },
  {
    address: 0x8befa0,
    expectedOpcodeHex: "320003e2",
    label: "runtime object request path requests one payload through generic helper x2",
  },
  {
    address: 0x8befa4,
    expectedOpcodeHex: "aa1f03e1",
    label: "runtime object request path passes no output payload list pointer as generic helper x1",
  },
  {
    address: 0x8befa8,
    expectedOpcodeHex: "aa1403e3",
    label: "runtime object request path forwards the resolved runtime owner/object as dispatch helper x3",
  },
  {
    address: 0x8befac,
    expectedOpcodeHex: "943f3ce3",
    label: "runtime object request path dispatches the resolved key through generic helper 0x188e338",
  },
  {
    address: 0x8befdc,
    expectedOpcodeHex: "b94e9902",
    label: "runtime object request path loads Level setup runtime index 0x2d44e98",
  },
  {
    address: 0x8befec,
    expectedOpcodeHex: "943f3d55",
    label: "runtime object request path queries the requested object through generic index query 0x188e540",
  },
  {
    address: 0x8beff0,
    expectedOpcodeHex: "f94003f3",
    label: "runtime object request path loads the matched object returned through the stack into x19",
  },
  {
    address: 0x8beff4,
    expectedOpcodeHex: "940ed73c",
    label: "runtime object request path resolves the global/object context before +0x140 attachment",
  },
  {
    address: 0x8beff8,
    expectedOpcodeHex: "f940a000",
    label: "runtime object request path loads context +0x140 list/container",
  },
  {
    address: 0x8bf000,
    expectedOpcodeHex: "940f92f4",
    label: "runtime object request path processes the matched object through context +0x140",
  },
  {
    address: 0x8bf004,
    expectedOpcodeHex: "940ed738",
    label: "runtime object request path resolves the global/object context before +0x148 attachment",
  },
  {
    address: 0x8bf008,
    expectedOpcodeHex: "f940a400",
    label: "runtime object request path loads context +0x148 list/container",
  },
  {
    address: 0x8bf010,
    expectedOpcodeHex: "940f92f0",
    label: "runtime object request path processes the matched object through context +0x148",
  },
  {
    address: 0xca3be4,
    expectedOpcodeHex: "f9400016",
    label: "resolved-key object list processor reads the first list entry from the context container",
  },
  {
    address: 0xca3bf4,
    expectedOpcodeHex: "b94012c8",
    label: "resolved-key object list processor reads the entry array/single-object selector at entry +0x10",
  },
  {
    address: 0xca3c04,
    expectedOpcodeHex: "97ff59ff",
    label: "resolved-key object list processor resolves an array/list object through 0xc7a400",
  },
  {
    address: 0xca3c20,
    expectedOpcodeHex: "f94002c1",
    label: "resolved-key object list processor loads the entry apply key from entry +0x0 for array elements",
  },
  {
    address: 0xca3c34,
    expectedOpcodeHex: "91004103",
    label: "resolved-key object list processor passes each array element payload +0x10 into entry apply",
  },
  {
    address: 0xca3c38,
    expectedOpcodeHex: "97fffe4b",
    label: "resolved-key object list processor applies each array element through 0xca3564",
  },
  {
    address: 0xca3c50,
    expectedOpcodeHex: "97ff59ab",
    label: "resolved-key object list processor resolves a single object through 0xc7a2fc",
  },
  {
    address: 0xca3c64,
    expectedOpcodeHex: "91004003",
    label: "resolved-key object list processor passes the single object payload +0x10 into entry apply",
  },
  {
    address: 0xca3c6c,
    expectedOpcodeHex: "97fffe3e",
    label: "resolved-key object list processor applies the single object through 0xca3564",
  },
  {
    address: 0xc7a35c,
    expectedOpcodeHex: "9400000a",
    label: "single-object lookup hashes the requested entry key and queries hash table 0xc7a384",
  },
  {
    address: 0xc7a384,
    expectedOpcodeHex: "b940280a",
    label: "single-object hash lookup reads bucket count from matched object +0x28",
  },
  {
    address: 0xc7a3e4,
    expectedOpcodeHex: "f9402409",
    label: "single-object hash lookup reads payload table from matched object +0x48",
  },
  {
    address: 0xc7a3f0,
    expectedOpcodeHex: "f9400100",
    label: "single-object hash lookup returns the matched payload pointer",
  },
  {
    address: 0xc7a460,
    expectedOpcodeHex: "9400000a",
    label: "array/list-object lookup hashes the requested entry key and queries hash table 0xc7a488",
  },
  {
    address: 0xc7a488,
    expectedOpcodeHex: "b940580a",
    label: "array/list-object hash lookup reads bucket count from matched object +0x58",
  },
  {
    address: 0xc7a4e8,
    expectedOpcodeHex: "f9403c09",
    label: "array/list-object hash lookup reads payload table from matched object +0x78",
  },
  {
    address: 0xc7a4ec,
    expectedOpcodeHex: "8b081120",
    label: "array/list-object hash lookup returns the matched array/list record",
  },
  {
    address: 0xca35b4,
    expectedOpcodeHex: "97ff3e02",
    label: "resolved-key entry apply obtains the resource-key table before resolving the entry apply key",
  },
  {
    address: 0xca35bc,
    expectedOpcodeHex: "97ff3e03",
    label: "resolved-key entry apply resolves the entry apply key through the resource-key table",
  },
  {
    address: 0xca35ec,
    expectedOpcodeHex: "b000f708",
    label: "resolved-key entry apply prepares registry index global slot 0x2b84a40",
  },
  {
    address: 0xca35f0,
    expectedOpcodeHex: "b94a4101",
    label: "resolved-key entry apply loads registry index from global slot 0x2b84a40",
  },
  {
    address: 0xca35f8,
    expectedOpcodeHex: "942fa0b0",
    label: "resolved-key entry apply resolves its registry object through 0x188b8b8",
  },
  {
    address: 0xca3604,
    expectedOpcodeHex: "f000f1eb",
    label: "resolved-key entry apply prepares default scale/time global slot 0x2ae2b90",
  },
  {
    address: 0xca3770,
    expectedOpcodeHex: "97ff3e1a",
    label: "resolved-key entry apply writes its generated transform/orientation payload through 0xc72fd8",
  },
  {
    address: 0xca3788,
    expectedOpcodeHex: "b945b101",
    label: "resolved-key entry apply loads secondary registry index from global slot 0x30af5b0",
  },
  {
    address: 0xca3790,
    expectedOpcodeHex: "942fa04a",
    label: "resolved-key entry apply resolves secondary registry object through 0x188b8b8",
  },
  {
    address: 0xca3798,
    expectedOpcodeHex: "97ff5ce4",
    label: "resolved-key entry apply attaches the resolved secondary object through 0xc7ab28",
  },
  {
    address: 0xca37ac,
    expectedOpcodeHex: "97fc5155",
    label: "resolved-key entry apply builds a scratch object/table through 0xbb7d00",
  },
  {
    address: 0xca397c,
    expectedOpcodeHex: "940001a0",
    label: "resolved-key entry apply inserts per-entry hashed data through 0xca3ffc",
  },
  {
    address: 0xa7c954,
    expectedOpcodeHex: "b900f001",
    label: "character lobby/state object stores incoming mode/state at object +0xf0",
  },
  {
    address: 0xa7c970,
    expectedOpcodeHex: "9106b000",
    label: "character lobby/state object prepares ui_character_lobby_entered sound path",
  },
  {
    address: 0xa7c980,
    expectedOpcodeHex: "97fc9ab2",
    label: "character lobby/state object plays the lobby-entered UI sound",
  },
  {
    address: 0xa7c9c8,
    expectedOpcodeHex: "940162b6",
    label: "character lobby mode switch creates state object A through 0xad54a0",
  },
  {
    address: 0xa7c9d0,
    expectedOpcodeHex: "f9007675",
    label: "character lobby mode switch stores state object A at owner +0xe8",
  },
  {
    address: 0xa7c9f4,
    expectedOpcodeHex: "94014276",
    label: "character lobby mode switch creates state object B through 0xacd3cc",
  },
  {
    address: 0xa7c9fc,
    expectedOpcodeHex: "f9007275",
    label: "character lobby mode switch stores state object B at owner +0xe0",
  },
  {
    address: 0xa7ca00,
    expectedOpcodeHex: "f94006a1",
    label: "character lobby mode switch forwards the created state object's render child pointer",
  },
  {
    address: 0xa7ca04,
    expectedOpcodeHex: "f9403d03",
    label: "character lobby mode switch loads owner vtable slot +0x78 for state-object attachment",
  },
  {
    address: 0xa7ca1c,
    expectedOpcodeHex: "d61f0060",
    label: "character lobby mode switch branches through owner vtable slot +0x78",
  },
  {
    address: 0xa7cb0c,
    expectedOpcodeHex: "d1036000",
    label: "character lobby key-switch thunk adjusts the subobject pointer by -0xd8 before callback dispatch",
  },
  {
    address: 0xa7cb10,
    expectedOpcodeHex: "17ffffc8",
    label: "character lobby key-switch thunk tail-branches to callback 0xa7ca30",
  },
  {
    address: 0xa7ca54,
    expectedOpcodeHex: "91001021",
    label: "character lobby key-switch callback selects record +0x4 as the resource-key string",
  },
  {
    address: 0xa7ca60,
    expectedOpcodeHex: "97f5ffc7",
    label: "character lobby key-switch callback copies the selected record string",
  },
  {
    address: 0xa7ca68,
    expectedOpcodeHex: "9405bd45",
    label: "character lobby key-switch callback writes the record string into the global runtime resource-key slot",
  },
  {
    address: 0xa7cac0,
    expectedOpcodeHex: "9405bd25",
    label: "character lobby key-switch callback reads the cached resolved runtime key before status checking it",
  },
  {
    address: 0xa7cac4,
    expectedOpcodeHex: "9405bdd1",
    label: "character lobby key-switch callback checks the cached resolved runtime key through 0xbec208",
  },
  {
    address: 0xa7ca84,
    expectedOpcodeHex: "b9400288",
    label: "character lobby key-switch callback reads the selected record mode/state",
  },
  {
    address: 0xa7ca88,
    expectedOpcodeHex: "7100111f",
    label: "character lobby key-switch callback bounds the selected record mode/state to enum range 0..4",
  },
  {
    address: 0xa7ca90,
    expectedOpcodeHex: "f00081e9",
    label: "character lobby key-switch callback prepares the local mode jump table page",
  },
  {
    address: 0xa7ca98,
    expectedOpcodeHex: "b8a87928",
    label: "character lobby key-switch callback indexes the local mode jump table by record mode/state",
  },
  {
    address: 0xa7caa0,
    expectedOpcodeHex: "d61f0100",
    label: "character lobby key-switch callback branches through the local mode jump table",
  },
  {
    address: 0xa7caa4,
    expectedOpcodeHex: "320007e1",
    label: "character lobby key-switch callback maps one record mode to lobby state 3",
  },
  {
    address: 0xa7caac,
    expectedOpcodeHex: "321f03e1",
    label: "character lobby key-switch callback maps one record mode to lobby state 2",
  },
  {
    address: 0xa7cab4,
    expectedOpcodeHex: "aa1303e0",
    label: "character lobby key-switch callback maps one record mode to lobby state 0",
  },
  {
    address: 0xa7cae0,
    expectedOpcodeHex: "97ffff95",
    label: "character lobby key-switch callback applies the selected mode/state through 0xa7c934",
  },
  {
    address: 0xad54d4,
    expectedOpcodeHex: "f9000009",
    label: "character lobby state object A constructor stores its primary vtable",
  },
  {
    address: 0xad55c0,
    expectedOpcodeHex: "94000796",
    label: "character lobby state object A registers its first payload callback list",
  },
  {
    address: 0xad55e0,
    expectedOpcodeHex: "940007d6",
    label: "character lobby state object A registers its second payload callback list",
  },
  {
    address: 0xad5600,
    expectedOpcodeHex: "94000816",
    label: "character lobby state object A registers its third payload callback list",
  },
  {
    address: 0xad5620,
    expectedOpcodeHex: "97f8445d",
    label: "character lobby state object A registers its fourth payload callback list",
  },
  {
    address: 0xad56f0,
    expectedOpcodeHex: "94045a19",
    label: "character lobby state object A constructor reads the cached runtime key",
  },
  {
    address: 0xad5754,
    expectedOpcodeHex: "97f65753",
    label: "character lobby state object A registers an event callback on its child object",
  },
  {
    address: 0xad5788,
    expectedOpcodeHex: "97f65746",
    label: "character lobby state object A registers a second event callback on its child object",
  },
  {
    address: 0xad5af4,
    expectedOpcodeHex: "94045918",
    label: "character lobby state object A payload apply reads the cached runtime key",
  },
  {
    address: 0xad5e60,
    expectedOpcodeHex: "9404583d",
    label: "character lobby state object A visual-list rebuild reads the cached runtime key",
  },
  {
    address: 0xad5e6c,
    expectedOpcodeHex: "940458e7",
    label: "character lobby state object A visual-list rebuild status-checks the runtime key",
  },
  {
    address: 0xad5fc8,
    expectedOpcodeHex: "d10203ff",
    label: "character lobby state object A update function prologue",
  },
  {
    address: 0xacd400,
    expectedOpcodeHex: "f9000009",
    label: "character lobby state object B constructor stores its primary vtable",
  },
  {
    address: 0xacd568,
    expectedOpcodeHex: "9400007f",
    label: "character lobby state object B constructor initializes its refresh path",
  },
  {
    address: 0xacd588,
    expectedOpcodeHex: "94000d1e",
    label: "character lobby state object B registers its first payload callback list",
  },
  {
    address: 0xacd5a8,
    expectedOpcodeHex: "97f8647b",
    label: "character lobby state object B registers its second payload callback list",
  },
  {
    address: 0xacd664,
    expectedOpcodeHex: "94047a3c",
    label: "character lobby state object B constructor reads the cached runtime key",
  },
  {
    address: 0xacd6c4,
    expectedOpcodeHex: "97f67777",
    label: "character lobby state object B registers an event callback on its child object",
  },
  {
    address: 0xacd6f8,
    expectedOpcodeHex: "97f6776a",
    label: "character lobby state object B registers a second event callback on its child object",
  },
  {
    address: 0xacd834,
    expectedOpcodeHex: "940479c8",
    label: "character lobby state object B destructor/update guard reads the cached runtime key",
  },
  {
    address: 0xacea84,
    expectedOpcodeHex: "94047534",
    label: "character lobby state object B visual-list update reads the cached runtime key",
  },
  {
    address: 0xacea90,
    expectedOpcodeHex: "940475de",
    label: "character lobby state object B visual-list update status-checks the runtime key",
  },
  {
    address: 0xc045b4,
    expectedOpcodeHex: "f000d88a",
    label: "object builder B constructor prepares vtable object pointer page 0x2717420",
  },
  {
    address: 0xc045c8,
    expectedOpcodeHex: "9100414a",
    label: "object builder B constructor completes vtable object pointer 0x2717420",
  },
  {
    address: 0xc04628,
    expectedOpcodeHex: "f900000a",
    label: "object builder B constructor stores vtable object pointer at object +0x0",
  },
  {
    address: 0xc04638,
    expectedOpcodeHex: "29038801",
    label: "object builder B constructor stores resource key and related ids at object +0x1c",
  },
  {
    address: 0xc0463c,
    expectedOpcodeHex: "b9002403",
    label: "object builder B constructor stores the object-build type/state field at object +0x24",
  },
  {
    address: 0xc04b88,
    expectedOpcodeHex: "9401b888",
    label: "object builder B resolves a resource key from input +0x1c",
  },
  {
    address: 0xc04b8c,
    expectedOpcodeHex: "910063e1",
    label: "object builder B passes stack output pointer as generic helper x1",
  },
  {
    address: 0xc04b90,
    expectedOpcodeHex: "320003e2",
    label: "object builder B requests one payload through generic helper x2",
  },
  {
    address: 0xc04b94,
    expectedOpcodeHex: "aa1f03e3",
    label: "object builder B passes null context as generic helper x3",
  },
  {
    address: 0xc04b98,
    expectedOpcodeHex: "943225e8",
    label: "object builder B requests one object through the generic callback dispatch helper",
  },
  {
    address: 0xc04c0c,
    expectedOpcodeHex: "b94e9902",
    label: "object builder B loads the Level setup runtime index global 0x2d44e98",
  },
  {
    address: 0xc04c20,
    expectedOpcodeHex: "94322648",
    label: "object builder B queries objects by the Level setup runtime index through 0x188e540",
  },
  {
    address: 0x812fd8,
    expectedOpcodeHex: "b000f568",
    label: "typed-object frame source constructor prepares vtable page 0x26bf000",
  },
  {
    address: 0x812fdc,
    expectedOpcodeHex: "910c6108",
    label: "typed-object frame source constructor prepares vtable base 0x26bf318",
  },
  {
    address: 0x812fe0,
    expectedOpcodeHex: "91004108",
    label: "typed-object frame source constructor advances to addresspoint 0x26bf328",
  },
  {
    address: 0x812fe4,
    expectedOpcodeHex: "f8008408",
    label: "typed-object frame source constructor stores vtable addresspoint then advances object past vptr",
  },
  {
    address: 0x812fe8,
    expectedOpcodeHex: "528500a2",
    label: "typed-object frame source constructor prepares 0x2805 byte tail clear",
  },
  {
    address: 0x812ff0,
    expectedOpcodeHex: "97fe0888",
    label: "typed-object frame source constructor clears the frame source tail object through memset",
  },
  {
    address: 0x813028,
    expectedOpcodeHex: "3829681f",
    label: "typed-object frame source clear-pending callback clears byte at object +0x280c",
  },
  {
    address: 0x813054,
    expectedOpcodeHex: "9400609d",
    label: "typed-object frame source clear-pending callback forwards decoded string/state through 0x82b2c8",
  },
  {
    address: 0x81309c,
    expectedOpcodeHex: "3828681f",
    label: "typed-object frame source reset-like callback clears byte at object +0x280c",
  },
  {
    address: 0x8130a0,
    expectedOpcodeHex: "94001eeb",
    label: "typed-object frame source reset-like callback calls stream/reset helper 0x81ac4c",
  },
  {
    address: 0x8130b0,
    expectedOpcodeHex: "f81a0ffb",
    label: "stream-frame typed-object source function prologue",
  },
  {
    address: 0x8130ec,
    expectedOpcodeHex: "b9a80808",
    label: "stream-frame typed-object source reads buffered byte count at object +0x2808",
  },
  {
    address: 0x8130f0,
    expectedOpcodeHex: "52850009",
    label: "stream-frame typed-object source prepares 0x2800 byte buffer capacity",
  },
  {
    address: 0x813108,
    expectedOpcodeHex: "9415b830",
    label: "stream-frame typed-object source reads incoming bytes into its frame buffer",
  },
  {
    address: 0x813184,
    expectedOpcodeHex: "79401268",
    label: "stream-frame caller reads the incoming typed-object frame length before dispatcher invocation",
  },
  {
    address: 0x81318c,
    expectedOpcodeHex: "5ac00908",
    label: "stream-frame typed-object source byte-swaps the two-byte frame length",
  },
  {
    address: 0x813190,
    expectedOpcodeHex: "53107d17",
    label: "stream-frame typed-object source normalizes the frame length into w23",
  },
  {
    address: 0x813194,
    expectedOpcodeHex: "11000afb",
    label: "stream-frame typed-object source adds the two-byte frame header to the payload length",
  },
  {
    address: 0x8131fc,
    expectedOpcodeHex: "94006a82",
    label: "stream-frame caller invokes typed object dispatcher 0x82dc04",
  },
  {
    address: 0x81321c,
    expectedOpcodeHex: "97fdf5b1",
    label: "stream-frame typed-object source compacts remaining buffered bytes after dispatch",
  },
  {
    address: 0x81322c,
    expectedOpcodeHex: "b9280a68",
    label: "stream-frame typed-object source stores the updated buffered byte count",
  },
  {
    address: 0x8440e8,
    expectedOpcodeHex: "9000f3e8",
    label: "typed-object timed source constructor prepares vtable page 0x26c0000",
  },
  {
    address: 0x8440ec,
    expectedOpcodeHex: "912b0108",
    label: "typed-object timed source constructor prepares vtable base 0x26c0ac0",
  },
  {
    address: 0x8440f0,
    expectedOpcodeHex: "91004108",
    label: "typed-object timed source constructor advances to addresspoint 0x26c0ad0",
  },
  {
    address: 0x8440f8,
    expectedOpcodeHex: "f8008408",
    label: "typed-object timed source constructor stores vtable addresspoint then advances object past vptr",
  },
  {
    address: 0x844100,
    expectedOpcodeHex: "f9036a7f",
    label: "typed-object timed source constructor clears child frame source pointer at object +0x6d0",
  },
  {
    address: 0x844110,
    expectedOpcodeHex: "f81e0ff3",
    label: "typed-object timed source delete/dtor path with same current vtable family",
  },
  {
    address: 0x84412c,
    expectedOpcodeHex: "f8008668",
    label: "typed-object timed source delete/dtor path stores addresspoint 0x26c0ad0",
  },
  {
    address: 0x844144,
    expectedOpcodeHex: "a9be4ff4",
    label: "typed-object timed source destructor path with same current vtable family",
  },
  {
    address: 0x844164,
    expectedOpcodeHex: "f8008688",
    label: "typed-object timed source destructor path stores addresspoint 0x26c0ad0",
  },
  {
    address: 0x844194,
    expectedOpcodeHex: "52850200",
    label: "typed-object timed source child initializer allocates 0x2810 byte frame source object",
  },
  {
    address: 0x8441a0,
    expectedOpcodeHex: "97ff3b8c",
    label: "typed-object timed source child initializer calls frame source constructor 0x812fd0",
  },
  {
    address: 0x8441ac,
    expectedOpcodeHex: "f9036a74",
    label: "typed-object timed source child initializer stores frame source child at object +0x6d0",
  },
  {
    address: 0x8441cc,
    expectedOpcodeHex: "f9400008",
    label: "typed-object timed source child cleanup loads child frame source vtable",
  },
  {
    address: 0x8441d0,
    expectedOpcodeHex: "f9400508",
    label: "typed-object timed source child cleanup loads child vtable slot +0x8",
  },
  {
    address: 0x844420,
    expectedOpcodeHex: "9000f3e8",
    label: "alternate replay source constructor prepares vtable page 0x26c0000",
  },
  {
    address: 0x844424,
    expectedOpcodeHex: "912d6108",
    label: "alternate replay source constructor prepares vtable base 0x26c0b58",
  },
  {
    address: 0x84442c,
    expectedOpcodeHex: "91004108",
    label: "alternate replay source constructor advances to addresspoint 0x26c0b68",
  },
  {
    address: 0x844438,
    expectedOpcodeHex: "f9000008",
    label: "alternate replay source constructor stores vtable addresspoint 0x26c0b68",
  },
  {
    address: 0x844440,
    expectedOpcodeHex: "17ff8813",
    label: "alternate replay source constructor tail-enters replay/input setup 0x82648c",
  },
  {
    address: 0x8444e4,
    expectedOpcodeHex: "d10103ff",
    label: "timed-queue typed-object source function prologue",
  },
  {
    address: 0x844508,
    expectedOpcodeHex: "b9400808",
    label: "timed-queue typed-object source reads its playback/queue state at object +0x8",
  },
  {
    address: 0x844524,
    expectedOpcodeHex: "944128b2",
    label: "timed-queue typed-object source samples elapsed time before reading records",
  },
  {
    address: 0x84453c,
    expectedOpcodeHex: "91006674",
    label: "timed-queue typed-object source prepares the payload buffer at object +0x19",
  },
  {
    address: 0x84454c,
    expectedOpcodeHex: "91207261",
    label: "timed-queue typed-object source prepares the decoded length field at object +0x81c",
  },
  {
    address: 0x84455c,
    expectedOpcodeHex: "97ff8501",
    label: "timed-queue typed-object source reads a .vgr record through 0x825960",
  },
  {
    address: 0x844580,
    expectedOpcodeHex: "b9481e61",
    label: "timed-queue caller reads the queued typed-object size/index before dispatcher invocation",
  },
  {
    address: 0x844588,
    expectedOpcodeHex: "97ffa59f",
    label: "timed-queue caller invokes typed object dispatcher 0x82dc04",
  },
  {
    address: 0x844594,
    expectedOpcodeHex: "39006269",
    label: "timed-queue typed-object source marks a queued record as consumed/pending after dispatch",
  },
  {
    address: 0x844624,
    expectedOpcodeHex: "f81e0ff3",
    label: "typed-object replay source selector prologue",
  },
  {
    address: 0x844638,
    expectedOpcodeHex: "d00119e0",
    label: "typed-object replay source selector prepares global source-control page 0x2b82000",
  },
  {
    address: 0x844644,
    expectedOpcodeHex: "7100067f",
    label: "typed-object replay source selector compares mode against alternate replay source",
  },
  {
    address: 0x844650,
    expectedOpcodeHex: "5280db00",
    label: "typed-object replay source selector mode 0 allocates 0x6d8 timed source object",
  },
  {
    address: 0x844658,
    expectedOpcodeHex: "9000f3e8",
    label: "typed-object replay source selector mode 0 prepares timed source vtable page",
  },
  {
    address: 0x844668,
    expectedOpcodeHex: "f8008408",
    label: "typed-object replay source selector mode 0 stores timed source vtable addresspoint",
  },
  {
    address: 0x844670,
    expectedOpcodeHex: "f9036a7f",
    label: "typed-object replay source selector mode 0 clears timed source child pointer at +0x6d0",
  },
  {
    address: 0x844674,
    expectedOpcodeHex: "97ff8a1a",
    label: "typed-object replay source selector mode 0 initializes timed source input state through 0x826edc",
  },
  {
    address: 0x84467c,
    expectedOpcodeHex: "52810400",
    label: "typed-object replay source selector mode 1 allocates 0x820 alternate replay source object",
  },
  {
    address: 0x844684,
    expectedOpcodeHex: "9000f3e8",
    label: "typed-object replay source selector mode 1 prepares alternate replay source vtable page",
  },
  {
    address: 0x8446a0,
    expectedOpcodeHex: "f9000008",
    label: "typed-object replay source selector mode 1 stores alternate replay source vtable addresspoint",
  },
  {
    address: 0x8446a8,
    expectedOpcodeHex: "97ff8779",
    label: "typed-object replay source selector mode 1 enters replay/input setup 0x82648c",
  },
  {
    address: 0x8446b0,
    expectedOpcodeHex: "f9022913",
    label: "typed-object replay source selector stores selected source at global slot 0x2b82450",
  },
  {
    address: 0x8446bc,
    expectedOpcodeHex: "f9422913",
    label: "typed-object replay source selector reloads selected source from global slot 0x2b82450",
  },
  {
    address: 0x8446d0,
    expectedOpcodeHex: "f9400901",
    label: "typed-object replay source selector dispatches selected source vtable slot +0x10",
  },
  {
    address: 0x81b118,
    expectedOpcodeHex: "9400a59e",
    label: "typed-object replay source runtime switch caller flushes current source slot +0x38 before mode switch",
  },
  {
    address: 0x81b120,
    expectedOpcodeHex: "320003e0",
    label: "typed-object replay source runtime switch caller prepares selector mode 1",
  },
  {
    address: 0x81b130,
    expectedOpcodeHex: "9400a598",
    label: "typed-object replay source runtime switch caller flushes current source slot +0x38 before mode 0 switch",
  },
  {
    address: 0x81b138,
    expectedOpcodeHex: "2a1f03e0",
    label: "typed-object replay source runtime switch caller prepares selector mode 0",
  },
  {
    address: 0x81b13c,
    expectedOpcodeHex: "9400a53a",
    label: "typed-object replay source runtime switch caller invokes selector 0x844624",
  },
  {
    address: 0x81bd54,
    expectedOpcodeHex: "2a1f03e0",
    label: "typed-object replay source startup/init caller prepares selector mode 0",
  },
  {
    address: 0x81bd58,
    expectedOpcodeHex: "9400a233",
    label: "typed-object replay source startup/init caller invokes selector 0x844624",
  },
  {
    address: 0x8225f0,
    expectedOpcodeHex: "528e2900",
    label: "typed-object replay source startup allocator prepares 0x7148-byte owner allocation",
  },
  {
    address: 0x822620,
    expectedOpcodeHex: "17ffe5bb",
    label: "typed-object replay source startup allocator tail-enters startup/init caller 0x81bd0c",
  },
  {
    address: 0x81bf54,
    expectedOpcodeHex: "2a1f03e0",
    label: "typed-object replay source mode-zero thunk prepares selector mode 0",
  },
  {
    address: 0x81bf58,
    expectedOpcodeHex: "1400a1b3",
    label: "typed-object replay source mode-zero thunk tail-enters selector 0x844624",
  },
  {
    address: 0x844790,
    expectedOpcodeHex: "d00119e8",
    label: "typed-object replay source slot +0x38 forwarder prepares global source slot",
  },
  {
    address: 0x84479c,
    expectedOpcodeHex: "f9401d01",
    label: "typed-object replay source slot +0x38 forwarder loads current source vtable slot +0x38",
  },
  {
    address: 0x82648c,
    expectedOpcodeHex: "f81c0ffc",
    label: "alternate replay input setup prologue",
  },
  {
    address: 0x826554,
    expectedOpcodeHex: "94419f79",
    label: "alternate replay input setup dispatches the definition manifest through generic helper",
  },
  {
    address: 0x826580,
    expectedOpcodeHex: "97fffcf8",
    label: "alternate replay input setup reads first .vgr record through 0x825960",
  },
  {
    address: 0x826590,
    expectedOpcodeHex: "94000035",
    label: "alternate replay input setup appends record metadata through 0x826664",
  },
  {
    address: 0x8265a0,
    expectedOpcodeHex: "94000053",
    label: "alternate replay input setup decodes queued typed-object-like record through 0x8266ec",
  },
  {
    address: 0x826608,
    expectedOpcodeHex: "97fffcd6",
    label: "alternate replay input setup reads replay trailer/secondary stream through 0x825960",
  },
  {
    address: 0x82662c,
    expectedOpcodeHex: "97fffccd",
    label: "alternate replay input setup reads replay integer stream through 0x825960",
  },
  {
    address: 0x825fd0,
    expectedOpcodeHex: "900118e8",
    label: "typed-object upstream path prepares the .vgr path builder string page",
  },
  {
    address: 0x825ff4,
    expectedOpcodeHex: "91154421",
    label: "typed-object upstream path completes the %s/%s.%d.vgr format string address",
  },
  {
    address: 0x826000,
    expectedOpcodeHex: "94151ec5",
    label: "typed-object upstream path formats a .vgr stream path before opening it",
  },
  {
    address: 0x825ab4,
    expectedOpcodeHex: "90009621",
    label: "typed-object file-open path prepares the binary read mode string page",
  },
  {
    address: 0x825ac0,
    expectedOpcodeHex: "91358821",
    label: "typed-object file-open path completes the rb file mode string address",
  },
  {
    address: 0x825ac4,
    expectedOpcodeHex: "941521a4",
    label: "typed-object file-open path calls the fopen wrapper with rb mode",
  },
  {
    address: 0xd6e154,
    expectedOpcodeHex: "17e8a397",
    label: "typed-object fopen wrapper tail-branches to fopen@plt",
  },
  {
    address: 0x82599c,
    expectedOpcodeHex: "aa1503e0",
    label: "typed-object stream reader prepares the file handle before fread wrapper call",
  },
  {
    address: 0x8259a0,
    expectedOpcodeHex: "941521ef",
    label: "typed-object stream reader calls the fread wrapper",
  },
  {
    address: 0xd6e16c,
    expectedOpcodeHex: "97e89405",
    label: "typed-object fread wrapper calls fread@plt",
  },
  {
    address: 0x8259ec,
    expectedOpcodeHex: "5ac00908",
    label: "typed-object stream reader byte-swaps a read word from the binary stream",
  },
  {
    address: 0x825a18,
    expectedOpcodeHex: "941521d1",
    label: "typed-object stream reader performs a later fread wrapper call for stream payload data",
  },
  {
    address: 0x188ebb8,
    expectedOpcodeHex: "b9400428",
    label: "generic callback dispatch loads the dispatch key from descriptor +0x4",
  },
  {
    address: 0x188ebbc,
    expectedOpcodeHex: "f8408eca",
    label: "generic callback dispatch loads the callback tree root from registry +0x8",
  },
  {
    address: 0x188ec54,
    expectedOpcodeHex: "f9400282",
    label: "generic callback dispatch fallback loads the first payload entry from the payload list",
  },
  {
    address: 0x188ec5c,
    expectedOpcodeHex: "f9401516",
    label: "generic callback dispatch fallback loads the matched callback function pointer from node +0x28",
  },
  {
    address: 0x188ec64,
    expectedOpcodeHex: "aa1303e0",
    label: "generic callback dispatch fallback forwards the registry/root object as x0",
  },
  {
    address: 0x188ec68,
    expectedOpcodeHex: "aa1503e1",
    label: "generic callback dispatch fallback forwards the matched descriptor as x1",
  },
  {
    address: 0x188ec6c,
    expectedOpcodeHex: "d63f02c0",
    label: "generic callback dispatch fallback invokes the loaded callback function pointer",
  },
  {
    address: 0x188ec88,
    expectedOpcodeHex: "f9401523",
    label: "generic callback dispatch exact-match path loads the callback function pointer from node +0x28",
  },
  {
    address: 0x188ec90,
    expectedOpcodeHex: "aa1403e2",
    label: "generic callback dispatch exact-match path forwards the original payload pointer as x2",
  },
  {
    address: 0x188eca0,
    expectedOpcodeHex: "d61f0060",
    label: "generic callback dispatch exact-match path branches to the loaded callback function pointer",
  },
  {
    address: 0x8cbfc4,
    expectedOpcodeHex: "f00110b8",
    label: "Level runtime visuals loader prepares LevelVisuals secondary callback descriptor global slot page 0x2ae29a8",
  },
  {
    address: 0x8cbfc8,
    expectedOpcodeHex: "f944d718",
    label: "Level runtime visuals loader loads LevelVisuals secondary callback descriptor slot 0x2ae29a8",
  },
  {
    address: 0x8cc030,
    expectedOpcodeHex: "943f0906",
    label: "Level runtime visuals loader loads the global callback registry through helper 0x188e448",
  },
  {
    address: 0x8cc034,
    expectedOpcodeHex: "f9400301",
    label: "Level runtime visuals loader passes descriptor [0x2ae29a8] as generic callback dispatch x1",
  },
  {
    address: 0x8cc038,
    expectedOpcodeHex: "f9402682",
    label: "Level runtime visuals loader passes LevelVisuals +0x48 LightPlacement payload as dispatch x2",
  },
  {
    address: 0x8cc03c,
    expectedOpcodeHex: "943f0ada",
    label: "Level runtime visuals loader dispatches LevelVisuals +0x48 through the generic callback dispatcher",
  },
  {
    address: 0x188e3ec,
    expectedOpcodeHex: "940001ee",
    label: "global runtime dispatch helper invokes the generic callback dispatcher after resolving a descriptor/payload pair",
  },
  {
    address: 0xc79ae4,
    expectedOpcodeHex: "aa0203f4",
    label: "Level setup caller preserves its x2 argument as the active Level object",
  },
  {
    address: 0xc79af4,
    expectedOpcodeHex: "b94e9900",
    label: "Level setup registered callback loads its setup record index from global slot 0x2d44e98",
  },
  {
    address: 0xc79afc,
    expectedOpcodeHex: "943051ec",
    label: "Level setup registered callback resolves the setup owner through the generic registry lookup",
  },
  {
    address: 0xc79b00,
    expectedOpcodeHex: "f9014814",
    label: "Level setup caller stores the active Level object at setup owner +0x290",
  },
  {
    address: 0xc79b04,
    expectedOpcodeHex: "d000f368",
    label: "Level setup registered callback prepares secondary descriptor global slot 0x2ae7ed8",
  },
  {
    address: 0xc79b08,
    expectedOpcodeHex: "f9476d08",
    label: "Level setup registered callback loads secondary descriptor global slot 0x2ae7ed8",
  },
  {
    address: 0xc79b0c,
    expectedOpcodeHex: "f940ae82",
    label: "Level setup caller reads active Level +0x158 before runtime owner dispatch",
  },
  {
    address: 0xc79b18,
    expectedOpcodeHex: "f9400101",
    label: "Level setup registered callback passes descriptor [0x2ae7ed8] as generic callback dispatch x1",
  },
  {
    address: 0xc79b1c,
    expectedOpcodeHex: "94305422",
    label: "Level setup registered callback dispatches active Level +0x158 through the generic callback dispatcher",
  },
  {
    address: 0xc79b20,
    expectedOpcodeHex: "aa1303e0",
    label: "Level setup caller passes setup owner as x0 into Level runtime owner dispatch",
  },
  {
    address: 0xc79b24,
    expectedOpcodeHex: "aa1403e1",
    label: "Level setup caller passes the active Level object as x1 into Level runtime owner dispatch",
  },
  {
    address: 0xc79b28,
    expectedOpcodeHex: "97f148ab",
    label: "Level setup caller invokes the Level runtime owner dispatch",
  },
  {
    address: 0xc79b2c,
    expectedOpcodeHex: "f9014e60",
    label: "Level setup caller stores the returned runtime owner/subobject pointer at setup owner +0x298",
  },
  {
    address: 0xc79b30,
    expectedOpcodeHex: "f9409e81",
    label: "Level setup caller reads active Level +0x138 and routes it through the setup field mapper",
  },
  {
    address: 0xc79b40,
    expectedOpcodeHex: "f940aa81",
    label: "Level setup caller reads active Level +0x150 and routes it through the setup field mapper",
  },
  {
    address: 0xc79b50,
    expectedOpcodeHex: "f940a681",
    label: "Level setup caller reads active Level +0x148 and routes it through the setup field mapper",
  },
  {
    address: 0xc79b60,
    expectedOpcodeHex: "f940a281",
    label: "Level setup caller reads active Level +0x140 and routes it through the setup field mapper",
  },
  {
    address: 0xc79b70,
    expectedOpcodeHex: "f940b288",
    label: "Level setup caller reads active Level +0x160 list before dispatching primary per-entry handlers",
  },
  {
    address: 0xc79b84,
    expectedOpcodeHex: "b941e6c1",
    label: "Level setup caller loads the primary per-entry handler registry index from 0x30561e4",
  },
  {
    address: 0xc79b8c,
    expectedOpcodeHex: "9430474b",
    label: "Level setup caller resolves the primary per-entry handler owner through the generic registry lookup",
  },
  {
    address: 0xc79b94,
    expectedOpcodeHex: "94001308",
    label: "Level setup caller invokes primary per-entry handler 0xc7e7b4 for Level +0x160 entries",
  },
  {
    address: 0xc79ba8,
    expectedOpcodeHex: "f940ca88",
    label: "Level setup caller conditionally reads active Level +0x190 list before dispatching secondary handlers",
  },
  {
    address: 0xc79bbc,
    expectedOpcodeHex: "b94a62a1",
    label: "Level setup caller loads the conditional per-entry handler registry index from 0x30afa60",
  },
  {
    address: 0xc79bc4,
    expectedOpcodeHex: "9430473d",
    label: "Level setup caller resolves the conditional per-entry handler owner through the generic registry lookup",
  },
  {
    address: 0xc79bcc,
    expectedOpcodeHex: "97ffb61e",
    label: "Level setup caller invokes conditional per-entry handler 0xc67444 for Level +0x190 entries",
  },
  {
    address: 0xc79bdc,
    expectedOpcodeHex: "9400004d",
    label: "Level setup caller enters the post-setup finalizer at 0xc79d10",
  },
  {
    address: 0x8cbf6c,
    expectedOpcodeHex: "f9001801",
    label: "visuals loader stores active Level argument x1 at owner +0x30",
  },
  {
    address: 0x8cbf80,
    expectedOpcodeHex: "f940b834",
    label: "visuals loader reads active Level +0x170 lookup state",
  },
  {
    address: 0x8cbfb8,
    expectedOpcodeHex: "f9400a68",
    label: "visuals loader reads active Level +0x10 LevelVisuals reference list",
  },
  {
    address: 0x8cc02c,
    expectedOpcodeHex: "94000094",
    label: "visuals loader calls LevelVisuals apply processor",
  },
  {
    address: 0x8cc2b4,
    expectedOpcodeHex: "f9400428",
    label: "LevelVisuals apply processor reads LevelVisuals +0x8 source-table/selector list",
  },
  {
    address: 0x8cc2cc,
    expectedOpcodeHex: "940001e6",
    label: "LevelVisuals apply processor routes +0x8 entries through source-table/selector helper 0x8cca64",
  },
  {
    address: 0x8cc2d8,
    expectedOpcodeHex: "f9401268",
    label: "LevelVisuals apply processor reads LevelVisuals +0x20 transform/shape list",
  },
  {
    address: 0x8cc2ec,
    expectedOpcodeHex: "9400028a",
    label: "LevelVisuals apply processor routes +0x20 entries through transform/shape helper 0x8ccd14",
  },
  {
    address: 0x8cc2f8,
    expectedOpcodeHex: "97fd92c2",
    label: "LevelVisuals apply processor calls runtime predicate 0x830e00 before choosing conditional/fallback lists",
  },
  {
    address: 0x8cc300,
    expectedOpcodeHex: "f9400e68",
    label: "LevelVisuals apply processor reads conditional LevelVisuals +0x18 source-table/selector list",
  },
  {
    address: 0x8cc318,
    expectedOpcodeHex: "940001d3",
    label: "LevelVisuals apply processor routes conditional +0x18 entries through source-table/selector helper 0x8cca64",
  },
  {
    address: 0x8cc324,
    expectedOpcodeHex: "f9401a68",
    label: "LevelVisuals apply processor reads conditional LevelVisuals +0x30 transform/shape list",
  },
  {
    address: 0x8cc338,
    expectedOpcodeHex: "94000277",
    label: "LevelVisuals apply processor routes conditional +0x30 entries through transform/shape helper 0x8ccd14",
  },
  {
    address: 0x8cc348,
    expectedOpcodeHex: "f9400a68",
    label: "LevelVisuals apply processor reads fallback LevelVisuals +0x10 source-table/selector list",
  },
  {
    address: 0x8cc360,
    expectedOpcodeHex: "940001c1",
    label: "LevelVisuals apply processor routes fallback +0x10 entries through source-table/selector helper 0x8cca64",
  },
  {
    address: 0x8cc36c,
    expectedOpcodeHex: "f9401668",
    label: "LevelVisuals apply processor reads fallback LevelVisuals +0x28 transform/shape list",
  },
  {
    address: 0x8cc380,
    expectedOpcodeHex: "94000265",
    label: "LevelVisuals apply processor routes fallback +0x28 entries through transform/shape helper 0x8ccd14",
  },
  {
    address: 0x8cc38c,
    expectedOpcodeHex: "f9401e68",
    label: "LevelVisuals apply processor reads LevelVisuals +0x38 auxiliary list",
  },
  {
    address: 0x8cc3a0,
    expectedOpcodeHex: "b940bb01",
    label: "LevelVisuals apply processor loads auxiliary +0x38 owner/index from global 0x30350b8",
  },
  {
    address: 0x8cc3b4,
    expectedOpcodeHex: "94003dc5",
    label: "LevelVisuals apply processor routes +0x38 entries through helper 0x8dbac8",
  },
  {
    address: 0x8cc3c0,
    expectedOpcodeHex: "f9402268",
    label: "LevelVisuals apply processor reads LevelVisuals +0x40 auxiliary list",
  },
  {
    address: 0x8cc3d4,
    expectedOpcodeHex: "b94d32c1",
    label: "LevelVisuals apply processor loads auxiliary +0x40 owner/index from global 0x3034d30",
  },
  {
    address: 0x8cc3e8,
    expectedOpcodeHex: "9400400a",
    label: "LevelVisuals apply processor routes +0x40 entries through helper 0x8dc410",
  },
  {
    address: 0x8cc3f4,
    expectedOpcodeHex: "f9402e78",
    label: "LevelVisuals apply processor reads LevelVisuals +0x58 static lens-flare list",
  },
  {
    address: 0x8cc414,
    expectedOpcodeHex: "b9409b21",
    label: "LevelVisuals apply processor loads static lens-flare object/index from global 0x3035098",
  },
  {
    address: 0x8cc424,
    expectedOpcodeHex: "940e9a66",
    label: "LevelVisuals apply processor calls resource-key table accessor 0xc72dbc for static lens-flare resources",
  },
  {
    address: 0x8cc42c,
    expectedOpcodeHex: "940e9a67",
    label: "LevelVisuals apply processor calls resource-key string resolver 0xc72dc8 for static lens-flare resources",
  },
  {
    address: 0x8cc484,
    expectedOpcodeHex: "97fffb21",
    label: "LevelVisuals apply processor routes static lens-flare entries through helper 0x8cb108",
  },
  {
    address: 0x8cc4e4,
    expectedOpcodeHex: "97fffb27",
    label: "LevelVisuals apply processor routes static lens-flare entries through helper 0x8cb180",
  },
  {
    address: 0x8cc4f8,
    expectedOpcodeHex: "f9402a60",
    label: "LevelVisuals apply processor reads LevelVisuals +0x50 profile/probe payload",
  },
  {
    address: 0x8cc4fc,
    expectedOpcodeHex: "94128479",
    label: "LevelVisuals apply processor validates LevelVisuals +0x50 profile/probe payload through 0xd6d6e0",
  },
  {
    address: 0x8cc514,
    expectedOpcodeHex: "94155f9d",
    label: "LevelVisuals apply processor prepares profile/probe temporary state through 0xe24388",
  },
  {
    address: 0x8cc534,
    expectedOpcodeHex: "94155fd6",
    label: "LevelVisuals apply processor prepares profile/probe temporary state through 0xe2448c",
  },
  {
    address: 0x8cc550,
    expectedOpcodeHex: "94155fc9",
    label: "LevelVisuals apply processor prepares profile/probe temporary state through 0xe24474",
  },
  {
    address: 0x8cc568,
    expectedOpcodeHex: "9415aa74",
    label: "LevelVisuals apply processor dispatches LevelVisuals +0x50 profile/probe payload to 0xe36f38",
  },
  {
    address: 0x8cc63c,
    expectedOpcodeHex: "d100a000",
    label: "secondary vtable thunk converts subobject pointer back to owner by subtracting 0x28",
  },
  {
    address: 0x8cc640,
    expectedOpcodeHex: "17fffe40",
    label: "secondary vtable thunk tail-branches to visuals loader",
  },
  {
    address: 0x8ccfa4,
    expectedOpcodeHex: "f9401808",
    label: "registered cleanup/scan callback reads active Level from owner +0x30",
  },
  {
    address: 0x8ccfa8,
    expectedOpcodeHex: "f940c508",
    label: "registered cleanup/scan callback reads active Level +0x188",
  },
  {
    address: 0x8ccfdc,
    expectedOpcodeHex: "f9000009",
    label: "registered object initializer stores primary vtable at owner +0x0",
  },
  {
    address: 0x8ccfe0,
    expectedOpcodeHex: "a902fc08",
    label: "registered object initializer stores secondary vtable/null at owner +0x28",
  },
  {
    address: 0x8ccfe8,
    expectedOpcodeHex: "f9400008",
    label: "registered invoke callback loads owner primary vtable",
  },
  {
    address: 0x8ccfec,
    expectedOpcodeHex: "f9400101",
    label: "registered invoke callback loads vtable slot +0x0",
  },
  {
    address: 0x8ccff0,
    expectedOpcodeHex: "d61f0020",
    label: "registered invoke callback branches through the loaded virtual slot",
  },
  {
    address: 0x8be39c,
    expectedOpcodeHex: "943f42b3",
    label: "current key owner constructor initializes the base registry owner through 0x188ee68",
  },
  {
    address: 0x8be3c4,
    expectedOpcodeHex: "f9000269",
    label: "current key owner constructor stores its primary vtable at owner +0x0",
  },
  {
    address: 0x8be404,
    expectedOpcodeHex: "b902be7f",
    label: "current key owner constructor initializes time/profile field owner +0x2bc to zero",
  },
  {
    address: 0x8be62c,
    expectedOpcodeHex: "f9067d13",
    label: "current key owner constructor publishes the owner pointer into global slot 0x3034cf8",
  },
  {
    address: 0x8bed9c,
    expectedOpcodeHex: "f9067d1f",
    label: "current key owner destructor clears global slot 0x3034cf8",
  },
  {
    address: 0x9195a8,
    expectedOpcodeHex: "b90d1109",
    label: "current key owner child registration stores its registry index into global slot 0x3034d10",
  },
  {
    address: 0x9195ac,
    expectedOpcodeHex: "943dcb52",
    label: "current key owner child registration installs slot 2 callback through 0x188c2f4",
  },
  {
    address: 0x9195cc,
    expectedOpcodeHex: "143dcb4a",
    label: "current key owner child registration tail-installs slot 4 callback through 0x188c2f4",
  },
  {
    address: 0x913258,
    expectedOpcodeHex: "b90e7909",
    label: "secondary current object registration stores its registry index into global slot 0x2d44e78",
  },
  {
    address: 0x91325c,
    expectedOpcodeHex: "943de439",
    label: "secondary current object registration installs first keyed callback through 0x188c340",
  },
  {
    address: 0x9135bc,
    expectedOpcodeHex: "943de34e",
    label: "secondary current object registration installs slot 2 callback through 0x188c2f4",
  },
  {
    address: 0x9135dc,
    expectedOpcodeHex: "143de346",
    label: "secondary current object registration tail-installs slot 4 callback through 0x188c2f4",
  },
  {
    address: 0x8bfa6c,
    expectedOpcodeHex: "f9467ed5",
    label: "current key owner updater reads global slot 0x3034cf8 before searching child list",
  },
  {
    address: 0x8bfa74,
    expectedOpcodeHex: "b94d1101",
    label: "current key owner updater reads child registry index 0x3034d10",
  },
  {
    address: 0x8bfa9c,
    expectedOpcodeHex: "943f2f87",
    label: "current key owner updater creates missing child object through generic slot 0 create",
  },
  {
    address: 0x8bfd84,
    expectedOpcodeHex: "f9467d00",
    label: "current key owner late updater reads global slot 0x3034cf8",
  },
  {
    address: 0x8bfdb4,
    expectedOpcodeHex: "b94d1101",
    label: "current key owner late updater reads child registry index 0x3034d10 before create",
  },
  {
    address: 0x8bfdb8,
    expectedOpcodeHex: "943f2ec0",
    label: "current key owner late updater creates missing child object through generic slot 0 create",
  },
  {
    address: 0x8badcc,
    expectedOpcodeHex: "9400536c",
    label: "module registration hub calls current owner state/position registration builder 0x8cfb7c",
  },
  {
    address: 0x8cfb7c,
    expectedOpcodeHex: "5287f608",
    label: "current owner registration builder prepares registry count offset 0x13fb0",
  },
  {
    address: 0x8cfb84,
    expectedOpcodeHex: "b8686809",
    label: "current owner registration builder reads current registry count",
  },
  {
    address: 0x8cfb88,
    expectedOpcodeHex: "52805d0a",
    label: "current owner registration builder prepares registry record stride 0x2e8",
  },
  {
    address: 0x8cfb90,
    expectedOpcodeHex: "9104016b",
    label: "current owner registration builder prepares primary callback table 0x8d2100",
  },
  {
    address: 0x8cfba0,
    expectedOpcodeHex: "91049108",
    label: "current owner registration builder prepares secondary callback table 0x8d2124",
  },
  {
    address: 0x8cfba8,
    expectedOpcodeHex: "a90b214b",
    label: "current owner registration builder stores callback table pointers at record +0xb0",
  },
  {
    address: 0x8cfbd0,
    expectedOpcodeHex: "912fb042",
    label: "current owner registration builder prepares slot 4 callback 0x8cfbec",
  },
  {
    address: 0x8cfbd4,
    expectedOpcodeHex: "321e03e1",
    label: "current owner registration builder selects callback slot 4",
  },
  {
    address: 0x8cfbdc,
    expectedOpcodeHex: "2914b149",
    label: "current owner registration builder stores registry index and runtime kind 0x8a8 at record +0xa4",
  },
  {
    address: 0x8cfbe0,
    expectedOpcodeHex: "f82b680a",
    label: "current owner registration builder stores its record pointer at registry +0x13fb8",
  },
  {
    address: 0x8cfbe4,
    expectedOpcodeHex: "b9026509",
    label: "current owner registration builder publishes registry index into global slot 0x3035264",
  },
  {
    address: 0x8cfbe8,
    expectedOpcodeHex: "143ef1c3",
    label: "current owner registration builder tail-installs slot 4 callback through 0x188c2f4",
  },
  {
    address: 0x79f37c,
    expectedOpcodeHex: "d00144a8",
    label: "current owner registry index lazy initializer prepares guard slot 0x3035268",
  },
  {
    address: 0x79f380,
    expectedOpcodeHex: "3949a109",
    label: "current owner registry index lazy initializer reads guard byte",
  },
  {
    address: 0x79f384,
    expectedOpcodeHex: "37000109",
    label: "current owner registry index lazy initializer skips once guard is set",
  },
  {
    address: 0x79f39c,
    expectedOpcodeHex: "b9400129",
    label: "current owner registry index lazy initializer reads source index",
  },
  {
    address: 0x79f3a0,
    expectedOpcodeHex: "b9026549",
    label: "current owner registry index lazy initializer copies source index into global slot 0x3035264",
  },
  {
    address: 0x8cfc24,
    expectedOpcodeHex: "943efaf2",
    label: "current owner slot 4 callback samples runtime delta time through 0x188e7ec",
  },
  {
    address: 0x8cfc8c,
    expectedOpcodeHex: "940e275d",
    label: "current owner slot 4 callback clears expired object state through 0xc59a00",
  },
  {
    address: 0x8cfd7c,
    expectedOpcodeHex: "f9441400",
    label: "current owner slot 4 update dispatcher reads attached object at owner +0x828",
  },
  {
    address: 0x8cfdec,
    expectedOpcodeHex: "9400001d",
    label: "current owner slot 4 update dispatcher projects attached object position through 0x8cfe60",
  },
  {
    address: 0x8cfe70,
    expectedOpcodeHex: "9100a000",
    label: "current owner state position projector reads owner transform state from owner +0x28",
  },
  {
    address: 0x8cff38,
    expectedOpcodeHex: "f9041401",
    label: "current owner state attach stores attached object pointer at owner +0x828",
  },
  {
    address: 0x8d00e8,
    expectedOpcodeHex: "14000019",
    label: "current owner state attach refreshes cached transform through 0x8d014c",
  },
  {
    address: 0x94ad90,
    expectedOpcodeHex: "94131a97",
    label: "HUD_Minimap owner constructor initializes its base object through 0xe117ec",
  },
  {
    address: 0x94ad94,
    expectedOpcodeHex: "d000ec28",
    label: "HUD_Minimap owner constructor prepares primary vtable 0x26d01f0",
  },
  {
    address: 0x94ada8,
    expectedOpcodeHex: "f9000288",
    label: "HUD_Minimap owner constructor stores primary vtable at object +0x0",
  },
  {
    address: 0x94adbc,
    expectedOpcodeHex: "d0008ad6",
    label: "HUD_Minimap owner constructor prepares HUD_Minimap string page",
  },
  {
    address: 0x94adc0,
    expectedOpcodeHex: "91386ad6",
    label: "HUD_Minimap owner constructor completes HUD_Minimap string address",
  },
  {
    address: 0x94adc8,
    expectedOpcodeHex: "94108a46",
    label: "HUD_Minimap owner constructor measures/hashes HUD_Minimap label",
  },
  {
    address: 0x94add8,
    expectedOpcodeHex: "97fb58cb",
    label: "HUD_Minimap owner constructor hashes HUD_Minimap with seed 0x1234",
  },
  {
    address: 0x94adec,
    expectedOpcodeHex: "f0013748",
    label: "HUD_Minimap owner constructor prepares current owner registry index slot 0x3035264",
  },
  {
    address: 0x94adf0,
    expectedOpcodeHex: "b9426500",
    label: "HUD_Minimap owner constructor reads registry index 0x3035264",
  },
  {
    address: 0x94adf4,
    expectedOpcodeHex: "943d0d2e",
    label: "HUD_Minimap owner constructor creates/resolves current owner through 0x188e2ac",
  },
  {
    address: 0x94adfc,
    expectedOpcodeHex: "f901a280",
    label: "HUD_Minimap owner constructor stores created current owner at object +0x340",
  },
  {
    address: 0x94ae24,
    expectedOpcodeHex: "f941a288",
    label: "HUD_Minimap owner constructor reloads object +0x340 current owner",
  },
  {
    address: 0x94ae30,
    expectedOpcodeHex: "9100a101",
    label: "HUD_Minimap owner constructor links current owner transform state at +0x28",
  },
  {
    address: 0x94ae34,
    expectedOpcodeHex: "9412f853",
    label: "HUD_Minimap owner constructor attaches current owner transform state into the object tree",
  },
  {
    address: 0x94ae80,
    expectedOpcodeHex: "f941a000",
    label: "HUD_Minimap owner destructor reads object +0x340 current owner",
  },
  {
    address: 0x94ae94,
    expectedOpcodeHex: "943d0d75",
    label: "HUD_Minimap owner destructor releases current owner through 0x188e468",
  },
  {
    address: 0x94ae9c,
    expectedOpcodeHex: "f901a27f",
    label: "HUD_Minimap owner destructor clears object +0x340 current owner",
  },
  {
    address: 0x94af30,
    expectedOpcodeHex: "b94e9902",
    label: "HUD_Minimap owner update loads Level setup runtime index 0x2d44e98",
  },
  {
    address: 0x94af3c,
    expectedOpcodeHex: "943d0d81",
    label: "HUD_Minimap owner update queries Level setup objects through 0x188e540",
  },
  {
    address: 0x94af88,
    expectedOpcodeHex: "f941a263",
    label: "HUD_Minimap owner update reloads object +0x340 current owner",
  },
  {
    address: 0x94af98,
    expectedOpcodeHex: "94000601",
    label: "HUD_Minimap owner update forwards current owner to subobject updater 0x94c79c",
  },
  {
    address: 0x94afa4,
    expectedOpcodeHex: "940006d7",
    label: "HUD_Minimap owner update samples minimap layout position through 0x94cb00",
  },
  {
    address: 0x94afac,
    expectedOpcodeHex: "aa1703e0",
    label: "HUD_Minimap owner update moves object +0x340 current owner into x0 for attach",
  },
  {
    address: 0x94afb0,
    expectedOpcodeHex: "aa1503e1",
    label: "HUD_Minimap owner update moves external attached object argument into x1 for attach",
  },
  {
    address: 0x94afb8,
    expectedOpcodeHex: "97fe13db",
    label: "HUD_Minimap owner update attaches the external object through current owner attach 0x8cff24",
  },
  {
    address: 0x94afc0,
    expectedOpcodeHex: "f941a260",
    label: "HUD_Minimap owner update reloads object +0x340 current owner after attach",
  },
  {
    address: 0x94afcc,
    expectedOpcodeHex: "97fe147c",
    label: "HUD_Minimap owner update refreshes attached current owner display position through 0x8d01bc",
  },
  {
    address: 0x94c660,
    expectedOpcodeHex: "94133c73",
    label: "HUD_Minimap subobject initializer initializes its base object through 0xe1bbf8",
  },
  {
    address: 0x94c684,
    expectedOpcodeHex: "f9000269",
    label: "HUD_Minimap subobject initializer stores subobject primary vtable",
  },
  {
    address: 0x94c698,
    expectedOpcodeHex: "f9005e69",
    label: "HUD_Minimap subobject initializer stores secondary subobject vtable",
  },
  {
    address: 0x94c7c4,
    expectedOpcodeHex: "f9008003",
    label: "HUD_Minimap subobject update stores current owner pointer at subobject +0x100",
  },
  {
    address: 0x94c8b8,
    expectedOpcodeHex: "9400000d",
    label: "HUD_Minimap subobject update computes minimap texture/layout parameters through 0x94c8ec",
  },
  {
    address: 0x94cb00,
    expectedOpcodeHex: "f9407808",
    label: "HUD_Minimap position sampler reads subobject +0xf0 layout state",
  },
  {
    address: 0x94cb28,
    expectedOpcodeHex: "bd409401",
    label: "HUD_Minimap position sampler reads subobject +0x94 fallback dimension",
  },
  {
    address: 0x93a540,
    expectedOpcodeHex: "9400420f",
    label: "large owner A constructs embedded HUD_Minimap owner",
  },
  {
    address: 0x974ac8,
    expectedOpcodeHex: "97ff58ad",
    label: "large owner B constructs embedded HUD_Minimap owner",
  },
  {
    address: 0xb05b98,
    expectedOpcodeHex: "97f91479",
    label: "large owner C constructs embedded HUD_Minimap owner",
  },
  {
    address: 0x93cadc,
    expectedOpcodeHex: "94003907",
    label: "large owner A updates embedded HUD_Minimap owner",
  },
  {
    address: 0x974c78,
    expectedOpcodeHex: "97ff58a0",
    label: "large owner B updates embedded HUD_Minimap owner",
  },
  {
    address: 0xb05fa4,
    expectedOpcodeHex: "17f913d5",
    label: "large owner C tail-updates embedded HUD_Minimap owner",
  },
  {
    address: 0x8bae1c,
    expectedOpcodeHex: "940146e2",
    label: "module registration hub calls the player-lock/HUD runtime index registration",
  },
  {
    address: 0x90c9a4,
    expectedOpcodeHex: "f81e0ff3",
    label: "player-lock/HUD runtime index registration entry",
  },
  {
    address: 0x90c9e4,
    expectedOpcodeHex: "a90b2d48",
    label: "player-lock/HUD registration stores object initializer and virtual invoke callback into record +0xb0",
  },
  {
    address: 0x90c9f0,
    expectedOpcodeHex: "2914ad49",
    label: "player-lock/HUD registration stores registry index and runtime kind 0x1e88 at record +0xa4",
  },
  {
    address: 0x90ca1c,
    expectedOpcodeHex: "b900b109",
    label: "player-lock/HUD registration stores record index in global slot 0x2b0f0b0",
  },
  {
    address: 0x90ca20,
    expectedOpcodeHex: "943dfe35",
    label: "player-lock/HUD registration installs slot 5 callback through 0x188c2f4",
  },
  {
    address: 0x90ca30,
    expectedOpcodeHex: "9129a042",
    label: "player-lock/HUD registration prepares keyed callback 0x90ca68",
  },
  {
    address: 0x90ca44,
    expectedOpcodeHex: "143dfe3f",
    label: "player-lock/HUD registration tail-installs keyed callback through 0x188c340",
  },
  {
    address: 0x80180c,
    expectedOpcodeHex: "b940b101",
    label: "player-lock/HUD current-key path reads index slot 0x2b0f0b0 before object create",
  },
  {
    address: 0x801814,
    expectedOpcodeHex: "94422829",
    label: "player-lock/HUD current-key path creates/resolves object through 0x188b8b8",
  },
  {
    address: 0x888210,
    expectedOpcodeHex: "b940b102",
    label: "player-lock/HUD simple query reads index slot 0x2b0f0b0",
  },
  {
    address: 0x88821c,
    expectedOpcodeHex: "944018c9",
    label: "player-lock/HUD simple query checks the index through 0x188e540",
  },
  {
    address: 0x8c5378,
    expectedOpcodeHex: "b940b102",
    label: "player-lock/HUD resolved-key query A reads index slot 0x2b0f0b0",
  },
  {
    address: 0x8c538c,
    expectedOpcodeHex: "943f246d",
    label: "player-lock/HUD resolved-key query A checks the index through 0x188e540",
  },
  {
    address: 0x9166c4,
    expectedOpcodeHex: "b940b102",
    label: "player-lock/HUD resolved-key query B reads index slot 0x2b0f0b0",
  },
  {
    address: 0x9166d8,
    expectedOpcodeHex: "943ddf9a",
    label: "player-lock/HUD resolved-key query B checks the index through 0x188e540",
  },
  {
    address: 0x95d530,
    expectedOpcodeHex: "b940b102",
    label: "player-lock/HUD resolved-key query C reads index slot 0x2b0f0b0",
  },
  {
    address: 0x95d544,
    expectedOpcodeHex: "943cc3ff",
    label: "player-lock/HUD resolved-key query C checks the index through 0x188e540",
  },
  {
    address: 0xbab8c0,
    expectedOpcodeHex: "b940b102",
    label: "player-lock/HUD keyed dispatch loop reads index slot 0x2b0f0b0",
  },
  {
    address: 0xbab8d0,
    expectedOpcodeHex: "94338b1c",
    label: "player-lock/HUD keyed dispatch loop queries indexed objects through 0x188e540",
  },
  {
    address: 0xbab930,
    expectedOpcodeHex: "5280c5a1",
    label: "player-lock/HUD keyed dispatch loop prepares keyed callback id low half 0x062d",
  },
  {
    address: 0xbab934,
    expectedOpcodeHex: "72a6ef41",
    label: "player-lock/HUD keyed dispatch loop prepares keyed callback id high half 0x377a",
  },
  {
    address: 0x8d05d4,
    expectedOpcodeHex: "97ffb6b7",
    label: "current owner active-state bridge reads the current key owner through 0x8be0b0",
  },
  {
    address: 0x8d05e4,
    expectedOpcodeHex: "b94d1108",
    label: "current owner active-state bridge reads child index 0x3034d10",
  },
  {
    address: 0x8d061c,
    expectedOpcodeHex: "b94e7908",
    label: "current owner active-state bridge fallback reads secondary object index 0x2d44e78",
  },
  {
    address: 0x8d0674,
    expectedOpcodeHex: "b94e9902",
    label: "current owner active-state bridge loads Level setup runtime index 0x2d44e98",
  },
  {
    address: 0x8d068c,
    expectedOpcodeHex: "943ef7ad",
    label: "current owner active-state bridge queries Level setup objects through 0x188e540",
  },
  {
    address: 0x8d06c4,
    expectedOpcodeHex: "97ffb67b",
    label: "current owner active-state bridge rereads the current key owner before child access",
  },
  {
    address: 0x8d06c8,
    expectedOpcodeHex: "97ffbc00",
    label: "current owner active-state bridge resolves current child data through 0x8bf6c8",
  },
  {
    address: 0x8d0c48,
    expectedOpcodeHex: "97fffe54",
    label: "runtime state update caller invokes current owner active-state bridge",
  },
  {
    address: 0x8d0f8c,
    expectedOpcodeHex: "97fffd83",
    label: "runtime state refresh caller invokes current owner active-state bridge",
  },
  {
    address: 0x8d10ac,
    expectedOpcodeHex: "97ffb401",
    label: "current owner state refresh bridge reads current key owner through 0x8be0b0",
  },
  {
    address: 0x8d10bc,
    expectedOpcodeHex: "b94d1108",
    label: "current owner state refresh bridge reads child index 0x3034d10",
  },
  {
    address: 0x8d1084,
    expectedOpcodeHex: "b94e7908",
    label: "current owner state refresh bridge reads secondary object index 0x2d44e78",
  },
  {
    address: 0x8d122c,
    expectedOpcodeHex: "97ffb3a1",
    label: "current owner cleanup bridge reads current key owner through 0x8be0b0",
  },
  {
    address: 0x8d123c,
    expectedOpcodeHex: "b94d1108",
    label: "current owner cleanup bridge reads child index 0x3034d10",
  },
  {
    address: 0x8d1274,
    expectedOpcodeHex: "b94e7908",
    label: "current owner cleanup bridge reads secondary object index 0x2d44e78",
  },
  {
    address: 0x8cfb70,
    expectedOpcodeHex: "14000515",
    label: "state bridge thunk tail-branches to current owner state refresh bridge 0x8d0fc4",
  },
  {
    address: 0x8cfb74,
    expectedOpcodeHex: "140005a6",
    label: "state bridge thunk tail-branches to current owner state cleanup bridge 0x8d120c",
  },
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function signExtend(value, bits) {
  const signBit = 1 << (bits - 1);
  return (value & (signBit - 1)) - (value & signBit);
}

function fileOffsetForVirtualAddress(loads, virtualAddress, size = 1) {
  for (const segment of loads) {
    const start = segment.virtualAddress;
    const end = segment.virtualAddress + segment.fileSize;
    if (virtualAddress >= start && virtualAddress + size <= end) {
      return segment.fileOffset + (virtualAddress - start);
    }
  }
  return -1;
}

function sectionForVirtualAddress(sections, virtualAddress) {
  return (
    sections.find((section) => {
      if (!section.size) return false;
      return virtualAddress >= section.virtualAddress && virtualAddress < section.virtualAddress + section.size;
    }) || null
  );
}

function readInstruction(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf.loads, virtualAddress, 4);
  if (fileOffset < 0) return null;
  const opcode = buffer.readUInt32LE(fileOffset);
  return {
    address: virtualAddress,
    addressHex: hex(virtualAddress),
    opcode,
    opcodeHex: opcode.toString(16).padStart(8, "0"),
    section: sectionForVirtualAddress(elf.sections, virtualAddress)?.name || "",
  };
}

function directBranchTarget(instruction) {
  const opcode = (instruction.opcode & 0xfc000000) >>> 0;
  const mode = opcode === 0x94000000 ? "bl" : opcode === 0x14000000 ? "b-tail" : "";
  if (!mode) return null;
  const targetAddress = instruction.address + signExtend(instruction.opcode & 0x03ffffff, 26) * 4;
  return {
    targetAddress,
    targetAddressHex: hex(targetAddress),
    mode,
  };
}

function parseAdrp(instruction) {
  if (((instruction.opcode & 0x9f000000) >>> 0) !== 0x90000000) return null;
  const immlo = (instruction.opcode >>> 29) & 0x3;
  const immhi = (instruction.opcode >>> 5) & 0x7ffff;
  const signed = signExtend((immhi << 2) | immlo, 21);
  return {
    register: instruction.opcode & 0x1f,
    address: (instruction.address & ~0xfff) + signed * 0x1000,
  };
}

function parseAdr(instruction) {
  if (((instruction.opcode & 0x9f000000) >>> 0) !== 0x10000000) return null;
  const immlo = (instruction.opcode >>> 29) & 0x3;
  const immhi = (instruction.opcode >>> 5) & 0x7ffff;
  const signed = signExtend((immhi << 2) | immlo, 21);
  return {
    register: instruction.opcode & 0x1f,
    address: instruction.address + signed,
  };
}

function parseAddImmediate(instruction) {
  if (((instruction.opcode & 0xff000000) >>> 0) !== 0x91000000) return null;
  const shift = ((instruction.opcode >>> 22) & 0x3) === 1 ? 12 : 0;
  return {
    destination: instruction.opcode & 0x1f,
    source: (instruction.opcode >>> 5) & 0x1f,
    immediate: ((instruction.opcode >>> 10) & 0xfff) << shift,
  };
}

function parseLdrUnsignedImmediate(instruction) {
  const scaled = [
    { mask: 0xffc00000, value: 0xf9400000, scale: 8, width: "x64" },
    { mask: 0xffc00000, value: 0xb9400000, scale: 4, width: "w32" },
  ].find((entry) => ((instruction.opcode & entry.mask) >>> 0) === entry.value);
  if (!scaled) return null;
  return {
    destination: instruction.opcode & 0x1f,
    source: (instruction.opcode >>> 5) & 0x1f,
    immediate: ((instruction.opcode >>> 10) & 0xfff) * scaled.scale,
    width: scaled.width,
  };
}

function readCStringAtVirtualAddress(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf.loads, virtualAddress);
  if (fileOffset < 0) return "";
  const section = sectionForVirtualAddress(elf.sections, virtualAddress);
  if (section?.name !== ".rodata") return "";
  let end = fileOffset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  const value = buffer.subarray(fileOffset, end).toString("utf8");
  return /^[\x20-\x7e]{1,240}$/.test(value) ? value : "";
}

function findLocalVgrFileCandidates(searchRoots = defaultLocalVgrSearchRoots, limit = 200) {
  const candidates = [];
  const seen = new Set();
  const visit = (directory) => {
    if (candidates.length >= limit) return;
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (candidates.length >= limit) return;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const normalized = fullPath.split(path.sep).join("/");
      if (!/\.vgr$/i.test(entry.name) && !/\/vgr\//i.test(normalized)) continue;
      const relativePath = path.relative(process.cwd(), fullPath);
      if (seen.has(relativePath)) continue;
      seen.add(relativePath);
      candidates.push(relativePath);
    }
  };
  for (const root of searchRoots) visit(root);
  return candidates.sort();
}

function readFilePrefix(filePath, byteLimit) {
  let fileHandle;
  try {
    fileHandle = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(byteLimit);
    const bytesRead = fs.readSync(fileHandle, buffer, 0, byteLimit, 0);
    return buffer.subarray(0, bytesRead);
  } catch {
    return Buffer.alloc(0);
  } finally {
    if (fileHandle !== undefined) {
      try {
        fs.closeSync(fileHandle);
      } catch {
        // Ignore close failures in a best-effort diagnostic scan.
      }
    }
  }
}

function classifyRawDataPrefix(prefix) {
  if (prefix.length === 0) return "empty-or-unreadable";
  if (prefix.length >= 4 && prefix.subarray(0, 4).toString("ascii") === "RSC0") return "rsc0";
  if (prefix.length >= 4 && prefix.subarray(0, 4).toString("ascii") === "CFF0") return "cff0";
  if (prefix.length >= 8 && prefix.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "png";
  if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) return "jpeg";
  if (prefix.length >= 4 && prefix.subarray(0, 4).toString("ascii") === "DDS ") return "dds";
  if (prefix.length >= 12 && prefix.subarray(0, 12).equals(Buffer.from("ab4b5458203131bb0d0a1a0a", "hex"))) return "ktx";
  if (prefix.length >= 6 && prefix.subarray(0, 6).toString("ascii") === "UnityF") return "unityfs";
  if (prefix.length >= 4 && prefix.subarray(0, 4).toString("ascii") === "OggS") return "ogg";
  if (prefix.length >= 4 && prefix.subarray(0, 4).toString("ascii") === "fLaC") return "flac";
  if (prefix.length >= 3 && prefix.subarray(0, 3).toString("ascii") === "ID3") return "mp3";
  if (prefix.length >= 2 && prefix[0] === 0xff && (prefix[1] & 0xe0) === 0xe0) return "mpeg-audio";
  if (prefix.length >= 4 && prefix.subarray(0, 4).toString("ascii") === "RIFF") return "riff";
  if (prefix.length >= 2 && prefix[0] === 0x1f && prefix[1] === 0x8b) return "gzip";
  if (prefix.length >= 4 && prefix[0] === 0x50 && prefix[1] === 0x4b && prefix[2] === 0x03 && prefix[3] === 0x04) return "zip";
  const printable = prefix.subarray(0, Math.min(prefix.length, 64)).filter((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 0x20 && byte <= 0x7e)).length;
  if (printable >= Math.min(prefix.length, 64) * 0.85) return "mostly-text";
  return "unknown-data";
}

function detectTypedObjectRawFrameMarkers(prefix, fileSize, offsets = [0]) {
  const markers = [];
  const pushPayloadStart = (offset) => {
    if (prefix.length < offset + 2) return;
    const typeId = prefix.readUInt16BE(offset);
    const typeInfo = typedObjectPayloadTypeIds.get(typeId);
    if (!typeInfo) return;
    markers.push({
      kind: "typed-object-payload-start",
      offset,
      typeId,
      typeIdHex: hex(typeId),
      typeName: typeInfo.name,
      minimumBytes: typeInfo.minimumBytes,
      fileSize,
      sizeCoversKnownPayload: fileSize >= offset + typeInfo.minimumBytes,
      confidence: fileSize >= offset + typeInfo.minimumBytes ? "medium" : "low",
    });
  };

  const pushLengthPrefixedFrame = (offset) => {
    if (prefix.length < offset + 4) return;
    const frameLength = prefix.readUInt16BE(offset);
    const typeId = prefix.readUInt16BE(offset + 2);
    const typeInfo = typedObjectPayloadTypeIds.get(typeId);
    if (!typeInfo) return;
    if (frameLength < 2 || frameLength > typedObjectRawFrameBufferCapacity) return;
    markers.push({
      kind: "length-prefixed-typed-object-frame",
      offset,
      frameLength,
      typeId,
      typeIdHex: hex(typeId),
      typeName: typeInfo.name,
      frameWithinFile: fileSize >= offset + 2 + frameLength,
      confidence: fileSize >= offset + 2 + frameLength ? "medium" : "low",
    });
  };

  for (const offset of offsets) {
    pushPayloadStart(offset);
    pushLengthPrefixedFrame(offset);
  }
  return markers;
}

function readPrintableCStringCandidate(buffer, offset, maxBytes = 96, minBytes = 4) {
  if (offset < 0 || offset >= buffer.length) return null;
  const bytes = [];
  const end = Math.min(buffer.length, offset + maxBytes);
  for (let cursor = offset; cursor < end; cursor += 1) {
    const byte = buffer[cursor];
    if (byte === 0) {
      if (bytes.length < minBytes) return null;
      const value = Buffer.from(bytes).toString("utf8");
      return /^[\x20-\x7e]{4,96}$/.test(value) ? value : null;
    }
    if (byte < 0x20 || byte > 0x7e) return null;
    bytes.push(byte);
  }
  return null;
}

function isResourceLikeRuntimeKeyString(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_*:/.\-]{4,96}$/.test(value) &&
    /[A-Za-z]/.test(value)
  );
}

function typedObjectFramePayloadDiagnostic(buffer, typeId, payloadOffset) {
  if (typeId === 0x046f) {
    const keyString = readPrintableCStringCandidate(buffer, payloadOffset);
    return {
      keyStringOffset: payloadOffset,
      keyStringOffsetHex: hex(payloadOffset),
      keyString,
      keyStringResourceLike: isResourceLikeRuntimeKeyString(keyString),
      keySource: "payload +0x0",
    };
  }
  if (typeId === 0x03e9) {
    const keyString = readPrintableCStringCandidate(buffer, payloadOffset + 0x20);
    return {
      keyStringOffset: payloadOffset + 0x20,
      keyStringOffsetHex: hex(payloadOffset + 0x20),
      keyString,
      keyStringResourceLike: isResourceLikeRuntimeKeyString(keyString),
      keySource: "payload +0x20",
    };
  }
  if (typeId === 0x03f3 && payloadOffset + 4 <= buffer.length) {
    const resourceKeyWord0 = buffer.readUInt32BE(payloadOffset);
    return {
      keySource: "payload word0",
      resourceKeyWord0,
      resourceKeyWord0Hex: hex(resourceKeyWord0),
    };
  }
  return { keySource: "" };
}

function scanTypedObjectLengthPrefixedFramesInPrefix(prefix, fileSize, { candidateLimit = 50 } = {}) {
  const candidates = [];
  const typeCounts = {};
  const resourceLikeTypeCounts = {};
  let totalMatches = 0;
  let resourceLikeKeyMatches = 0;
  for (let offset = 0; offset + 4 <= prefix.length; offset += 1) {
    const frameLength = prefix.readUInt16BE(offset);
    const typeId = prefix.readUInt16BE(offset + 2);
    const typeInfo = typedObjectPayloadTypeIds.get(typeId);
    if (!typeInfo) continue;
    if (frameLength < typeInfo.minimumBytes || frameLength > typedObjectRawFrameBufferCapacity) continue;
    if (offset + 2 + frameLength > fileSize) continue;

    const payloadOffset = offset + 4;
    const payloadEnd = offset + 2 + frameLength;
    const payloadDiagnostic = typedObjectFramePayloadDiagnostic(prefix, typeId, payloadOffset);
    const hasExpectedKeyMaterial =
      typeId === 0x03f3 || Boolean(payloadDiagnostic.keyString);
    if (!hasExpectedKeyMaterial) continue;

    totalMatches += 1;
    const typeHex = hex(typeId);
    typeCounts[typeHex] = (typeCounts[typeHex] || 0) + 1;
    if (payloadDiagnostic.keyStringResourceLike) {
      resourceLikeKeyMatches += 1;
      resourceLikeTypeCounts[typeHex] = (resourceLikeTypeCounts[typeHex] || 0) + 1;
    }
    if (candidates.length >= candidateLimit) continue;
    candidates.push({
      kind: "deep-length-prefixed-typed-object-frame",
      offset,
      offsetHex: hex(offset),
      frameLength,
      payloadOffset,
      payloadOffsetHex: hex(payloadOffset),
      payloadEnd,
      payloadEndHex: hex(payloadEnd),
      frameWithinPrefix: payloadEnd <= prefix.length,
      frameWithinFile: true,
      typeId,
      typeIdHex: typeHex,
      typeName: typeInfo.name,
      minimumBytes: typeInfo.minimumBytes,
      confidence: payloadDiagnostic.keyStringResourceLike
        ? "medium-resource-like-diagnostic"
        : "low-structural-diagnostic",
      ...payloadDiagnostic,
      headHex: prefix.subarray(offset, Math.min(prefix.length, offset + 16)).toString("hex"),
    });
  }
  return {
    totalMatches,
    typeCounts,
    resourceLikeKeyMatches,
    resourceLikeTypeCounts,
    candidates,
    capped: totalMatches > candidates.length,
  };
}

function inspectRsc0Prefix(prefix, fileSize) {
  if (prefix.length < 0x24 || prefix.subarray(0, 4).toString("ascii") !== "RSC0") {
    return null;
  }
  const payloadSizeA = prefix.readUInt32LE(4);
  const payloadSizeB = prefix.readUInt32LE(8);
  const expectedPayloadSize = Math.max(0, fileSize - 0x20);
  const innerOffset = 0x20;
  const innerMagic = prefix.subarray(innerOffset, Math.min(prefix.length, innerOffset + 4)).toString("ascii");
  let innerClass = "rsc0-inner-unknown";
  if (innerMagic === "CFF0") {
    innerClass = "rsc0-inner-cff0";
  } else if (prefix.length >= innerOffset + 4 && prefix.readUInt32LE(innerOffset) === fileSize) {
    innerClass = "rsc0-inner-size-prefixed-resource";
  } else if (prefix.length >= innerOffset + 4 && prefix.readUInt32LE(innerOffset) === expectedPayloadSize) {
    innerClass = "rsc0-inner-payload-size-prefixed-resource";
  } else if (/^[\x20-\x7e]{4}$/.test(innerMagic)) {
    innerClass = `rsc0-inner-${innerMagic}`;
  }
  return {
    payloadSizeA,
    payloadSizeB,
    expectedPayloadSize,
    payloadSizesMatchFile: payloadSizeA === expectedPayloadSize && payloadSizeB === expectedPayloadSize,
    innerOffset,
    innerMagic,
    innerClass,
  };
}

function isCff0ChunkMagic(value) {
  return /^[A-Z0-9]{4}$/.test(value);
}

function inspectCff0Prefix(prefix, cff0Offset, fileSize) {
  if (
    cff0Offset < 0 ||
    prefix.length < cff0Offset + 0x18 ||
    prefix.subarray(cff0Offset, cff0Offset + 4).toString("ascii") !== "CFF0"
  ) {
    return null;
  }

  const declaredSize = prefix.readUInt32LE(cff0Offset + 4);
  const versionA = prefix.readUInt32LE(cff0Offset + 8);
  const versionB = prefix.readUInt32LE(cff0Offset + 12);
  const headerSize = prefix.readUInt32LE(cff0Offset + 20) || 64;
  const chunks = [];
  const chunkMagicCounts = {};
  let offset = cff0Offset + headerSize;

  while (offset + 8 <= prefix.length && offset + 8 <= fileSize) {
    const magic = prefix.subarray(offset, offset + 4).toString("ascii");
    const size = prefix.readUInt32LE(offset + 4);
    if (!isCff0ChunkMagic(magic) || size < 8) break;

    const payloadOffset = offset + 8;
    const payloadSize = size - 8;
    const chunk = {
      magic,
      offset,
      offsetHex: hex(offset),
      size,
      payloadOffset,
      payloadOffsetHex: hex(payloadOffset),
      payloadSize,
      truncatedByPrefix: offset + size > prefix.length,
      exceedsFile: offset + size > fileSize,
    };
    chunks.push(chunk);
    chunkMagicCounts[magic] = (chunkMagicCounts[magic] || 0) + 1;

    if (chunk.truncatedByPrefix || chunk.exceedsFile) break;
    offset += size;
  }

  let classification = "cff0-other";
  if (chunks.length === 0) {
    classification = "cff0-no-prefix-chunks";
  } else if (chunkMagicCounts.SHD0 || chunkMagicCounts.TCH0) {
    classification = "cff0-shadergraph";
  } else if (chunkMagicCounts.DEF0 || chunkMagicCounts.INST || chunkMagicCounts.SYMB) {
    classification = "cff0-definition-or-instance";
  }

  return {
    cff0Offset,
    cff0OffsetHex: hex(cff0Offset),
    declaredSize,
    versionA,
    versionB,
    headerSize,
    declaredEndOffset: cff0Offset + declaredSize,
    declaredEndOffsetHex: hex(cff0Offset + declaredSize),
    declaredSizeWithinFile: declaredSize > 0 && cff0Offset + declaredSize <= fileSize,
    declaredSizeMatchesFile: declaredSize === fileSize,
    declaredSizeMatchesRemainingFile: declaredSize === Math.max(0, fileSize - cff0Offset),
    chunkCount: chunks.length,
    firstChunkMagic: chunks[0]?.magic || "",
    chunkMagicCounts,
    classification,
    chunks,
  };
}

function cff0TypedObjectMarkerOffsets(cff0) {
  if (!cff0) return [];
  const offsets = [cff0.cff0Offset, cff0.cff0Offset + cff0.headerSize];
  for (const chunk of cff0.chunks || []) {
    offsets.push(chunk.payloadOffset);
  }
  return offsets;
}

function auditIosRawDataTypedObjectPayloads({
  dataRoot = defaultIosRawDataRoot,
  prefixBytes = typedObjectRawPrefixScanBytes,
  cff0PrefixBytes = typedObjectRawCff0PrefixScanBytes,
  deepScanBytes = typedObjectRawDeepScanBytes,
  sampleLimit = 20,
  candidateLimit = 500,
} = {}) {
  const audit = {
    dataRoot,
    dataRootExists: fs.existsSync(dataRoot),
    policy: "diagnostic-only prefix scan; candidates do not prove active preview payloads",
    prefixBytes,
    cff0PrefixBytes,
    deepScanBytes,
    knownTypeIds: [...typedObjectPayloadTypeIds.entries()].map(([typeId, info]) => ({
      typeId,
      typeIdHex: hex(typeId),
      typeName: info.name,
      minimumBytes: info.minimumBytes,
    })),
    fileCount: 0,
    extensionlessFileCount: 0,
    hashNamedFileCount: 0,
    totalSizeBytes: 0,
    prefixClassifications: {},
    rsc0FileCount: 0,
    rsc0HeaderPayloadSizeMatchCount: 0,
    rsc0InnerClassifications: {},
    rsc0Samples: [],
    cff0FileCount: 0,
    cff0ParsedPrefixCount: 0,
    cff0Classifications: {},
    cff0FirstChunkMagicCounts: {},
    cff0ChunkMagicCounts: {},
    cff0Samples: [],
    unknownDataSamples: [],
    frameCandidateCount: 0,
    frameCandidates: [],
    deepScanFileCount: 0,
    deepScanBytesRead: 0,
    deepScanFrameCandidateCount: 0,
    deepScanFrameCandidateTypeCounts: {},
    deepScanResourceLikeKeyFrameCandidateCount: 0,
    deepScanResourceLikeKeyFrameCandidateTypeCounts: {},
    deepScanFrameCandidates: [],
  };
  if (!audit.dataRootExists) {
    audit.heuristicState = "ios-raw-data-root-missing";
    return audit;
  }

  const visit = (directory) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      let stats;
      try {
        stats = fs.statSync(fullPath);
      } catch {
        continue;
      }
      const relativePath = path.relative(process.cwd(), fullPath);
      const normalizedRelativePath = relativePath.split(path.sep).join("/");
      const prefix = readFilePrefix(fullPath, prefixBytes);
      const prefixClass = classifyRawDataPrefix(prefix);
      const analysisPrefix =
        prefixClass === "rsc0" || prefixClass === "cff0"
          ? readFilePrefix(fullPath, Math.max(prefixBytes, cff0PrefixBytes))
          : prefix;
      const rsc0 = inspectRsc0Prefix(analysisPrefix, stats.size);
      const cff0Offset = prefixClass === "cff0" ? 0 : rsc0?.innerMagic === "CFF0" ? rsc0.innerOffset : -1;
      const cff0 = cff0Offset >= 0 ? inspectCff0Prefix(analysisPrefix, cff0Offset, stats.size) : null;
      const extensionless = path.extname(entry.name) === "";
      const hashNamed = /^[0-9A-F]{32}$/i.test(entry.name) && /^[0-9A-F]{2}$/i.test(path.basename(path.dirname(fullPath)));
      const markerOffsets = new Set([0]);
      if (rsc0) markerOffsets.add(rsc0.innerOffset);
      for (const offset of cff0TypedObjectMarkerOffsets(cff0)) markerOffsets.add(offset);
      const markers = detectTypedObjectRawFrameMarkers(analysisPrefix, stats.size, [...markerOffsets]);
      const shouldDeepScan =
        prefixClass === "unknown-data" ||
        rsc0?.innerClass === "rsc0-inner-size-prefixed-resource" ||
        rsc0?.innerClass === "rsc0-inner-payload-size-prefixed-resource";
      const deepPrefix = shouldDeepScan
        ? readFilePrefix(fullPath, Math.min(stats.size, Math.max(analysisPrefix.length, deepScanBytes)))
        : Buffer.alloc(0);
      const deepScan = shouldDeepScan
        ? scanTypedObjectLengthPrefixedFramesInPrefix(deepPrefix, stats.size, {
            candidateLimit: Math.max(0, candidateLimit - audit.deepScanFrameCandidates.length),
          })
        : { totalMatches: 0, typeCounts: {}, candidates: [], capped: false };

      audit.fileCount += 1;
      audit.totalSizeBytes += stats.size;
      if (extensionless) audit.extensionlessFileCount += 1;
      if (hashNamed) audit.hashNamedFileCount += 1;
      audit.prefixClassifications[prefixClass] = (audit.prefixClassifications[prefixClass] || 0) + 1;

      if (rsc0) {
        audit.rsc0FileCount += 1;
        if (rsc0.payloadSizesMatchFile) audit.rsc0HeaderPayloadSizeMatchCount += 1;
        audit.rsc0InnerClassifications[rsc0.innerClass] =
          (audit.rsc0InnerClassifications[rsc0.innerClass] || 0) + 1;
        if (audit.rsc0Samples.length < sampleLimit) {
          audit.rsc0Samples.push({
            relativePath: normalizedRelativePath,
            size: stats.size,
            payloadSizeA: rsc0.payloadSizeA,
            payloadSizeB: rsc0.payloadSizeB,
            expectedPayloadSize: rsc0.expectedPayloadSize,
            payloadSizesMatchFile: rsc0.payloadSizesMatchFile,
            innerOffset: rsc0.innerOffset,
            innerMagic: rsc0.innerMagic,
            innerClass: rsc0.innerClass,
            headHex: prefix.subarray(0, Math.min(prefix.length, 64)).toString("hex"),
          });
        }
      }

      if (cff0) {
        audit.cff0FileCount += 1;
        if (cff0.chunkCount > 0) audit.cff0ParsedPrefixCount += 1;
        audit.cff0Classifications[cff0.classification] =
          (audit.cff0Classifications[cff0.classification] || 0) + 1;
        if (cff0.firstChunkMagic) {
          audit.cff0FirstChunkMagicCounts[cff0.firstChunkMagic] =
            (audit.cff0FirstChunkMagicCounts[cff0.firstChunkMagic] || 0) + 1;
        }
        for (const [magic, count] of Object.entries(cff0.chunkMagicCounts)) {
          audit.cff0ChunkMagicCounts[magic] = (audit.cff0ChunkMagicCounts[magic] || 0) + count;
        }
        if (audit.cff0Samples.length < sampleLimit) {
          audit.cff0Samples.push({
            relativePath: normalizedRelativePath,
            size: stats.size,
            containerClass: prefixClass,
            cff0Offset: cff0.cff0Offset,
            cff0OffsetHex: cff0.cff0OffsetHex,
            declaredSize: cff0.declaredSize,
            declaredSizeWithinFile: cff0.declaredSizeWithinFile,
            declaredSizeMatchesFile: cff0.declaredSizeMatchesFile,
            declaredSizeMatchesRemainingFile: cff0.declaredSizeMatchesRemainingFile,
            versionA: cff0.versionA,
            versionB: cff0.versionB,
            headerSize: cff0.headerSize,
            classification: cff0.classification,
            chunkCount: cff0.chunkCount,
            firstChunkMagic: cff0.firstChunkMagic,
            chunkMagicCounts: cff0.chunkMagicCounts,
            chunks: cff0.chunks.slice(0, 12),
            headHex: analysisPrefix.subarray(cff0.cff0Offset, Math.min(analysisPrefix.length, cff0.cff0Offset + 64)).toString("hex"),
          });
        }
      }

      if (prefixClass === "unknown-data" && audit.unknownDataSamples.length < sampleLimit) {
        audit.unknownDataSamples.push({
          relativePath: normalizedRelativePath,
          size: stats.size,
          headHex: prefix.subarray(0, Math.min(prefix.length, 16)).toString("hex"),
        });
      }

      if (markers.length > 0) {
        audit.frameCandidateCount += markers.length;
        if (audit.frameCandidates.length < candidateLimit) {
          for (const marker of markers) {
            if (audit.frameCandidates.length >= candidateLimit) break;
            audit.frameCandidates.push({
              relativePath: normalizedRelativePath,
              size: stats.size,
              headHex: analysisPrefix.subarray(0, Math.min(analysisPrefix.length, 16)).toString("hex"),
              ...marker,
            });
          }
        }
      }

      if (shouldDeepScan) {
        audit.deepScanFileCount += 1;
        audit.deepScanBytesRead += deepPrefix.length;
        audit.deepScanFrameCandidateCount += deepScan.totalMatches;
        audit.deepScanResourceLikeKeyFrameCandidateCount += deepScan.resourceLikeKeyMatches;
        for (const [typeHex, count] of Object.entries(deepScan.typeCounts)) {
          audit.deepScanFrameCandidateTypeCounts[typeHex] =
            (audit.deepScanFrameCandidateTypeCounts[typeHex] || 0) + count;
        }
        for (const [typeHex, count] of Object.entries(deepScan.resourceLikeTypeCounts)) {
          audit.deepScanResourceLikeKeyFrameCandidateTypeCounts[typeHex] =
            (audit.deepScanResourceLikeKeyFrameCandidateTypeCounts[typeHex] || 0) + count;
        }
        for (const candidate of deepScan.candidates) {
          if (audit.deepScanFrameCandidates.length >= candidateLimit) break;
          audit.deepScanFrameCandidates.push({
            relativePath: normalizedRelativePath,
            size: stats.size,
            scanBytes: deepPrefix.length,
            containerClass: prefixClass,
            rsc0InnerClass: rsc0?.innerClass || "",
            ...candidate,
          });
        }
      }
    }
  };

  visit(dataRoot);
  audit.frameCandidatesCapped = audit.frameCandidateCount > audit.frameCandidates.length;
  audit.deepScanFrameCandidatesCapped =
    audit.deepScanFrameCandidateCount > audit.deepScanFrameCandidates.length;
  audit.heuristicState =
    audit.frameCandidateCount > 0 || audit.deepScanResourceLikeKeyFrameCandidateCount > 0
      ? "unconfirmed-resource-like-typed-object-frame-candidates"
      : audit.deepScanFrameCandidateCount > 0
        ? "structural-typed-object-frame-candidates-no-resource-like-key"
      : "no-typed-object-frame-prefix-candidates";
  return audit;
}

function normalizeHexWord(value) {
  return String(value || "").replace(/^0x/i, "").toUpperCase().padStart(8, "0");
}

function auditTypedObjectCandidateResourceHashMatches(
  typedObjectRawIosDataAudit,
  { buildResourceIndexPath = defaultBuildResourceIndexPath, sampleLimit = 50 } = {},
) {
  const words = new Set(
    (typedObjectRawIosDataAudit.deepScanFrameCandidates || [])
      .filter((row) => row.typeIdHex === "0x3f3" && row.resourceKeyWord0Hex)
      .map((row) => normalizeHexWord(row.resourceKeyWord0Hex)),
  );
  const audit = {
    buildResourceIndexPath,
    buildResourceIndexExists: fs.existsSync(buildResourceIndexPath),
    policy:
      "diagnostic-only cross-check: object-builder payload word0 must not be treated as resource evidence unless it matches a proven key/hash namespace",
    candidateWordCount: words.size,
    searchValueKinds: ["relativePath", "buildPath", "build://relativePath"],
    checkedResourceRows: 0,
    engineHashMatchCount: 0,
    matches: [],
  };
  if (words.size === 0 || !audit.buildResourceIndexExists) {
    audit.state = words.size === 0 ? "no-object-builder-word0-candidates" : "build-resource-index-missing";
    return audit;
  }

  let index;
  try {
    index = JSON.parse(fs.readFileSync(buildResourceIndexPath, "utf8"));
  } catch (error) {
    audit.state = "build-resource-index-unreadable";
    audit.error = error.message;
    return audit;
  }

  const seenMatches = new Set();
  for (const row of index.matched || []) {
    audit.checkedResourceRows += 1;
    const values = [
      { kind: "relativePath", value: row.relativePath },
      { kind: "buildPath", value: row.buildPath },
      { kind: "build://relativePath", value: row.relativePath ? `build://${row.relativePath}` : "" },
    ].filter((entry) => entry.value);
    for (const entry of values) {
      const hashHex = engineHashHex(entry.value);
      if (!words.has(hashHex)) continue;
      const key = `${hashHex}\t${entry.kind}\t${row.relativePath}`;
      if (seenMatches.has(key)) continue;
      seenMatches.add(key);
      audit.engineHashMatchCount += 1;
      if (audit.matches.length < sampleLimit) {
        audit.matches.push({
          wordHex: `0x${hashHex}`,
          valueKind: entry.kind,
          value: entry.value,
          relativePath: row.relativePath,
          buildPath: row.buildPath || "",
          filePath: row.filePath || "",
        });
      }
    }
  }

  audit.matchesCapped = audit.engineHashMatchCount > audit.matches.length;
  audit.state =
    audit.engineHashMatchCount > 0
      ? "object-builder-word0-engine-hash-matches-found"
      : "object-builder-word0-no-engine-hash-matches";
  return audit;
}

function parseStrUnsignedImmediate(instruction) {
  const scaled = [
    { mask: 0xffc00000, value: 0xf9000000, scale: 8, width: "x64" },
    { mask: 0xffc00000, value: 0xb9000000, scale: 4, width: "w32" },
  ].find((entry) => ((instruction.opcode & entry.mask) >>> 0) === entry.value);
  if (!scaled) return null;
  return {
    sourceRegister: instruction.opcode & 0x1f,
    baseRegister: (instruction.opcode >>> 5) & 0x1f,
    immediate: ((instruction.opcode >>> 10) & 0xfff) * scaled.scale,
    width: scaled.width,
  };
}

function scanTextStores(buffer, elf, targets, lookaheadInstructions = 14) {
  const text = elf.sections.find((section) => section.name === ".text");
  if (!text) throw new Error("missing .text section");
  const targetByAddress = new Map(targets.map((target) => [target.address, target]));
  const rows = [];
  for (let address = text.virtualAddress; address < text.virtualAddress + text.size; address += 4) {
    const instruction = readInstruction(buffer, elf, address);
    if (!instruction) continue;
    const adrp = parseAdrp(instruction);
    if (!adrp) continue;
    for (let lookahead = 1; lookahead <= lookaheadInstructions; lookahead += 1) {
      const useAddress = address + lookahead * 4;
      const useInstruction = readInstruction(buffer, elf, useAddress);
      if (!useInstruction) break;
      const store = parseStrUnsignedImmediate(useInstruction);
      if (store && store.baseRegister === adrp.register) {
        const target = targetByAddress.get(adrp.address + store.immediate);
        if (target) {
          rows.push({
            targetName: target.name,
            targetAddress: target.address,
            targetAddressHex: hex(target.address),
            storeAddress: useAddress,
            storeAddressHex: hex(useAddress),
            baseAddress: address,
            baseAddressHex: hex(address),
            baseInstructionHex: instruction.opcodeHex,
            storeInstructionHex: useInstruction.opcodeHex,
            sourceRegister: store.sourceRegister,
            width: store.width,
          });
        }
      }
      const nextAdrp = parseAdrp(useInstruction);
      if (nextAdrp && nextAdrp.register === adrp.register) break;
    }
  }
  return rows.sort((a, b) => a.storeAddress - b.storeAddress || a.targetAddress - b.targetAddress);
}

function instructionEvidence(buffer, elf) {
  return instructionChecks.map((check) => {
    const instruction = readInstruction(buffer, elf, check.address);
    return {
      ...check,
      addressHex: hex(check.address),
      actualOpcodeHex: instruction?.opcodeHex || "",
      matched: instruction?.opcodeHex === check.expectedOpcodeHex,
      section: instruction?.section || "",
    };
  });
}

function directBranchesInRange(buffer, elf, startAddress, endAddress) {
  const rows = [];
  for (let address = startAddress; address < endAddress; address += 4) {
    const instruction = readInstruction(buffer, elf, address);
    if (!instruction) continue;
    const branch = directBranchTarget(instruction);
    if (!branch) continue;
    rows.push({
      callerAddress: address,
      callerAddressHex: hex(address),
      targetAddress: branch.targetAddress,
      targetAddressHex: branch.targetAddressHex,
      mode: branch.mode,
      opcodeHex: instruction.opcodeHex,
      isLevelRuntimeModuleRegistration: branch.targetAddress === addresses.levelRuntimeModuleRegistration,
    });
  }
  return rows;
}

function readJumpTableTarget(buffer, elf, tableAddress, typeId, baseTypeId) {
  const index = typeId - baseTypeId;
  if (index < 0) return null;
  const fileOffset = fileOffsetForVirtualAddress(elf.loads, tableAddress + index * 4, 4);
  if (fileOffset < 0) return null;
  const relativeOffset = buffer.readInt32LE(fileOffset);
  const targetAddress = tableAddress + relativeOffset;
  return {
    typeId,
    typeIdHex: hex(typeId),
    index,
    indexHex: hex(index),
    tableAddress,
    tableAddressHex: hex(tableAddress),
    entryAddress: tableAddress + index * 4,
    entryAddressHex: hex(tableAddress + index * 4),
    relativeOffset,
    relativeOffsetHex: hex(relativeOffset),
    targetAddress,
    targetAddressHex: hex(targetAddress),
  };
}

function scanDirectCallerNeighborhoodsForTargets(
  buffer,
  elf,
  callerRecords,
  targetDefinitions,
  beforeBytes = 0x80,
  afterBytes = 0x180,
) {
  const targetByAddress = new Map(targetDefinitions.map((target) => [target.address, target]));
  const rows = [];
  for (const caller of callerRecords || []) {
    const callerAddress =
      caller.callerAddress ?? Number.parseInt(String(caller.callerAddressHex || "").replace(/^0x/, ""), 16);
    if (!Number.isFinite(callerAddress)) continue;
    const start = callerAddress - beforeBytes;
    const end = callerAddress + afterBytes;
    for (let address = start; address <= end; address += 4) {
      const instruction = readInstruction(buffer, elf, address);
      if (!instruction) continue;
      const branch = directBranchTarget(instruction);
      if (!branch) continue;
      const target = targetByAddress.get(branch.targetAddress);
      if (!target) continue;
      rows.push({
        consumerCallerAddress: callerAddress,
        consumerCallerAddressHex: hex(callerAddress),
        branchAddress: address,
        branchAddressHex: hex(address),
        distanceFromAccessorCall: address - callerAddress,
        distanceFromAccessorCallHex: hex(address - callerAddress),
        targetName: target.name,
        targetAddress: target.address,
        targetAddressHex: hex(target.address),
        mode: branch.mode,
        opcodeHex: instruction.opcodeHex,
      });
    }
  }
  return rows.sort((a, b) => a.consumerCallerAddress - b.consumerCallerAddress || a.branchAddress - b.branchAddress);
}

function scanAddressNeighborhoodsForTargets(
  buffer,
  elf,
  centers,
  targetDefinitions,
  beforeBytes = 0x80,
  afterBytes = 0x180,
) {
  const targetByAddress = new Map(targetDefinitions.map((target) => [target.address, target]));
  const rows = [];
  for (const center of centers) {
    if (!Number.isFinite(center.address)) continue;
    const start = center.address - beforeBytes;
    const end = center.address + afterBytes;
    for (let address = start; address <= end; address += 4) {
      const instruction = readInstruction(buffer, elf, address);
      if (!instruction) continue;
      const branch = directBranchTarget(instruction);
      if (!branch) continue;
      const target = targetByAddress.get(branch.targetAddress);
      if (!target) continue;
      rows.push({
        centerName: center.name,
        centerAddress: center.address,
        centerAddressHex: hex(center.address),
        branchAddress: address,
        branchAddressHex: hex(address),
        distanceFromCenter: address - center.address,
        targetName: target.name,
        targetAddress: target.address,
        targetAddressHex: hex(target.address),
        mode: branch.mode,
        opcodeHex: instruction.opcodeHex,
      });
    }
  }
  return rows.sort((a, b) => a.centerAddress - b.centerAddress || a.branchAddress - b.branchAddress);
}

function uniqueByKey(rows, keyFn) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

function countBy(rows, keyFn) {
  return rows.reduce((counts, row) => {
    const key = keyFn(row);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function readPointerAtVirtualAddress(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf.loads, virtualAddress, 8);
  if (fileOffset < 0) return null;
  return Number(buffer.readBigUInt64LE(fileOffset));
}

function classifyDescriptorPayloadResolverShimCaller(callerAddress, stringValues) {
  const joined = stringValues.join(" ");
  if (joined.includes("*KindredManifest*") || joined.includes("build://Levels/DefinitionManifest.def")) {
    return "level-definition-manifest";
  }
  if (joined.includes("*HeroManifest*") || joined.includes("build://Levels/HeroManifest.def")) {
    return "hero-manifest";
  }
  if (/build:\/\/Progression/.test(joined) || /\*Kindred[A-Za-z0-9_]*Manifest\*/.test(joined)) {
    return "progression-manifest";
  }
  if (joined.includes("*HUDQuickMessageSet*")) return "hud-quick-message-set";
  if (callerAddress >= 0xbeaf24 && callerAddress <= 0xbeb048) {
    return "hero-manifest-dynamic-key-helper";
  }
  if (callerAddress >= 0xc72df0 && callerAddress <= 0xc72e88) {
    return "resource-key-table-generic-shim";
  }
  if (callerAddress === 0x188e3d4) return "generic-callback-dispatch-helper";
  return stringValues.length ? "string-backed-other" : "unclassified-dynamic";
}

function scanDescriptorPayloadResolverShimCallerContexts(
  buffer,
  elf,
  callerRecords,
  beforeBytes = 0x120,
  afterBytes = 0x80,
) {
  const interestingTargets = [
    "descriptorPayloadResolverShim",
    "descriptorPayloadResolver",
    "genericCallbackDispatchHelper",
    "genericCallbackDispatch",
    "resourceKeyTableGlobalAccessor",
    "resourceKeyByIdLookup",
    "resourceKeyToStringLookup",
    "genericCallbackIndexQuery",
    "runtimeResourceKeyResolvedAccessor",
    "runtimeResourceKeyGlobalSetter",
    "runtimeResourceKeyPostAccessor",
  ]
    .map((name) => ({ name, address: addresses[name] }))
    .filter((target) => typeof target.address === "number");
  const targetByAddress = new Map(interestingTargets.map((target) => [target.address, target]));
  const rows = [];
  for (const caller of callerRecords) {
    const callerAddress = caller.callerAddress;
    if (!Number.isFinite(callerAddress)) continue;
    const registerValues = new Map();
    const strings = [];
    const calls = [];
    const start = callerAddress - beforeBytes;
    const end = callerAddress + afterBytes;
    for (let address = start; address <= end; address += 4) {
      const instruction = readInstruction(buffer, elf, address);
      if (!instruction) continue;

      const adr = parseAdr(instruction);
      if (adr) registerValues.set(adr.register, adr.address);
      const adrp = parseAdrp(instruction);
      if (adrp) registerValues.set(adrp.register, adrp.address);
      const add = parseAddImmediate(instruction);
      if (add && registerValues.has(add.source)) {
        registerValues.set(add.destination, registerValues.get(add.source) + add.immediate);
      }
      const ldr = parseLdrUnsignedImmediate(instruction);
      if (ldr && registerValues.has(ldr.source)) {
        const sourceAddress = registerValues.get(ldr.source) + ldr.immediate;
        const pointer = ldr.width === "x64" ? readPointerAtVirtualAddress(buffer, elf, sourceAddress) : null;
        if (Number.isFinite(pointer)) registerValues.set(ldr.destination, pointer);
      }

      for (const [register, virtualAddress] of registerValues.entries()) {
        const value = readCStringAtVirtualAddress(buffer, elf, virtualAddress);
        if (!value) continue;
        strings.push({
          register,
          address: virtualAddress,
          addressHex: hex(virtualAddress),
          value,
        });
      }

      const branch = directBranchTarget(instruction);
      const target = branch ? targetByAddress.get(branch.targetAddress) : null;
      if (branch && target) {
        calls.push({
          callAddress: address,
          callAddressHex: hex(address),
          mode: branch.mode,
          targetName: target.name,
          targetAddress: target.address,
          targetAddressHex: hex(target.address),
          opcodeHex: instruction.opcodeHex,
        });
      }
    }
    const uniqueStrings = uniqueByKey(strings, (row) => `${row.addressHex}:${row.value}`).sort((a, b) =>
      a.address - b.address,
    );
    const uniqueCalls = uniqueByKey(calls, (row) => `${row.callAddressHex}:${row.targetName}`).sort((a, b) =>
      a.callAddress - b.callAddress,
    );
    const stringValues = uniqueStrings.map((row) => row.value);
    rows.push({
      callerAddress,
      callerAddressHex: hex(callerAddress),
      mode: caller.mode,
      instructionHex: caller.instructionHex || caller.opcodeHex || "",
      classification: classifyDescriptorPayloadResolverShimCaller(callerAddress, stringValues),
      stringValues,
      stringReferences: uniqueStrings,
      callTargets: uniqueCalls,
    });
  }
  return rows.sort((a, b) => a.callerAddress - b.callerAddress);
}

function classifyRuntimeResourceKeyPostAccessorCaller(callerAddress, stringValues, callTargets) {
  const joined = stringValues.join("\n");
  const targetNames = new Set(callTargets.map((target) => target.targetName));
  if (callerAddress === addresses.runtimeResolvedKeyObjectRequestPostAccessorCallsite) {
    return "runtime-request-resolved-key-level-setup-query";
  }
  if (
    (joined.includes("preferredBuildPath") || joined.includes("Settings")) &&
    !targetNames.has("levelSetupRegisteredCallback") &&
    !targetNames.has("levelRuntimeOwnerDispatch") &&
    !targetNames.has("levelRuntimeVisualsLoader") &&
    !targetNames.has("levelVisualsApplyProcessor") &&
    !targetNames.has("sceneProbeProfilePayloadLoad")
  ) {
    return "settings-preferred-build-path";
  }
  return stringValues.length ? "string-backed-runtime-key-post-accessor" : "unclassified-runtime-key-post-accessor";
}

function scanRuntimeResourceKeyPostAccessorCallerContexts(
  buffer,
  elf,
  callerRecords,
  beforeBytes = 0x180,
  afterBytes = 0x220,
) {
  const interestingTargets = [
    "runtimeResourceKeyResolvedAccessor",
    "runtimeResourceKeyPostAccessor",
    "runtimeResourceKeyGlobalSetter",
    "runtimeResourceKeyGlobalResolver",
    "runtimeResourceKeyStatusPredicate",
    "genericCallbackDispatchHelper",
    "genericCallbackIndexQuery",
    "levelSetupRegisteredCallback",
    "levelRuntimeOwnerDispatch",
    "levelRuntimeVisualsLoader",
    "levelVisualsApplyProcessor",
    "sceneProbeProfilePayloadLoad",
    "characterLobbyModeSwitcher",
  ]
    .map((name) => ({ name, address: addresses[name] }))
    .filter((target) => typeof target.address === "number");
  const strictPreviewTargetNames = new Set([
    "levelSetupRegisteredCallback",
    "levelRuntimeOwnerDispatch",
    "levelRuntimeVisualsLoader",
    "levelVisualsApplyProcessor",
    "sceneProbeProfilePayloadLoad",
  ]);
  const targetByAddress = new Map(interestingTargets.map((target) => [target.address, target]));
  const rows = [];
  for (const caller of callerRecords) {
    const callerAddress = caller.callerAddress;
    if (!Number.isFinite(callerAddress)) continue;
    const registerValues = new Map();
    const strings = [];
    const calls = [];
    const start = callerAddress - beforeBytes;
    const end = callerAddress + afterBytes;
    for (let address = start; address <= end; address += 4) {
      const instruction = readInstruction(buffer, elf, address);
      if (!instruction) continue;

      const adr = parseAdr(instruction);
      if (adr) registerValues.set(adr.register, adr.address);
      const adrp = parseAdrp(instruction);
      if (adrp) registerValues.set(adrp.register, adrp.address);
      const add = parseAddImmediate(instruction);
      if (add && registerValues.has(add.source)) {
        registerValues.set(add.destination, registerValues.get(add.source) + add.immediate);
      }
      const ldr = parseLdrUnsignedImmediate(instruction);
      if (ldr && registerValues.has(ldr.source)) {
        const sourceAddress = registerValues.get(ldr.source) + ldr.immediate;
        const pointer = ldr.width === "x64" ? readPointerAtVirtualAddress(buffer, elf, sourceAddress) : null;
        if (Number.isFinite(pointer)) registerValues.set(ldr.destination, pointer);
      }

      for (const [register, virtualAddress] of registerValues.entries()) {
        const value = readCStringAtVirtualAddress(buffer, elf, virtualAddress);
        if (!value) continue;
        strings.push({
          register,
          address: virtualAddress,
          addressHex: hex(virtualAddress),
          value,
        });
      }

      const branch = directBranchTarget(instruction);
      const target = branch ? targetByAddress.get(branch.targetAddress) : null;
      if (branch && target) {
        calls.push({
          callAddress: address,
          callAddressHex: hex(address),
          mode: branch.mode,
          targetName: target.name,
          targetAddress: target.address,
          targetAddressHex: hex(target.address),
          opcodeHex: instruction.opcodeHex,
        });
      }
    }
    const uniqueStrings = uniqueByKey(strings, (row) => `${row.addressHex}:${row.value}`).sort((a, b) =>
      a.address - b.address,
    );
    const uniqueCalls = uniqueByKey(calls, (row) => `${row.callAddressHex}:${row.targetName}`).sort((a, b) =>
      a.callAddress - b.callAddress,
    );
    const stringValues = uniqueStrings.map((row) => row.value);
    const classification = classifyRuntimeResourceKeyPostAccessorCaller(
      callerAddress,
      stringValues,
      uniqueCalls,
    );
    const strictPreviewCalls = uniqueCalls.filter((row) => strictPreviewTargetNames.has(row.targetName));
    rows.push({
      callerAddress,
      callerAddressHex: hex(callerAddress),
      mode: caller.mode,
      instructionHex: caller.instructionHex || caller.opcodeHex || "",
      classification,
      stringValues,
      stringReferences: uniqueStrings,
      callTargets: uniqueCalls,
      strictPreviewCalls,
      activePreviewCandidate: classification === "runtime-request-resolved-key-level-setup-query",
      negativeEvidence:
        classification === "settings-preferred-build-path"
          ? "local strings bind this post-accessor caller to Settings/preferredBuildPath and no strict Level/Profile/Probe branch is present"
          : "",
      interpretation:
        classification === "runtime-request-resolved-key-level-setup-query"
          ? "This is the only post-accessor caller that continues into the Level setup index query path."
          : classification === "settings-preferred-build-path"
            ? "This caller uses the same cached-key helpers for settings/preferred build path state; it is not active hero/model preview profile selection evidence."
            : "This post-accessor caller is not yet classified by local current-binary evidence.",
    });
  }
  return rows.sort((a, b) => a.callerAddress - b.callerAddress);
}

function classifyRuntimeResourceKeyGlobalResolverCaller(callerAddress, stringValues) {
  const joined = stringValues.join("\n");
  if (callerAddress === 0x81ca98) {
    return "level-definition-manifest-cache-refresh";
  }
  if (callerAddress === 0x826558 || joined.includes("%s/%s.%d.vgr")) {
    return "typed-object-vgr-manifest-input-setup";
  }
  if (joined.includes("*KindredManifest*")) {
    return "level-definition-manifest-cache-refresh";
  }
  if (callerAddress === 0x82b6dc) {
    return "typed-object-inline-key-writer-0x03e9";
  }
  if (callerAddress === 0x8bf578) {
    return "typed-object-runtime-key-selection-0x046f";
  }
  return stringValues.length ? "string-backed-runtime-key-global-resolver" : "unclassified-runtime-key-global-resolver";
}

function scanRuntimeResourceKeyGlobalResolverCallerContexts(
  buffer,
  elf,
  callerRecords,
  beforeBytes = 0x180,
  afterBytes = 0x220,
) {
  const interestingTargets = [
    "runtimeResourceKeyResolvedAccessor",
    "runtimeResourceKeyPostAccessor",
    "runtimeResourceKeyGlobalSetter",
    "runtimeResourceKeyGlobalResolver",
    "runtimeResourceKeyStatusPredicate",
    "genericCallbackDispatchHelper",
    "genericCallbackIndexQuery",
    "descriptorPayloadResolverShim",
    "typedObjectDispatcher",
    "typedObjectVgrPathBuilder",
    "typedObjectVgrOpenFunction",
    "typedObjectVgrReadFunction",
    "typedObjectRuntimeKeySelectionHelper",
    "typedObjectInlineKeyWriterHelper",
    "resourceKeyTableGlobalAccessor",
    "resourceKeyByIdLookup",
    "resourceKeyToStringLookup",
    "levelSetupRegisteredCallback",
    "levelRuntimeOwnerDispatch",
    "levelRuntimeVisualsLoader",
    "levelVisualsApplyProcessor",
    "sceneProbeProfilePayloadLoad",
    "characterLobbyModeSwitcher",
  ]
    .map((name) => ({ name, address: addresses[name] }))
    .filter((target) => typeof target.address === "number");
  const strictPreviewTargetNames = new Set([
    "levelSetupRegisteredCallback",
    "levelRuntimeOwnerDispatch",
    "levelRuntimeVisualsLoader",
    "levelVisualsApplyProcessor",
    "sceneProbeProfilePayloadLoad",
  ]);
  const targetByAddress = new Map(interestingTargets.map((target) => [target.address, target]));
  const rows = [];
  for (const caller of callerRecords) {
    const callerAddress = caller.callerAddress;
    if (!Number.isFinite(callerAddress)) continue;
    const registerValues = new Map();
    const strings = [];
    const calls = [];
    const start = callerAddress - beforeBytes;
    const end = callerAddress + afterBytes;
    for (let address = start; address <= end; address += 4) {
      const instruction = readInstruction(buffer, elf, address);
      if (!instruction) continue;

      const adr = parseAdr(instruction);
      if (adr) registerValues.set(adr.register, adr.address);
      const adrp = parseAdrp(instruction);
      if (adrp) registerValues.set(adrp.register, adrp.address);
      const add = parseAddImmediate(instruction);
      if (add && registerValues.has(add.source)) {
        registerValues.set(add.destination, registerValues.get(add.source) + add.immediate);
      }
      const ldr = parseLdrUnsignedImmediate(instruction);
      if (ldr && registerValues.has(ldr.source)) {
        const sourceAddress = registerValues.get(ldr.source) + ldr.immediate;
        const pointer = ldr.width === "x64" ? readPointerAtVirtualAddress(buffer, elf, sourceAddress) : null;
        if (Number.isFinite(pointer)) registerValues.set(ldr.destination, pointer);
      }

      for (const [register, virtualAddress] of registerValues.entries()) {
        const value = readCStringAtVirtualAddress(buffer, elf, virtualAddress);
        if (!value) continue;
        strings.push({
          register,
          address: virtualAddress,
          addressHex: hex(virtualAddress),
          value,
        });
      }

      const branch = directBranchTarget(instruction);
      const target = branch ? targetByAddress.get(branch.targetAddress) : null;
      if (branch && target) {
        calls.push({
          callAddress: address,
          callAddressHex: hex(address),
          mode: branch.mode,
          targetName: target.name,
          targetAddress: target.address,
          targetAddressHex: hex(target.address),
          opcodeHex: instruction.opcodeHex,
        });
      }
    }
    const uniqueStrings = uniqueByKey(strings, (row) => `${row.addressHex}:${row.value}`).sort((a, b) =>
      a.address - b.address,
    );
    const uniqueCalls = uniqueByKey(calls, (row) => `${row.callAddressHex}:${row.targetName}`).sort((a, b) =>
      a.callAddress - b.callAddress,
    );
    const stringValues = uniqueStrings.map((row) => row.value);
    const classification = classifyRuntimeResourceKeyGlobalResolverCaller(callerAddress, stringValues);
    const strictPreviewCalls = uniqueCalls.filter((row) => strictPreviewTargetNames.has(row.targetName));
    rows.push({
      callerAddress,
      callerAddressHex: hex(callerAddress),
      mode: caller.mode,
      instructionHex: caller.instructionHex || caller.opcodeHex || "",
      classification,
      stringValues,
      stringReferences: uniqueStrings,
      callTargets: uniqueCalls,
      strictPreviewCalls,
      activePreviewCandidate: false,
      negativeEvidence:
        classification !== "unclassified-runtime-key-global-resolver" && strictPreviewCalls.length === 0
          ? "local current-binary context classifies this resolver caller outside the strict Level/Profile/Probe target set"
          : "",
      interpretation:
        classification === "level-definition-manifest-cache-refresh"
          ? "This resolver caller belongs to level-definition manifest/cache refresh, not active hero/model preview profile selection."
          : classification === "typed-object-vgr-manifest-input-setup"
            ? "This resolver caller belongs to typed-object .vgr manifest/input setup, not a proven active preview selector."
            : classification === "typed-object-inline-key-writer-0x03e9"
              ? "This resolver caller follows typed-object 0x03e9 inline key writing; its dispatcher inputs remain stream/.vgr evidence."
              : classification === "typed-object-runtime-key-selection-0x046f"
                ? "This resolver caller follows typed-object 0x046f runtime key selection; it remains stream-driven evidence until a preview source is proven."
                : "This resolver caller is not yet classified by local current-binary evidence.",
    });
  }
  return rows.sort((a, b) => a.callerAddress - b.callerAddress);
}

function buildGenericCallbackDispatchCallsiteContexts(evidence) {
  const matchedByAddress = new Map(evidence.map((row) => [row.address, row.matched]));
  const withEvidence = (row) => ({
    ...row,
    opcodesMatched: row.evidenceAddresses.every((address) => matchedByAddress.get(address) === true),
    evidenceAddressesHex: row.evidenceAddresses.map((address) => hex(address)),
  });
  return [
    withEvidence({
      callsiteName: "level-runtime-visuals-loader-light-placement-dispatch",
      callerAddress: addresses.genericCallbackDispatchCallsiteFromLevelRuntimeVisualsLoader,
      callerAddressHex: hex(addresses.genericCallbackDispatchCallsiteFromLevelRuntimeVisualsLoader),
      callTarget: "genericCallbackDispatch",
      callTargetAddress: addresses.genericCallbackDispatch,
      callTargetAddressHex: hex(addresses.genericCallbackDispatch),
      registrySource: "global-callback-registry",
      registrySourceDetail: "0x188e448 loads global callback registry 0x311a968 into x0",
      descriptorSource: "levelVisualsSecondaryCallbackDescriptorGlobalSlot",
      descriptorSourceAddress: addresses.levelVisualsSecondaryCallbackDescriptorGlobalSlot,
      descriptorSourceAddressHex: hex(addresses.levelVisualsSecondaryCallbackDescriptorGlobalSlot),
      descriptorSourceDetail: "x24 loads global slot 0x2ae29a8, then x1 = [x24]",
      payloadSource: "LevelVisuals +0x48",
      payloadSourceDetail: "x20 is the LevelVisuals object and x2 = [x20 + 0x48], the LightPlacement callback payload",
      classification: "level-visuals-light-placement-dispatch",
      usesLevelSetupRegistryDescriptor: false,
      usesLevelSetupSecondaryDescriptor: false,
      usesResolverOutputDescriptor: false,
      evidenceAddresses: [0x8cbfc4, 0x8cbfc8, 0x8cc030, 0x8cc034, 0x8cc038, 0x8cc03c],
    }),
    withEvidence({
      callsiteName: "level-setup-internal-secondary-dispatch",
      callerAddress: addresses.genericCallbackDispatchCallsiteFromLevelSetup,
      callerAddressHex: hex(addresses.genericCallbackDispatchCallsiteFromLevelSetup),
      callTarget: "genericCallbackDispatch",
      callTargetAddress: addresses.genericCallbackDispatch,
      callTargetAddressHex: hex(addresses.genericCallbackDispatch),
      registrySource: "callback-registry-argument-to-registered-callback",
      registrySourceDetail: "0xc79ad4 preserves incoming x0 in x21, then passes x21 as dispatcher x0",
      descriptorSource: "levelSetupSecondaryResourceGlobalSlot",
      descriptorSourceAddress: addresses.levelSetupSecondaryResourceGlobalSlot,
      descriptorSourceAddressHex: hex(addresses.levelSetupSecondaryResourceGlobalSlot),
      descriptorSourceDetail: "x8 loads global slot 0x2ae7ed8, then x1 = [x8]",
      payloadSource: "active Level +0x158",
      payloadSourceDetail: "x20 is the active Level argument and x2 = [x20 + 0x158]",
      classification: "level-setup-internal-secondary-dispatch",
      usesLevelSetupRegistryDescriptor: false,
      usesLevelSetupSecondaryDescriptor: true,
      usesResolverOutputDescriptor: false,
      evidenceAddresses: [0xc79ae4, 0xc79b04, 0xc79b08, 0xc79b0c, 0xc79b18, 0xc79b1c],
    }),
    withEvidence({
      callsiteName: "global-helper-resolved-descriptor-dispatch",
      callerAddress: addresses.genericCallbackDispatchCallsiteFromGlobalDispatch,
      callerAddressHex: hex(addresses.genericCallbackDispatchCallsiteFromGlobalDispatch),
      callTarget: "genericCallbackDispatch",
      callTargetAddress: addresses.genericCallbackDispatch,
      callTargetAddressHex: hex(addresses.genericCallbackDispatch),
      registrySource: "global-callback-registry",
      registrySourceDetail: "x0 loads global callback registry 0x311a968 before dispatch",
      descriptorSource: "descriptorPayloadResolverShimOutput",
      descriptorSourceAddress: addresses.descriptorPayloadResolverShim,
      descriptorSourceAddressHex: hex(addresses.descriptorPayloadResolverShim),
      descriptorSourceDetail: "0x188cc88 writes matched descriptor to [sp], then x1 = [sp]",
      payloadSource: "descriptorPayloadResolverShimReturn",
      payloadSourceDetail: "0x188cc88 return value is moved into x2 as the matched payload",
      classification: "generic-helper-resolved-descriptor-dispatch",
      usesLevelSetupRegistryDescriptor: false,
      usesLevelSetupSecondaryDescriptor: false,
      usesResolverOutputDescriptor: true,
      evidenceAddresses: [0x188e3c0, 0x188e3c4, 0x188e3cc, 0x188e3d4, 0x188e3d8, 0x188e3e4, 0x188e3e8, 0x188e3ec],
    }),
  ];
}

function buildGenericCallbackDispatchHelperCallsiteContexts(evidence) {
  const matchedByAddress = new Map(evidence.map((row) => [row.address, row.matched]));
  const withEvidence = (row) => ({
    ...row,
    opcodesMatched: row.evidenceAddresses.every((address) => matchedByAddress.get(address) === true),
    evidenceAddressesHex: row.evidenceAddresses.map((address) => hex(address)),
  });
  return [
    withEvidence({
      callsiteName: "manifest-fallback-a",
      callerAddress: addresses.genericCallbackDispatchHelperCallsiteManifestA,
      callerAddressHex: hex(addresses.genericCallbackDispatchHelperCallsiteManifestA),
      classification: "level-definition-manifest-fallback",
      keySource: "*KindredManifest*",
      keySourceAddress: addresses.kindredManifestSymbolString,
      keySourceAddressHex: hex(addresses.kindredManifestSymbolString),
      outputListSource: "none",
      payloadCount: -1,
      contextSource: "none",
      postDispatchPath: "level-definition-manifest setup",
      hasLevelSetupIndexQueryAfterDispatch: false,
      activePreviewCandidate: false,
      evidenceAddresses: [0x81c970, 0x81c974, 0x81c9a8],
    }),
    withEvidence({
      callsiteName: "manifest-fallback-b",
      callerAddress: addresses.genericCallbackDispatchHelperCallsiteManifestB,
      callerAddressHex: hex(addresses.genericCallbackDispatchHelperCallsiteManifestB),
      classification: "level-definition-manifest-fallback",
      keySource: "*KindredManifest*",
      keySourceAddress: addresses.kindredManifestSymbolString,
      keySourceAddressHex: hex(addresses.kindredManifestSymbolString),
      outputListSource: "none",
      payloadCount: -1,
      contextSource: "none",
      postDispatchPath: "level-definition-manifest cache refresh",
      hasLevelSetupIndexQueryAfterDispatch: false,
      activePreviewCandidate: false,
      evidenceAddresses: [0x81ca5c, 0x81ca60, 0x81ca94],
    }),
    withEvidence({
      callsiteName: "manifest-fallback-c",
      callerAddress: addresses.genericCallbackDispatchHelperCallsiteManifestC,
      callerAddressHex: hex(addresses.genericCallbackDispatchHelperCallsiteManifestC),
      classification: "level-definition-manifest-fallback",
      keySource: "*KindredManifest*",
      keySourceAddress: addresses.kindredManifestSymbolString,
      keySourceAddressHex: hex(addresses.kindredManifestSymbolString),
      outputListSource: "none",
      payloadCount: -1,
      contextSource: "none",
      postDispatchPath: ".vgr manifest/input setup",
      hasLevelSetupIndexQueryAfterDispatch: false,
      activePreviewCandidate: false,
      evidenceAddresses: [0x82651c, 0x826520, 0x826554],
    }),
    withEvidence({
      callsiteName: "runtime-request-pre-owner-dispatch",
      callerAddress: addresses.genericCallbackDispatchHelperCallsiteRuntimeA,
      callerAddressHex: hex(addresses.genericCallbackDispatchHelperCallsiteRuntimeA),
      classification: "runtime-request-temporary-key-pre-owner",
      keySource: "cached resolved runtime key object +0x8 copied into a stack string by 0xbe3a4c",
      keySourceAddress: 0xbe3a60,
      keySourceAddressHex: hex(0xbe3a60),
      outputListSource: "none",
      payloadCount: -1,
      contextSource: "runtime owner/context x19",
      postDispatchPath: "owner-resolve registry index 0x3034d00 lookup through 0x188b8b8",
      hasLevelSetupIndexQueryAfterDispatch: false,
      activePreviewCandidate: false,
      evidenceAddresses: [0x8bef40, 0x8bef48, 0xbe3a5c, 0xbe3a60, 0xbe3a70, 0x8bef58, 0x8bef64, 0x8bef68, 0x8bef6c, 0x8bef88, 0x8bef90],
    }),
    withEvidence({
      callsiteName: "runtime-request-resolved-key-level-setup-query",
      callerAddress: addresses.genericCallbackDispatchHelperCallsiteRuntimeB,
      callerAddressHex: hex(addresses.genericCallbackDispatchHelperCallsiteRuntimeB),
      classification: "runtime-request-resolved-key-level-setup-query",
      keySource: "cached runtime resource key from 0xbebf54 normalized through 0xbec044",
      keySourceAddress: addresses.runtimeResourceKeyResolvedAccessor,
      keySourceAddressHex: hex(addresses.runtimeResourceKeyResolvedAccessor),
      outputListSource: "none",
      payloadCount: 1,
      contextSource: "owner-resolve object returned by 0x188b8b8",
      postDispatchPath: "Level setup index 0x2d44e98 query through 0x188e540, then context +0x140/+0x148 processors",
      hasLevelSetupIndexQueryAfterDispatch: true,
      activePreviewCandidate: true,
      evidenceAddresses: [0x8bef98, 0x8bef9c, 0x8befa0, 0x8befa4, 0x8befa8, 0x8befac, 0x8befdc, 0x8befec],
    }),
    withEvidence({
      callsiteName: "object-builder-a-resource-key-request",
      callerAddress: addresses.genericCallbackDispatchHelperCallsiteObjectBuilderA,
      callerAddressHex: hex(addresses.genericCallbackDispatchHelperCallsiteObjectBuilderA),
      classification: "object-builder-resource-key-request",
      keySource: "resource key table lookup from object-builder A input +0x1c",
      keySourceAddress: addresses.resourceKeyByIdLookup,
      keySourceAddressHex: hex(addresses.resourceKeyByIdLookup),
      outputListSource: "stack output pointer sp",
      payloadCount: 1,
      contextSource: "none",
      postDispatchPath: "object-builder A populates returned object fields",
      hasLevelSetupIndexQueryAfterDispatch: false,
      activePreviewCandidate: false,
      evidenceAddresses: [0xc03734, 0xc0373c, 0xc03740, 0xc03744, 0xc03748, 0xc0374c],
    }),
    withEvidence({
      callsiteName: "object-builder-b-resource-key-level-setup-query",
      callerAddress: addresses.genericCallbackDispatchHelperCallsiteObjectBuilderB,
      callerAddressHex: hex(addresses.genericCallbackDispatchHelperCallsiteObjectBuilderB),
      classification: "object-builder-resource-key-level-setup-query",
      keySource: "resource key table lookup from typed-object 0x03f3/object-builder B input +0x1c",
      keySourceAddress: addresses.resourceKeyByIdLookup,
      keySourceAddressHex: hex(addresses.resourceKeyByIdLookup),
      outputListSource: "stack output pointer sp+0x18",
      payloadCount: 1,
      contextSource: "none",
      postDispatchPath: "object-builder B later queries Level setup index 0x2d44e98 through 0x188e540",
      hasLevelSetupIndexQueryAfterDispatch: true,
      activePreviewCandidate: false,
      replayStreamCandidate: true,
      evidenceAddresses: [0xc04b7c, 0xc04b88, 0xc04b8c, 0xc04b90, 0xc04b94, 0xc04b98, 0xc04c0c, 0xc04c20],
    }),
  ];
}

function buildRuntimeResourceKeySetterInputContexts(evidence) {
  const matchedByAddress = new Map(evidence.map((row) => [row.address, row.matched]));
  const withEvidence = (row) => ({
    ...row,
    opcodesMatched: row.evidenceAddresses.every((address) => matchedByAddress.get(address) === true),
    evidenceAddressesHex: row.evidenceAddresses.map((address) => hex(address)),
    staticConcreteKeyRecoverable: false,
    requiresRuntimeCapture: true,
  });
  return [
    withEvidence({
      callerAddress: 0x8bf574,
      callerAddressHex: hex(0x8bf574),
      sourceOwner: "typed-object-runtime-key-selection-0x046f",
      sourceKind: "function-arg1-libcxx-string",
      sourceOffset: "",
      sourceDescription:
        "0x82d870 copies the 0x046f payload-leading string and calls 0x8bf530; 0x8bf530 preserves arg1 in x20 and passes it to 0xbebf7c.",
      concreteKeyBlocker:
        "The key value is runtime payload data, not a static C string at the setter callsite.",
      activePreviewProof: false,
      evidenceAddresses: [0x82d8a4, 0x82d8c0, 0x8bf550, 0x8bf570, 0x8bf574, 0x8bf578],
    }),
    withEvidence({
      callerAddress: 0x82b6c0,
      callerAddressHex: hex(0x82b6c0),
      sourceOwner: "typed-object-inline-key-writer-0x03e9",
      sourceKind: "typed-object-payload-cstring",
      sourceOffset: "payload +0x20",
      sourceDescription:
        "0x82b68c receives the decoded 0x03e9 payload, copies payload +0x20 into a temporary libc++ string, then writes it through 0xbebf7c.",
      concreteKeyBlocker:
        "The key value is decoded typed-object payload data; no confirmed local .vgr/frame payload has been imported.",
      activePreviewProof: false,
      evidenceAddresses: [0x82dcd8, 0x82dcdc, 0x82b6ac, 0x82b6b8, 0x82b6c0, 0x82b6dc],
    }),
    withEvidence({
      callerAddress: 0xa7ca68,
      callerAddressHex: hex(0xa7ca68),
      sourceOwner: "character-lobby-key-switch",
      sourceKind: "record-cstring",
      sourceOffset: "record +0x4",
      sourceDescription:
        "0xa7ca30 receives a lobby key-switch record, copies record +0x4 into a temporary string, writes it through 0xbebf7c, then dispatches only lobby mode/state.",
      concreteKeyBlocker:
        "The record value is runtime UI/state data and the local branch only reaches lobby mode switching, not LevelVisuals/Profile code.",
      activePreviewProof: false,
      evidenceAddresses: [0xa7ca54, 0xa7ca60, 0xa7ca68, 0xa7cac0, 0xa7cac4, 0xa7cae0],
    }),
  ];
}

function buildRuntimeResourceKeyUpstreamRecoveryAudit({
  evidence,
  typedObjectDispatcherInputSourceProfileBranches,
  typedObjectVgrLocalFileCandidates,
  typedObjectRawIosDataAudit,
  typedObjectRawIosDataDeepHashAudit,
  typedObjectVgrPathFormatStringValue,
  typedObjectReplayBaseNameStringValue,
  typedObjectReplayManifestNameStringValue,
  characterLobbyRuntimeProfileBranches,
  characterLobbyStateObjectProfileBranches,
}) {
  const matchedByAddress = new Map(evidence.map((row) => [row.address, row.matched]));
  const opcodesMatched = (addressesToCheck) =>
    addressesToCheck.every((address) => matchedByAddress.get(address) === true);
  const profileBranchCountFor = (nameIncludes) =>
    (typedObjectDispatcherInputSourceProfileBranches || []).filter((row) =>
      String(row.centerName || "").includes(nameIncludes),
    ).length;
  const localVgrCandidateCount = typedObjectVgrLocalFileCandidates.length;
  const rawDeepResourceLikeKeyCandidateCount =
    typedObjectRawIosDataAudit?.deepScanResourceLikeKeyFrameCandidateCount || 0;
  const rawDeepObjectBuilderHashMatchCount =
    typedObjectRawIosDataDeepHashAudit?.engineHashMatchCount || 0;
  const sources = [
    {
      sourceId: "typed-object-frame-stream",
      status: "bounded-requires-live-frame-capture",
      dispatcherCallsiteHex: hex(addresses.typedObjectDispatcherFrameCallerCallsite),
      concretePayloadRecovered: false,
      activePreviewProof: false,
      strictProfileBranchCount: profileBranchCountFor("Frame"),
      payloadClasses: ["0x03f3 object-builder word0", "0x046f payload-leading key", "0x03e9 payload +0x20 key"],
      evidenceAddressesHex: [
        0x8130b0,
        0x8130ec,
        0x813108,
        0x813184,
        0x81318c,
        0x813190,
        0x8131fc,
        0x81321c,
        0x81322c,
      ].map(hex),
      opcodesMatched: opcodesMatched([
        0x8130b0,
        0x8130ec,
        0x813108,
        0x813184,
        0x81318c,
        0x813190,
        0x8131fc,
        0x81321c,
        0x81322c,
      ]),
      blocker:
        "The current binary proves a two-byte framed stream buffer feeding the typed-object dispatcher, but no live frame payload has been captured or imported.",
    },
    {
      sourceId: "typed-object-timed-vgr-queue",
      status: localVgrCandidateCount > 0 ? "local-vgr-candidates-need-decoder" : "bounded-no-local-vgr-payload",
      dispatcherCallsiteHex: hex(addresses.typedObjectDispatcherTimedQueueCallerCallsite),
      concretePayloadRecovered: false,
      activePreviewProof: false,
      strictProfileBranchCount: profileBranchCountFor("Timed"),
      localVgrCandidateCount,
      pathFormatString: typedObjectVgrPathFormatStringValue || "",
      replayBaseName: typedObjectReplayBaseNameStringValue || "",
      replayManifestName: typedObjectReplayManifestNameStringValue || "",
      payloadClasses: ["0x03f3 object-builder word0", "0x046f payload-leading key", "0x03e9 payload +0x20 key"],
      evidenceAddressesHex: [
        0x8444e4,
        0x844508,
        0x84453c,
        0x84455c,
        0x844580,
        0x844588,
        0x844594,
        0x825ff4,
        0x826000,
        0x825ac0,
        0x825ac4,
        0xd6e16c,
      ].map(hex),
      opcodesMatched: opcodesMatched([
        0x8444e4,
        0x844508,
        0x84453c,
        0x84455c,
        0x844580,
        0x844588,
        0x844594,
        0x825ff4,
        0x826000,
        0x825ac0,
        0x825ac4,
        0xd6e16c,
      ]),
      blocker:
        "The .vgr/timed queue reader is opcode-proven, but the extracted roots currently do not provide a decoded replay/frame payload that can supply the concrete active key.",
    },
    {
      sourceId: "local-ios-raw-data-reservoir",
      status:
        rawDeepResourceLikeKeyCandidateCount === 0 && rawDeepObjectBuilderHashMatchCount === 0
          ? "scanned-no-usable-runtime-key"
          : "candidate-payloads-need-manual-decoder-review",
      concretePayloadRecovered: false,
      activePreviewProof: false,
      scannedFileCount: typedObjectRawIosDataAudit?.deepScanFileCount || 0,
      scannedBytes: typedObjectRawIosDataAudit?.deepScanBytesRead || 0,
      structuralFrameCandidateCount: typedObjectRawIosDataAudit?.deepScanFrameCandidateCount || 0,
      resourceLikeKeyCandidateCount: rawDeepResourceLikeKeyCandidateCount,
      objectBuilderWord0EngineHashMatchCount: rawDeepObjectBuilderHashMatchCount,
      blocker:
        "The local raw Data scan is coverage evidence only; it found no resource-shaped key strings and no object-builder word0 engine-hash match.",
    },
    {
      sourceId: "character-lobby-vtable-record",
      status: "bounded-ui-state-record-no-level-profile-branch",
      callbackAddressHex: hex(addresses.characterLobbyRuntimeKeySwitchCallback),
      thunkAddressHex: hex(addresses.characterLobbyRuntimeKeySwitchThunk),
      concretePayloadRecovered: false,
      activePreviewProof: false,
      strictProfileBranchCount:
        (characterLobbyRuntimeProfileBranches || []).length +
        (characterLobbyStateObjectProfileBranches || []).length,
      recordLayout: [
        { offsetHex: "0x0", meaning: "mode enum 0..4" },
        { offsetHex: "0x4", meaning: "runtime resource-key string" },
      ],
      evidenceAddressesHex: [
        0xa7cb0c,
        0xa7cb10,
        0xa7ca54,
        0xa7ca60,
        0xa7ca68,
        0xa7ca84,
        0xa7ca88,
        0xa7ca90,
        0xa7ca98,
        0xa7caa0,
        0xa7cae0,
      ].map(hex),
      opcodesMatched: opcodesMatched([
        0xa7cb0c,
        0xa7cb10,
        0xa7ca54,
        0xa7ca60,
        0xa7ca68,
        0xa7ca84,
        0xa7ca88,
        0xa7ca90,
        0xa7ca98,
        0xa7caa0,
        0xa7cae0,
      ]),
      blocker:
        "The thunk only adjusts a CharacterLobby subobject pointer before dispatch; the record then feeds lobby mode/state selection, not LevelVisuals/Profile loading.",
    },
  ];
  const sourcesWithStrictProfileBranches = sources.filter((source) => source.strictProfileBranchCount > 0).length;
  return {
    status: "upstream-inputs-bounded-no-decodable-active-preview-payload",
    rendererProfileTakeoverAllowed: false,
    concreteActiveKeyRecovered: false,
    localDecodedPayloadAvailable:
      localVgrCandidateCount > 0 ||
      rawDeepResourceLikeKeyCandidateCount > 0 ||
      rawDeepObjectBuilderHashMatchCount > 0,
    sources,
    sourceCount: sources.length,
    sourcesWithStrictProfileBranches,
    requiredNextEvidence: [
      "live framed-stream capture containing the active 0x8befac key sequence",
      "decoded .vgr/timed queue payload with 0x03f3/0x046f/0x03e9 records tied to the active preview Level",
      "a proven non-stream current-package path that writes record +0x4 and reaches LevelVisuals/Profile code",
    ],
    interpretation:
      "The upstream inputs to all known runtime key setters are now bounded as stream/frame, timed .vgr, raw-data reservoir, or CharacterLobby record evidence. None supplies a concrete active hero/model preview Level/Profile key without runtime capture or a payload decoder.",
  };
}

function buildTypedObjectInputSourceOwnershipAudit({
  evidence,
  referenceByName,
  typedObjectDispatcherInputSourceProfileBranches,
}) {
  const matchedByAddress = new Map(evidence.map((row) => [row.address, row.matched]));
  const opcodesMatched = (addressesToCheck) =>
    addressesToCheck.every((address) => matchedByAddress.get(address) === true);
  const refsFor = (name) =>
    referenceByName.get(name) || { directCallers: [], u64References: [], textReferences: [] };
  const directCallerHexes = (name) => refsFor(name).directCallers.map((caller) => caller.callerAddressHex);
  const u64ReferenceHexes = (name) => refsFor(name).u64References.map((reference) => reference.virtualAddressHex);
  const textReferenceHexes = (name) => refsFor(name).textReferences.map((reference) => reference.xrefAddressHex);

  const sourceOwners = [
    {
      sourceId: "frame-buffer-source-vtable",
      status: "recovered-current-binary-frame-buffer-owner",
      constructorAddressHex: hex(addresses.typedObjectFrameSourceConstructor),
      vtableAddressPointHex: hex(addresses.typedObjectFrameSourceVtableAddressPoint),
      dispatcherSlotFunctionHex: hex(addresses.typedObjectDispatcherFrameStreamFunction),
      dispatcherCallsiteHex: hex(addresses.typedObjectDispatcherFrameCallerCallsite),
      objectLayout: [
        { offsetHex: "0x0", meaning: "vtable addresspoint 0x26bf328" },
        { offsetHex: "0x8", meaning: "0x2800 byte framed payload buffer" },
        { offsetHex: "0x2808", meaning: "buffered byte count" },
        { offsetHex: "0x280c", meaning: "pending/reset byte" },
      ],
      directCallersHex: directCallerHexes("typedObjectFrameSourceConstructor"),
      vtableDataReferenceHexes: u64ReferenceHexes("typedObjectDispatcherFrameStreamFunction"),
      evidenceAddressesHex: [
        0x812fd8,
        0x812fdc,
        0x812fe0,
        0x812fe4,
        0x812fe8,
        0x812ff0,
        0x813028,
        0x813054,
        0x81309c,
        0x8130a0,
        0x8130b0,
        0x8130ec,
        0x813184,
        0x8131fc,
        0x81321c,
      ].map(hex),
      opcodesMatched: opcodesMatched([
        0x812fd8,
        0x812fdc,
        0x812fe0,
        0x812fe4,
        0x812fe8,
        0x812ff0,
        0x813028,
        0x813054,
        0x81309c,
        0x8130a0,
        0x8130b0,
        0x8130ec,
        0x813184,
        0x8131fc,
        0x81321c,
      ]),
      activePreviewProof: false,
      blocker:
        "This proves the framed typed-object stream owner and buffer layout, but no active hero/model preview frame payload is decoded.",
    },
    {
      sourceId: "timed-vgr-source-vtable",
      status: "recovered-current-binary-timed-vgr-owner",
      constructorAddressHex: hex(addresses.typedObjectTimedSourceConstructorA),
      vtableAddressPointHex: hex(addresses.typedObjectTimedSourceVtableAddressPoint),
      childFrameSourceOffsetHex: "0x6d0",
      childFrameConstructorAddressHex: hex(addresses.typedObjectFrameSourceConstructor),
      dispatcherSlotFunctionHex: hex(addresses.typedObjectDispatcherTimedQueueFunction),
      dispatcherCallsiteHex: hex(addresses.typedObjectDispatcherTimedQueueCallerCallsite),
      directCallersHex: directCallerHexes("typedObjectTimedSourceConstructorA"),
      childFrameConstructorCallerHexes: directCallerHexes("typedObjectFrameSourceConstructor"),
      vtableDataReferenceHexes: u64ReferenceHexes("typedObjectDispatcherTimedQueueFunction"),
      evidenceAddressesHex: [
        0x8440e8,
        0x8440ec,
        0x8440f0,
        0x8440f8,
        0x844100,
        0x84412c,
        0x844164,
        0x844194,
        0x8441a0,
        0x8441ac,
        0x8441cc,
        0x8441d0,
        0x8444e4,
        0x84453c,
        0x84455c,
        0x844580,
        0x844588,
      ].map(hex),
      opcodesMatched: opcodesMatched([
        0x8440e8,
        0x8440ec,
        0x8440f0,
        0x8440f8,
        0x844100,
        0x84412c,
        0x844164,
        0x844194,
        0x8441a0,
        0x8441ac,
        0x8441cc,
        0x8441d0,
        0x8444e4,
        0x84453c,
        0x84455c,
        0x844580,
        0x844588,
      ]),
      activePreviewProof: false,
      blocker:
        "This proves a timed .vgr source owner with an owned framed-stream child at +0x6d0, but it is still replay/stream input evidence rather than the active preview profile payload.",
    },
    {
      sourceId: "alternate-replay-source-vtable",
      status: "recovered-current-binary-alternate-replay-owner",
      constructorAddressHex: hex(addresses.typedObjectAlternateReplaySourceConstructor),
      vtableAddressPointHex: hex(addresses.typedObjectAlternateReplaySourceVtableAddressPoint),
      replayInputSetupAddressHex: hex(addresses.typedObjectVgrReplayInputSetup),
      vgrReadCallsiteHexes: [0x826580, 0x8265b4, 0x826608, 0x82662c].map(hex),
      recordAppendCallsiteHex: hex(0x826590),
      recordDecodeCallsiteHex: hex(0x8265a0),
      directCallersHex: directCallerHexes("typedObjectAlternateReplaySourceConstructor"),
      vtableDataReferenceHexes: u64ReferenceHexes("typedObjectAlternateReplaySourceVtableAddressPoint"),
      evidenceAddressesHex: [
        0x844420,
        0x844424,
        0x84442c,
        0x844438,
        0x844440,
        0x82648c,
        0x826554,
        0x826580,
        0x826590,
        0x8265a0,
        0x826608,
        0x82662c,
      ].map(hex),
      opcodesMatched: opcodesMatched([
        0x844420,
        0x844424,
        0x84442c,
        0x844438,
        0x844440,
        0x82648c,
        0x826554,
        0x826580,
        0x826590,
        0x8265a0,
        0x826608,
        0x82662c,
      ]),
      activePreviewProof: false,
      blocker:
        "This proves an alternate replay/input setup source and its .vgr read/decode loop, not a concrete active hero/model preview Level/Profile key.",
    },
    {
      sourceId: "global-replay-source-selector",
      status: "recovered-current-binary-source-selector",
      selectorAddressHex: hex(addresses.typedObjectReplaySourceSelector),
      globalSourceSlotHex: hex(addresses.typedObjectReplaySourceGlobalSlot),
      modes: [
        {
          mode: 0,
          source: "timed-vgr-source-vtable",
          allocAddressHex: hex(addresses.typedObjectReplaySourceModeTimedAllocCallsite),
          objectSizeHex: "0x6d8",
          vtableAddressPointHex: hex(addresses.typedObjectTimedSourceVtableAddressPoint),
        },
        {
          mode: 1,
          source: "alternate-replay-source-vtable",
          allocAddressHex: hex(addresses.typedObjectReplaySourceModeAlternateAllocCallsite),
          objectSizeHex: "0x820",
          vtableAddressPointHex: hex(addresses.typedObjectAlternateReplaySourceVtableAddressPoint),
        },
      ],
      forwarderSlots: [
        { slotHex: "0x10", forwarderAddressHex: hex(addresses.typedObjectReplaySourceSlot10Forwarder) },
        { slotHex: "0x20", forwarderAddressHex: hex(addresses.typedObjectReplaySourceSlot20Forwarder) },
        { slotHex: "0x28", forwarderAddressHex: hex(addresses.typedObjectReplaySourceSlot28Forwarder) },
        { slotHex: "0x30", forwarderAddressHex: hex(addresses.typedObjectReplaySourceSlot30Forwarder) },
        { slotHex: "0x38", forwarderAddressHex: hex(addresses.typedObjectReplaySourceSlot38Forwarder) },
        { slotHex: "0x40", forwarderAddressHex: hex(addresses.typedObjectReplaySourceSlot40Forwarder) },
        { slotHex: "0x68", forwarderAddressHex: hex(addresses.typedObjectReplaySourceSlot68Forwarder) },
        { slotHex: "0x78", forwarderAddressHex: hex(addresses.typedObjectReplaySourceSlot78Forwarder) },
        { slotHex: "0x80", forwarderAddressHex: hex(addresses.typedObjectReplaySourceSlot80Forwarder) },
      ],
      globalSlotTextReferenceHexes: textReferenceHexes("typedObjectReplaySourceGlobalSlot"),
      globalSlotStoreAddressHex: hex(addresses.typedObjectReplaySourceGlobalStore),
      evidenceAddressesHex: [
        0x844624,
        0x844638,
        0x844644,
        0x844650,
        0x844658,
        0x844668,
        0x844670,
        0x844674,
        0x84467c,
        0x844684,
        0x8446a0,
        0x8446a8,
        0x8446b0,
        0x8446bc,
        0x8446d0,
        0x844790,
        0x84479c,
      ].map(hex),
      opcodesMatched: opcodesMatched([
        0x844624,
        0x844638,
        0x844644,
        0x844650,
        0x844658,
        0x844668,
        0x844670,
        0x844674,
        0x84467c,
        0x844684,
        0x8446a0,
        0x8446a8,
        0x8446b0,
        0x8446bc,
        0x8446d0,
        0x844790,
        0x84479c,
      ]),
      activePreviewProof: false,
      blocker:
        "The selector proves mode 0 timed/vgr and mode 1 alternate replay source creation plus global source forwarding. It still does not decode the active preview key or Level/Profile payload.",
    },
    {
      sourceId: "vgr-reader-callers",
      status: "recovered-current-binary-reader-callsite-set",
      vgrOpenFunctionHex: hex(addresses.typedObjectVgrOpenFunction),
      vgrReadFunctionHex: hex(addresses.typedObjectVgrReadFunction),
      pathBuilderFunctionHex: hex(addresses.typedObjectVgrPathBuilder),
      vgrReadDirectCallerHexes: directCallerHexes("typedObjectVgrReadFunction"),
      vgrOpenDirectCallerHexes: directCallerHexes("typedObjectVgrOpenFunction"),
      pathBuilderDirectCallerHexes: directCallerHexes("typedObjectVgrPathBuilder"),
      evidenceAddressesHex: [0x825fd0, 0x825ff4, 0x826000, 0x825ac0, 0x825ac4, 0x82599c, 0x8259a0].map(hex),
      opcodesMatched: opcodesMatched([0x825fd0, 0x825ff4, 0x826000, 0x825ac0, 0x825ac4, 0x82599c, 0x8259a0]),
      activePreviewProof: false,
      blocker:
        "The reader callsite set bounds the .vgr input machinery, but no local decoded .vgr/frame payload is currently available.",
    },
  ];

  const ownershipRecovered = sourceOwners.every((source) => source.opcodesMatched);
  const strictProfileBranchCount = (typedObjectDispatcherInputSourceProfileBranches || []).length;
  return {
    status: ownershipRecovered
      ? "current-binary-replay-stream-source-ownership-recovered-no-active-preview-payload"
      : "incomplete-current-binary-replay-stream-source-ownership",
    recovered: ownershipRecovered,
    rendererProfileTakeoverAllowed: false,
    activePreviewProof: false,
    concreteActiveKeyRecovered: false,
    decodedActivePreviewPayloadAvailable: false,
    globalSourceSlotHex: hex(addresses.typedObjectReplaySourceGlobalSlot),
    modeCount: 2,
    sourceOwners,
    sourceOwnerCount: sourceOwners.length,
    strictProfileBranchCount,
    requiredNextEvidence: [
      "decoded live frame payload for the current preview session",
      "decoded .vgr/timed queue payload tied to the active hero/model preview",
      "a non-replay current-package active-preview selector that reaches Level setup descriptor 0x2ae61c8",
    ],
    blocker:
      "This proves typed-object replay/stream source ownership, not the active hero/model preview Level/Profile key. It still lacks decoded payload capture and strict Level/Profile branches.",
    interpretation:
      "The typed-object source owner is now vtable-bounded: frame source addresspoint 0x26bf328; timed source addresspoint 0x26c0ad0; timed source owns a frame child at +0x6d0 constructed by 0x812fd0; global selector at 0x844624 stores current source at 0x2b82450; mode 0 = timed/vgr, mode 1 = alternate replay source. This is guardrail evidence until a concrete active preview payload is decoded.",
  };
}

function buildTypedObjectReplaySourceSelectorCallerAudit({
  evidence,
  referenceByName,
  typedObjectReplaySourceSelectorProfileBranches,
}) {
  const matchedByAddress = new Map(evidence.map((row) => [row.address, row.matched]));
  const opcodesMatched = (addressesToCheck) =>
    addressesToCheck.every((address) => matchedByAddress.get(address) === true);
  const refsFor = (name) =>
    referenceByName.get(name) || { directCallers: [], u64References: [], textReferences: [] };
  const selectorDirectCallers = refsFor("typedObjectReplaySourceSelector").directCallers || [];
  const selectorDirectCallerHexes = selectorDirectCallers.map((caller) => caller.callerAddressHex);
  const callerContexts = [
    {
      callsiteId: "runtime-switch-mode-one-or-zero",
      callerAddressHex: hex(addresses.typedObjectReplaySourceSelectorRuntimeSwitchCaller),
      selectorCallsiteHex: hex(addresses.typedObjectReplaySourceSelectorRuntimeSwitchCallsite),
      modeSource: "branch-local constant",
      possibleModes: [1, 0],
      modeValueAddressesHex: [
        hex(addresses.typedObjectReplaySourceSelectorRuntimeSwitchModeOneValue),
        hex(addresses.typedObjectReplaySourceSelectorRuntimeSwitchModeZeroValue),
      ],
      preSelectorActions: [
        "flush current source through global forwarder slot +0x38 at 0x844790",
        "reset/cleanup global source through 0x8446ec",
      ],
      classification: "runtime-replay-source-switch",
      activePreviewProof: false,
      evidenceAddressesHex: [0x81b118, 0x81b120, 0x81b130, 0x81b138, 0x81b13c].map(hex),
      opcodesMatched: opcodesMatched([0x81b118, 0x81b120, 0x81b130, 0x81b138, 0x81b13c]),
      blocker:
        "The caller switches replay/input source mode with local constants, but its neighborhood has no strict Level/Profile/Probe branch and no decoded active preview payload.",
    },
    {
      callsiteId: "startup-init-mode-zero",
      callerAddressHex: hex(addresses.typedObjectReplaySourceSelectorStartupInitCaller),
      selectorCallsiteHex: hex(addresses.typedObjectReplaySourceSelectorStartupInitCallsite),
      modeSource: "local constant",
      possibleModes: [0],
      allocatorCallerAddressHex: hex(addresses.typedObjectReplaySourceSelectorStartupAllocator),
      allocatorTailCallsiteHex: hex(addresses.typedObjectReplaySourceSelectorStartupAllocatorCallsite),
      classification: "startup-replay-source-init",
      activePreviewProof: false,
      evidenceAddressesHex: [0x81bd54, 0x81bd58, 0x8225f0, 0x822620].map(hex),
      opcodesMatched: opcodesMatched([0x81bd54, 0x81bd58, 0x8225f0, 0x822620]),
      blocker:
        "The startup path allocates the owner object and initializes selector mode 0, but it is lifecycle setup, not an active hero/model preview Level/Profile selector.",
    },
    {
      callsiteId: "mode-zero-thunk",
      callerAddressHex: hex(addresses.typedObjectReplaySourceSelectorModeZeroThunk),
      selectorCallsiteHex: hex(addresses.typedObjectReplaySourceSelectorModeZeroThunkCallsite),
      modeSource: "local constant",
      possibleModes: [0],
      classification: "mode-zero-wrapper",
      activePreviewProof: false,
      evidenceAddressesHex: [0x81bf54, 0x81bf58].map(hex),
      opcodesMatched: opcodesMatched([0x81bf54, 0x81bf58]),
      blocker:
        "This wrapper only tail-calls the selector with mode 0 and supplies no Level/Profile payload evidence.",
    },
  ];
  const directCallerSetRecovered =
    selectorDirectCallerHexes.length === 3 &&
    selectorDirectCallerHexes.includes(hex(addresses.typedObjectReplaySourceSelectorRuntimeSwitchCallsite)) &&
    selectorDirectCallerHexes.includes(hex(addresses.typedObjectReplaySourceSelectorStartupInitCallsite)) &&
    selectorDirectCallerHexes.includes(hex(addresses.typedObjectReplaySourceSelectorModeZeroThunkCallsite));
  const strictProfileBranchCount = (typedObjectReplaySourceSelectorProfileBranches || []).length;
  return {
    status:
      directCallerSetRecovered && callerContexts.every((row) => row.opcodesMatched)
        ? "selector-callers-bounded-no-active-preview-branch"
        : "selector-callers-incomplete",
    recovered: directCallerSetRecovered && callerContexts.every((row) => row.opcodesMatched),
    rendererProfileTakeoverAllowed: false,
    activePreviewProof: false,
    selectorAddressHex: hex(addresses.typedObjectReplaySourceSelector),
    selectorDirectCallerHexes,
    selectorDirectCallerCount: selectorDirectCallerHexes.length,
    modeZeroCallerCount: callerContexts.filter((row) => row.possibleModes.includes(0)).length,
    modeOneCallerCount: callerContexts.filter((row) => row.possibleModes.includes(1)).length,
    strictProfileBranchCount,
    callerContexts,
    blocker:
      "The replay source selector caller set is bounded to lifecycle/switch wrappers with local mode constants. None proves the active hero/model preview Level/Profile payload.",
    interpretation:
      "The source selector at 0x844624 is called by startup/init mode 0, a mode-zero thunk, and one runtime replay-source switch that chooses mode 1 or mode 0 before reinitializing the global source. This is replay/input lifecycle evidence, not active preview profile selection.",
  };
}

function buildRuntimeResolvedKeyIndexQueryConsumerAudit({
  evidence,
  runtimeResolvedKeyLocalConsumerBranches,
}) {
  const matchedByAddress = new Map(evidence.map((row) => [row.address, row.matched]));
  const opcodesMatched = (addressesToCheck) =>
    addressesToCheck.every((address) => matchedByAddress.get(address) === true);
  const indexQueryBranches = uniqueByKey(
    (runtimeResolvedKeyLocalConsumerBranches || []).filter(
      (row) => row.targetName === "genericCallbackIndexQuery",
    ),
    (row) => row.branchAddressHex,
  );
  const knownQueryCallsites = new Set([
    hex(addresses.runtimeResolvedKeyObjectRequestIndexQueryCallsite),
    hex(addresses.runtimePlayerLockResolvedKeyQueryACallsite),
    hex(addresses.runtimePlayerLockResolvedKeyQueryBCallsite),
    hex(addresses.runtimePlayerLockResolvedKeyQueryCCallsite),
    hex(addresses.runtimePlayerLockKeyedDispatchLoopCallsite),
    hex(addresses.runtimeResolvedKeyOwnerResolveIndexQueryCCallsite),
    hex(addresses.runtimeResolvedKeyOwnerResolveIndexQueryDCallsite),
  ]);
  const consumers = [
    {
      consumerId: "runtime-object-request-level-setup",
      getterCallsitesHex: [hex(addresses.runtimeResolvedKeyObjectRequestGetterCallsite)],
      postAccessorCallsiteHex: hex(addresses.runtimeResolvedKeyObjectRequestPostAccessorCallsite),
      helperCallsiteHex: hex(addresses.runtimeResolvedKeyObjectRequestHelperCallsite),
      indexSlotHex: hex(addresses.levelSetupRuntimeIndexGlobalSlot),
      indexLoadAddressHex: hex(addresses.runtimeResolvedKeyObjectRequestLevelSetupIndexLoad),
      queryCallsiteHex: hex(addresses.runtimeResolvedKeyObjectRequestIndexQueryCallsite),
      classification: "level-setup-index-query",
      activePreviewCandidate: true,
      concreteActiveKeyRecovered: false,
      evidenceAddressesHex: [
        hex(addresses.runtimeResolvedKeyObjectRequestGetterCallsite),
        hex(addresses.runtimeResolvedKeyObjectRequestPostAccessorCallsite),
        hex(addresses.runtimeResolvedKeyObjectRequestHelperCallsite),
        hex(addresses.runtimeResolvedKeyObjectRequestLevelSetupIndexLoad),
        hex(addresses.runtimeResolvedKeyObjectRequestIndexQueryCallsite),
      ],
      opcodesMatched: opcodesMatched([
        addresses.runtimeResolvedKeyObjectRequestGetterCallsite,
        addresses.runtimeResolvedKeyObjectRequestPostAccessorCallsite,
        addresses.runtimeResolvedKeyObjectRequestHelperCallsite,
        addresses.runtimeResolvedKeyObjectRequestLevelSetupIndexLoad,
        addresses.runtimeResolvedKeyObjectRequestIndexQueryCallsite,
      ]),
      blocker:
        "This is the only resolved-key consumer in this bounded set that queries Level setup index 0x2d44e98, but the cached key value behind 0xbebf54/0xbec044 is still unresolved.",
    },
    {
      consumerId: "player-lock-hud-query-a",
      getterCallsitesHex: [hex(addresses.runtimePlayerLockResolvedKeyQueryA)],
      indexSlotHex: hex(addresses.runtimePlayerLockIndexGlobalSlot),
      indexLoadAddressHex: hex(0x8c5378),
      queryCallsiteHex: hex(addresses.runtimePlayerLockResolvedKeyQueryACallsite),
      classification: "player-lock-hud-index-query",
      activePreviewCandidate: false,
      evidenceAddressesHex: [hex(0x8c5378), hex(addresses.runtimePlayerLockResolvedKeyQueryACallsite)],
      opcodesMatched: opcodesMatched([0x8c5378, addresses.runtimePlayerLockResolvedKeyQueryACallsite]),
      blocker:
        "This resolved-key consumer queries player-lock/HUD index 0x2b0f0b0, not Level setup index 0x2d44e98.",
    },
    {
      consumerId: "player-lock-hud-query-b",
      getterCallsitesHex: [hex(addresses.runtimePlayerLockResolvedKeyQueryB)],
      indexSlotHex: hex(addresses.runtimePlayerLockIndexGlobalSlot),
      indexLoadAddressHex: hex(0x9166c4),
      queryCallsiteHex: hex(addresses.runtimePlayerLockResolvedKeyQueryBCallsite),
      classification: "player-lock-hud-index-query",
      activePreviewCandidate: false,
      evidenceAddressesHex: [hex(0x9166c4), hex(addresses.runtimePlayerLockResolvedKeyQueryBCallsite)],
      opcodesMatched: opcodesMatched([0x9166c4, addresses.runtimePlayerLockResolvedKeyQueryBCallsite]),
      blocker:
        "This resolved-key consumer queries player-lock/HUD index 0x2b0f0b0, not Level setup index 0x2d44e98.",
    },
    {
      consumerId: "player-lock-hud-query-c",
      getterCallsitesHex: [hex(addresses.runtimePlayerLockResolvedKeyQueryC)],
      indexSlotHex: hex(addresses.runtimePlayerLockIndexGlobalSlot),
      indexLoadAddressHex: hex(0x95d530),
      queryCallsiteHex: hex(addresses.runtimePlayerLockResolvedKeyQueryCCallsite),
      classification: "player-lock-hud-index-query",
      activePreviewCandidate: false,
      evidenceAddressesHex: [hex(0x95d530), hex(addresses.runtimePlayerLockResolvedKeyQueryCCallsite)],
      opcodesMatched: opcodesMatched([0x95d530, addresses.runtimePlayerLockResolvedKeyQueryCCallsite]),
      blocker:
        "This resolved-key consumer queries player-lock/HUD index 0x2b0f0b0, not Level setup index 0x2d44e98.",
    },
    {
      consumerId: "player-lock-vision-totem-keyed-loop",
      getterCallsitesHex: [hex(addresses.runtimePlayerLockKeyedDispatchLoopResolvedKeyGetter)],
      indexSlotHex: hex(addresses.runtimePlayerLockIndexGlobalSlot),
      indexLoadAddressHex: hex(0xbab8c0),
      queryCallsiteHex: hex(addresses.runtimePlayerLockKeyedDispatchLoopCallsite),
      classification: "player-lock-hud-index-query",
      activePreviewCandidate: false,
      evidenceAddressesHex: [hex(0xbab8c0), hex(addresses.runtimePlayerLockKeyedDispatchLoopCallsite)],
      opcodesMatched: opcodesMatched([0xbab8c0, addresses.runtimePlayerLockKeyedDispatchLoopCallsite]),
      blocker:
        "This resolved-key consumer is in the player-lock/HUD keyed loop and queries index 0x2b0f0b0, not Level setup index 0x2d44e98.",
    },
    {
      consumerId: "owner-resolve-stats-query-c",
      getterCallsitesHex: [hex(addresses.runtimeResolvedKeyOwnerResolveIndexQueryCGetter)],
      indexSlotHex: hex(addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexGlobalSlot),
      indexLoadAddressHex: hex(addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterC),
      queryCallsiteHex: hex(addresses.runtimeResolvedKeyOwnerResolveIndexQueryCCallsite),
      classification: "owner-resolve-index-query",
      activePreviewCandidate: false,
      evidenceAddressesHex: [
        hex(addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterC),
        hex(addresses.runtimeResolvedKeyOwnerResolveIndexQueryCCallsite),
      ],
      opcodesMatched: opcodesMatched([
        addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterC,
        addresses.runtimeResolvedKeyOwnerResolveIndexQueryCCallsite,
      ]),
      blocker:
        "This resolved-key consumer queries owner-resolve index 0x3034d00, not Level setup index 0x2d44e98.",
    },
    {
      consumerId: "owner-resolve-stats-query-d",
      getterCallsitesHex: [
        hex(addresses.runtimeResolvedKeyOwnerResolveIndexQueryDGetterA),
        hex(addresses.runtimeResolvedKeyOwnerResolveIndexQueryDGetterB),
      ],
      indexSlotHex: hex(addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexGlobalSlot),
      indexLoadAddressHex: hex(addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterD),
      queryCallsiteHex: hex(addresses.runtimeResolvedKeyOwnerResolveIndexQueryDCallsite),
      classification: "owner-resolve-index-query",
      activePreviewCandidate: false,
      evidenceAddressesHex: [
        hex(addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterD),
        hex(addresses.runtimeResolvedKeyOwnerResolveIndexQueryDCallsite),
      ],
      opcodesMatched: opcodesMatched([
        addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterD,
        addresses.runtimeResolvedKeyOwnerResolveIndexQueryDCallsite,
      ]),
      blocker:
        "This resolved-key consumer queries owner-resolve index 0x3034d00, not Level setup index 0x2d44e98.",
    },
  ];
  const levelSetupIndexQueryCount = consumers.filter(
    (row) => row.classification === "level-setup-index-query",
  ).length;
  const playerLockIndexQueryCount = consumers.filter(
    (row) => row.classification === "player-lock-hud-index-query",
  ).length;
  const ownerResolveIndexQueryCount = consumers.filter(
    (row) => row.classification === "owner-resolve-index-query",
  ).length;
  const unknownQueryCallsites = indexQueryBranches
    .map((row) => row.branchAddressHex)
    .filter((callsiteHex) => !knownQueryCallsites.has(callsiteHex));
  const recovered =
    unknownQueryCallsites.length === 0 &&
    consumers.length === indexQueryBranches.length &&
    consumers.every((row) => row.opcodesMatched);
  return {
    status: recovered
      ? "resolved-key-index-query-consumers-bounded-single-level-setup-candidate"
      : "resolved-key-index-query-consumers-incomplete",
    recovered,
    rendererProfileTakeoverAllowed: false,
    concreteActiveKeyRecovered: false,
    activePreviewProof: false,
    uniqueIndexQueryCallsiteCount: indexQueryBranches.length,
    levelSetupIndexQueryCount,
    playerLockIndexQueryCount,
    ownerResolveIndexQueryCount,
    nonLevelSetupIndexQueryCount: playerLockIndexQueryCount + ownerResolveIndexQueryCount,
    unknownIndexQueryCount: unknownQueryCallsites.length,
    unknownQueryCallsites,
    consumers,
    blocker:
      "Only one bounded resolved-key index-query consumer reaches Level setup index 0x2d44e98, and it still lacks the concrete cached key selected behind 0xbebf54/0xbec044.",
    interpretation:
      "Resolved-key consumers that also call 0x188e540 split by index slot: one active candidate uses Level setup 0x2d44e98, four use player-lock/HUD 0x2b0f0b0, and two use owner-resolve 0x3034d00. The remaining active-preview blocker is the concrete cached key/payload, not an unclassified resolved-key index-query caller.",
  };
}

function buildAddressReferences(buffer, elf, targetMap) {
  return Object.entries(targetMap).map(([name, address]) => {
    const textReferences = scanTextReferences(buffer, elf, [
      {
        name,
        kind: "target-address",
        virtualAddress: address,
        section: sectionForVirtualAddress(elf.sections, address)?.name || "",
      },
    ]);
    return {
      name,
      address,
      addressHex: hex(address),
      section: sectionForVirtualAddress(elf.sections, address)?.name || "",
      directCallers: findDirectBranchCallers(buffer, elf, address),
      u64References: findU64References(buffer, elf, address),
      textReferences: textReferences.map((reference) => ({
        xrefAddress: reference.xrefAddress,
        xrefAddressHex: hex(reference.xrefAddress),
        mode: reference.mode,
        baseAddressHex: hex(reference.baseAddress),
        baseInstructionHex: reference.baseInstructionHex,
        useInstructionHex: reference.useInstructionHex,
      })),
    };
  });
}

function reportRowsForManifest(manifest) {
  const instructionRows = manifest.instructionEvidence.map((row) => ({
    category: "instruction",
    sourceAddress: row.addressHex,
    relationship: row.matched ? "opcode-match" : "opcode-mismatch",
    targetAddress: "",
    detail: `${row.actualOpcodeHex} ${row.label}`,
  }));
  const referenceRows = manifest.addressReferences.flatMap((record) => [
    ...record.directCallers.map((caller) => ({
      category: "direct-caller",
      sourceAddress: caller.callerAddressHex,
      relationship: caller.mode,
      targetAddress: record.addressHex,
      detail: record.name,
    })),
    ...record.u64References.map((reference) => ({
      category: "u64-reference",
      sourceAddress: reference.virtualAddressHex,
      relationship: reference.section,
      targetAddress: record.addressHex,
      detail: record.name,
    })),
    ...record.textReferences.map((reference) => ({
      category: "text-address-reference",
      sourceAddress: reference.xrefAddressHex,
      relationship: reference.mode,
      targetAddress: record.addressHex,
      detail: `${record.name} ${reference.baseInstructionHex || ""}/${reference.useInstructionHex || ""}`,
    })),
  ]);
  const neighborRows = manifest.moduleRegistrationNeighborCalls.map((row) => ({
    category: "module-registration-neighbor",
    sourceAddress: row.callerAddressHex,
    relationship: row.mode,
    targetAddress: row.targetAddressHex,
    detail: row.isLevelRuntimeModuleRegistration ? "level-runtime-owner-module-registration" : "sibling-runtime-module-registration",
  }));
  const typedObjectInlineKeyWriterJumpTableRows = manifest.typedObjectInlineKeyWriterJumpTableEntry
    ? [
        {
          category: "typed-object-jump-table-entry",
          sourceAddress: manifest.typedObjectInlineKeyWriterJumpTableEntry.entryAddressHex,
          relationship: manifest.typedObjectInlineKeyWriterJumpTableEntry.typeIdHex,
          targetAddress: manifest.typedObjectInlineKeyWriterJumpTableEntry.targetAddressHex,
          detail: "type 0x03e9/1001 dispatches to inline runtime key writer case",
        },
      ]
    : [];
  const runtimeResolvedKeyConsumerRows = (manifest.runtimeResolvedKeyLocalConsumerBranches || []).map((row) => ({
    category: "runtime-resolved-key-local-consumer",
    sourceAddress: row.branchAddressHex,
    relationship: row.mode,
    targetAddress: row.targetAddressHex,
    detail: `${row.targetName} near getter caller ${row.consumerCallerAddressHex} distance ${row.distanceFromAccessorCall}`,
  }));
  const characterLobbyProfileRows = (manifest.characterLobbyRuntimeProfileBranches || []).map((row) => ({
    category: "character-lobby-local-profile-branch",
    sourceAddress: row.branchAddressHex,
    relationship: row.mode,
    targetAddress: row.targetAddressHex,
    detail: `${row.targetName} near ${row.centerName} ${row.centerAddressHex} distance ${row.distanceFromCenter}`,
  }));
  const characterLobbyStateObjectProfileRows = (
    manifest.characterLobbyStateObjectProfileBranches || []
  ).map((row) => ({
    category: "character-lobby-state-object-local-profile-branch",
    sourceAddress: row.branchAddressHex,
    relationship: row.mode,
    targetAddress: row.targetAddressHex,
    detail: `${row.targetName} near ${row.centerName} ${row.centerAddressHex} distance ${row.distanceFromCenter}`,
  }));
  const runtimePlayerLockProfileRows = (manifest.runtimePlayerLockProfileBranches || []).map((row) => ({
    category: "runtime-player-lock-local-profile-branch",
    sourceAddress: row.branchAddressHex,
    relationship: row.mode,
    targetAddress: row.targetAddressHex,
    detail: `${row.targetName} near ${row.centerName} ${row.centerAddressHex} distance ${row.distanceFromCenter}`,
  }));
  const runtimeResourceKeyStatusPredicateRows = (
    manifest.runtimeResourceKeyStatusPredicateLocalBranches || []
  ).map((row) => ({
    category: "runtime-resource-key-status-predicate-local-branch",
    sourceAddress: row.branchAddressHex,
    relationship: row.mode,
    targetAddress: row.targetAddressHex,
    detail: `${row.targetName} near status predicate caller ${row.consumerCallerAddressHex} distance ${row.distanceFromAccessorCall}`,
  }));
  const runtimeResourceKeyStatusPredicateProfileRows = (
    manifest.runtimeResourceKeyStatusPredicateLocalProfileBranches || []
  ).map((row) => ({
    category: "runtime-resource-key-status-predicate-local-profile-branch",
    sourceAddress: row.branchAddressHex,
    relationship: row.mode,
    targetAddress: row.targetAddressHex,
    detail: `${row.targetName} near status predicate caller ${row.consumerCallerAddressHex} distance ${row.distanceFromAccessorCall}`,
  }));
  const runtimeResourceKeyGlobalSetterRows = (manifest.runtimeResourceKeyGlobalSetterLocalBranches || []).map(
    (row) => ({
      category: "runtime-resource-key-global-setter-local-branch",
      sourceAddress: row.branchAddressHex,
      relationship: row.mode,
      targetAddress: row.targetAddressHex,
      detail: `${row.targetName} near global setter caller ${row.consumerCallerAddressHex} distance ${row.distanceFromAccessorCall}`,
    }),
  );
  const runtimeResourceKeyGlobalSetterProfileRows = (
    manifest.runtimeResourceKeyGlobalSetterLocalProfileBranches || []
  ).map((row) => ({
    category: "runtime-resource-key-global-setter-local-profile-branch",
    sourceAddress: row.branchAddressHex,
    relationship: row.mode,
    targetAddress: row.targetAddressHex,
    detail: `${row.targetName} near global setter caller ${row.consumerCallerAddressHex} distance ${row.distanceFromAccessorCall}`,
  }));
  const runtimeResourceKeySetterInputRows = (
    manifest.runtimeResourceKeySetterInputContexts || []
  ).map((row) => ({
    category: "runtime-resource-key-setter-input-context",
    sourceAddress: row.callerAddressHex,
    relationship: row.sourceKind,
      targetAddress: hex(addresses.runtimeResourceKeyGlobalSetter),
      detail: `${row.sourceOwner} offset=${row.sourceOffset || "arg"} staticConcreteKeyRecoverable=${row.staticConcreteKeyRecoverable} requiresRuntimeCapture=${row.requiresRuntimeCapture} activePreviewProof=${row.activePreviewProof} opcodesMatched=${row.opcodesMatched}`,
  }));
  const runtimeResourceKeyUpstreamRecoveryRows = manifest.runtimeResourceKeyUpstreamRecoveryAudit
    ? [
        {
          category: "runtime-resource-key-upstream-recovery-audit",
          sourceAddress: "",
          relationship: manifest.runtimeResourceKeyUpstreamRecoveryAudit.status,
          targetAddress: "",
          detail: `sourceCount=${manifest.runtimeResourceKeyUpstreamRecoveryAudit.sourceCount} strictProfileSources=${manifest.runtimeResourceKeyUpstreamRecoveryAudit.sourcesWithStrictProfileBranches} localDecodedPayloadAvailable=${manifest.runtimeResourceKeyUpstreamRecoveryAudit.localDecodedPayloadAvailable} concreteActiveKeyRecovered=${manifest.runtimeResourceKeyUpstreamRecoveryAudit.concreteActiveKeyRecovered}`,
        },
        ...((manifest.runtimeResourceKeyUpstreamRecoveryAudit.sources || []).map((row) => ({
          category: "runtime-resource-key-upstream-source",
          sourceAddress: row.dispatcherCallsiteHex || row.callbackAddressHex || "",
          relationship: row.status,
          targetAddress: hex(addresses.runtimeResourceKeyGlobalSetter),
          detail: `${row.sourceId} activePreviewProof=${row.activePreviewProof} concretePayloadRecovered=${row.concretePayloadRecovered} strictProfileBranchCount=${row.strictProfileBranchCount || 0} opcodesMatched=${row.opcodesMatched ?? ""} blocker=${row.blocker}`,
        }))),
      ]
    : [];
  const runtimeResolvedKeyIndexQueryConsumerRows = manifest.runtimeResolvedKeyIndexQueryConsumerAudit
    ? [
        {
          category: "runtime-resolved-key-index-query-consumer-audit",
          sourceAddress: "",
          relationship: manifest.runtimeResolvedKeyIndexQueryConsumerAudit.status,
          targetAddress: hex(addresses.genericCallbackIndexQuery),
          detail: `recovered=${manifest.runtimeResolvedKeyIndexQueryConsumerAudit.recovered} uniqueIndexQueryCallsites=${manifest.runtimeResolvedKeyIndexQueryConsumerAudit.uniqueIndexQueryCallsiteCount} levelSetup=${manifest.runtimeResolvedKeyIndexQueryConsumerAudit.levelSetupIndexQueryCount} nonLevelSetup=${manifest.runtimeResolvedKeyIndexQueryConsumerAudit.nonLevelSetupIndexQueryCount} unknown=${manifest.runtimeResolvedKeyIndexQueryConsumerAudit.unknownIndexQueryCount} concreteActiveKeyRecovered=${manifest.runtimeResolvedKeyIndexQueryConsumerAudit.concreteActiveKeyRecovered}`,
        },
        ...((manifest.runtimeResolvedKeyIndexQueryConsumerAudit.consumers || []).map((row) => ({
          category: "runtime-resolved-key-index-query-consumer",
          sourceAddress: row.queryCallsiteHex,
          relationship: row.classification,
          targetAddress: row.indexSlotHex,
          detail: `${row.consumerId} getters=${row.getterCallsitesHex.join("|")} activePreviewCandidate=${row.activePreviewCandidate} concreteActiveKeyRecovered=${row.concreteActiveKeyRecovered ?? false} opcodesMatched=${row.opcodesMatched} blocker=${row.blocker}`,
        }))),
      ]
    : [];
  const typedObjectInputSourceOwnershipRows = manifest.typedObjectInputSourceOwnershipAudit
    ? [
        {
          category: "typed-object-input-source-ownership-audit",
          sourceAddress: "",
          relationship: manifest.typedObjectInputSourceOwnershipAudit.status,
          targetAddress: manifest.typedObjectInputSourceOwnershipAudit.globalSourceSlotHex,
          detail: `recovered=${manifest.typedObjectInputSourceOwnershipAudit.recovered} sourceOwnerCount=${manifest.typedObjectInputSourceOwnershipAudit.sourceOwnerCount} modeCount=${manifest.typedObjectInputSourceOwnershipAudit.modeCount} strictProfileBranchCount=${manifest.typedObjectInputSourceOwnershipAudit.strictProfileBranchCount} activePreviewProof=${manifest.typedObjectInputSourceOwnershipAudit.activePreviewProof}`,
        },
        ...((manifest.typedObjectInputSourceOwnershipAudit.sourceOwners || []).map((row) => ({
          category: "typed-object-input-source-owner",
          sourceAddress:
            row.constructorAddressHex ||
            row.selectorAddressHex ||
            row.replayInputSetupAddressHex ||
            row.vgrReadFunctionHex ||
            "",
          relationship: row.status,
          targetAddress:
            row.vtableAddressPointHex ||
            row.globalSourceSlotHex ||
            row.vgrReadFunctionHex ||
            "",
          detail: `${row.sourceId} activePreviewProof=${row.activePreviewProof} opcodesMatched=${row.opcodesMatched} blocker=${row.blocker}`,
        }))),
      ]
    : [];
  const typedObjectReplaySourceSelectorCallerRows = manifest.typedObjectReplaySourceSelectorCallerAudit
    ? [
        {
          category: "typed-object-replay-source-selector-caller-audit",
          sourceAddress: manifest.typedObjectReplaySourceSelectorCallerAudit.selectorAddressHex,
          relationship: manifest.typedObjectReplaySourceSelectorCallerAudit.status,
          targetAddress: manifest.typedObjectInputSourceOwnershipAudit?.globalSourceSlotHex || "",
          detail: `recovered=${manifest.typedObjectReplaySourceSelectorCallerAudit.recovered} directCallers=${manifest.typedObjectReplaySourceSelectorCallerAudit.selectorDirectCallerCount} mode0Callers=${manifest.typedObjectReplaySourceSelectorCallerAudit.modeZeroCallerCount} mode1Callers=${manifest.typedObjectReplaySourceSelectorCallerAudit.modeOneCallerCount} strictProfileBranchCount=${manifest.typedObjectReplaySourceSelectorCallerAudit.strictProfileBranchCount} activePreviewProof=${manifest.typedObjectReplaySourceSelectorCallerAudit.activePreviewProof}`,
        },
        ...((manifest.typedObjectReplaySourceSelectorCallerAudit.callerContexts || []).map((row) => ({
          category: "typed-object-replay-source-selector-caller",
          sourceAddress: row.selectorCallsiteHex,
          relationship: row.classification,
          targetAddress: manifest.typedObjectReplaySourceSelectorCallerAudit.selectorAddressHex,
          detail: `${row.callsiteId} modes=${row.possibleModes.join("|")} modeSource=${row.modeSource} activePreviewProof=${row.activePreviewProof} opcodesMatched=${row.opcodesMatched} blocker=${row.blocker}`,
        }))),
      ]
    : [];
  const runtimeResolvedKeyObjectEntryApplyProfileRows = (
    manifest.runtimeResolvedKeyObjectEntryApplyProfileBranches || []
  ).map((row) => ({
    category: "runtime-resolved-key-entry-apply-local-profile-branch",
    sourceAddress: row.branchAddressHex,
    relationship: row.mode,
    targetAddress: row.targetAddressHex,
    detail: `${row.targetName} near ${row.centerName} ${row.centerAddressHex} distance ${row.distanceFromCenter}`,
  }));
  const runtimeResolvedKeyObjectRequestOwnerProfileRows = (
    manifest.runtimeResolvedKeyObjectRequestOwnerProfileBranches || []
  ).map((row) => ({
    category: "runtime-resolved-key-request-owner-local-profile-branch",
    sourceAddress: row.branchAddressHex,
    relationship: row.mode,
    targetAddress: row.targetAddressHex,
    detail: `${row.targetName} near ${row.centerName} ${row.centerAddressHex} distance ${row.distanceFromCenter}`,
  }));
  const runtimeOwnerResolveIndexProfileRows = (
    manifest.runtimeOwnerResolveIndexProfileBranches || []
  ).map((row) => ({
    category: "runtime-owner-resolve-index-local-profile-branch",
    sourceAddress: row.branchAddressHex,
    relationship: row.mode,
    targetAddress: row.targetAddressHex,
    detail: `${row.targetName} near ${row.centerName} ${row.centerAddressHex} distance ${row.distanceFromCenter}`,
  }));
  const typedObjectDispatcherInputSourceProfileRows = (
    manifest.typedObjectDispatcherInputSourceProfileBranches || []
  ).map((row) => ({
    category: "typed-object-dispatcher-input-source-local-profile-branch",
    sourceAddress: row.branchAddressHex,
    relationship: row.mode,
    targetAddress: row.targetAddressHex,
    detail: `${row.targetName} near ${row.centerName} ${row.centerAddressHex} distance ${row.distanceFromCenter}`,
  }));
  const typedObjectRawIosDataRows = manifest.typedObjectRawIosDataAudit
    ? [
        {
          category: "typed-object-raw-ios-data-audit",
          sourceAddress: "",
          relationship: manifest.typedObjectRawIosDataAudit.heuristicState,
          targetAddress: "",
          detail: `root=${manifest.typedObjectRawIosDataAudit.dataRoot} files=${manifest.typedObjectRawIosDataAudit.fileCount} extensionless=${manifest.typedObjectRawIosDataAudit.extensionlessFileCount} hashNamed=${manifest.typedObjectRawIosDataAudit.hashNamedFileCount} rsc0=${manifest.typedObjectRawIosDataAudit.rsc0FileCount} rsc0PayloadSizeMatches=${manifest.typedObjectRawIosDataAudit.rsc0HeaderPayloadSizeMatchCount} rsc0Inner=${JSON.stringify(manifest.typedObjectRawIosDataAudit.rsc0InnerClassifications)} cff0=${manifest.typedObjectRawIosDataAudit.cff0FileCount || 0} cff0Parsed=${manifest.typedObjectRawIosDataAudit.cff0ParsedPrefixCount || 0} cff0Classes=${JSON.stringify(manifest.typedObjectRawIosDataAudit.cff0Classifications || {})} frameCandidates=${manifest.typedObjectRawIosDataAudit.frameCandidateCount} deepScanFiles=${manifest.typedObjectRawIosDataAudit.deepScanFileCount || 0} deepScanBytes=${manifest.typedObjectRawIosDataAudit.deepScanBytesRead || 0} deepFrameCandidates=${manifest.typedObjectRawIosDataAudit.deepScanFrameCandidateCount || 0} deepResourceLikeKeyCandidates=${manifest.typedObjectRawIosDataAudit.deepScanResourceLikeKeyFrameCandidateCount || 0} deepTypeCounts=${JSON.stringify(manifest.typedObjectRawIosDataAudit.deepScanFrameCandidateTypeCounts || {})} deepResourceLikeTypeCounts=${JSON.stringify(manifest.typedObjectRawIosDataAudit.deepScanResourceLikeKeyFrameCandidateTypeCounts || {})}`,
        },
        ...(manifest.typedObjectRawIosDataDeepHashAudit
          ? [
              {
                category: "typed-object-raw-ios-data-deep-hash-audit",
                sourceAddress: "",
                relationship: manifest.typedObjectRawIosDataDeepHashAudit.state,
                targetAddress: "",
                detail: `index=${manifest.typedObjectRawIosDataDeepHashAudit.buildResourceIndexPath} exists=${manifest.typedObjectRawIosDataDeepHashAudit.buildResourceIndexExists} objectBuilderWord0Candidates=${manifest.typedObjectRawIosDataDeepHashAudit.candidateWordCount} checkedResources=${manifest.typedObjectRawIosDataDeepHashAudit.checkedResourceRows} engineHashMatches=${manifest.typedObjectRawIosDataDeepHashAudit.engineHashMatchCount}`,
              },
            ]
          : []),
        ...((manifest.typedObjectRawIosDataAudit.frameCandidates || []).map((row) => ({
          category: "typed-object-raw-ios-data-frame-candidate",
          sourceAddress: "",
          relationship: row.kind,
          targetAddress: row.typeIdHex,
          detail: `${row.relativePath} size=${row.size} confidence=${row.confidence} head=${row.headHex}`,
        }))),
        ...((manifest.typedObjectRawIosDataAudit.deepScanFrameCandidates || []).map((row) => ({
          category: "typed-object-raw-ios-data-deep-frame-candidate",
          sourceAddress: row.offsetHex || "",
          relationship: row.kind,
          targetAddress: row.typeIdHex,
          detail: `${row.relativePath} size=${row.size} scanBytes=${row.scanBytes} type=${row.typeName} key=${row.keyString || row.resourceKeyWord0Hex || ""} resourceLike=${row.keyStringResourceLike || false} confidence=${row.confidence} head=${row.headHex}`,
        }))),
      ]
    : [];
  const descriptorPayloadResolverShimProfileRows = (
    manifest.descriptorPayloadResolverShimProfileBranches || []
  ).map((row) => ({
    category: "descriptor-payload-resolver-shim-local-profile-branch",
    sourceAddress: row.branchAddressHex,
    relationship: row.mode,
    targetAddress: row.targetAddressHex,
    detail: `${row.targetName} near resolver caller ${row.consumerCallerAddressHex} distance ${row.distanceFromAccessorCall}`,
  }));
  const descriptorPayloadResolverShimCallerContextRows = (
    manifest.descriptorPayloadResolverShimCallerContexts || []
  ).map((row) => ({
    category: "descriptor-payload-resolver-shim-caller-context",
    sourceAddress: row.callerAddressHex,
    relationship: row.classification,
    targetAddress: "",
    detail: `${row.mode} strings=[${row.stringValues.join(" | ")}] calls=[${row.callTargets
      .map((target) => `${target.targetName}@${target.callAddressHex}`)
      .join(" | ")}]`,
  }));
  const runtimeResourceKeyPostAccessorCallerContextRows = (
    manifest.runtimeResourceKeyPostAccessorCallerContexts || []
  ).map((row) => ({
    category: "runtime-resource-key-post-accessor-caller-context",
    sourceAddress: row.callerAddressHex,
    relationship: row.classification,
    targetAddress: hex(addresses.runtimeResourceKeyPostAccessor),
    detail: `${row.mode} activePreviewCandidate=${row.activePreviewCandidate} strings=[${row.stringValues.join(
      " | ",
    )}] calls=[${row.callTargets.map((target) => `${target.targetName}@${target.callAddressHex}`).join(" | ")}]`,
  }));
  const runtimeResourceKeyGlobalResolverCallerContextRows = (
    manifest.runtimeResourceKeyGlobalResolverCallerContexts || []
  ).map((row) => ({
    category: "runtime-resource-key-global-resolver-caller-context",
    sourceAddress: row.callerAddressHex,
    relationship: row.classification,
    targetAddress: hex(addresses.runtimeResourceKeyGlobalResolver),
    detail: `${row.mode} activePreviewCandidate=${row.activePreviewCandidate} strings=[${row.stringValues.join(
      " | ",
    )}] calls=[${row.callTargets.map((target) => `${target.targetName}@${target.callAddressHex}`).join(" | ")}]`,
  }));
  const genericCallbackDispatchCallsiteContextRows = (
    manifest.genericCallbackDispatchCallsiteContexts || []
  ).map((row) => ({
    category: "generic-callback-dispatch-callsite-context",
    sourceAddress: row.callerAddressHex,
    relationship: row.classification,
    targetAddress: row.callTargetAddressHex,
    detail: `descriptor=${row.descriptorSource} payload=${row.payloadSource} registry=${row.registrySource} opcodesMatched=${row.opcodesMatched}`,
  }));
  const genericCallbackDispatchHelperCallsiteContextRows = (
    manifest.genericCallbackDispatchHelperCallsiteContexts || []
  ).map((row) => ({
    category: "generic-callback-dispatch-helper-callsite-context",
    sourceAddress: row.callerAddressHex,
    relationship: row.classification,
    targetAddress: hex(addresses.genericCallbackDispatchHelper),
    detail: `key=${row.keySource} output=${row.outputListSource} count=${row.payloadCount} context=${row.contextSource} levelSetupQuery=${row.hasLevelSetupIndexQueryAfterDispatch} activePreviewCandidate=${row.activePreviewCandidate} replayStreamCandidate=${Boolean(row.replayStreamCandidate)} opcodesMatched=${row.opcodesMatched}`,
  }));
  const globalSlotStoreRows = (manifest.globalSlotStores || []).map((row) => ({
    category: "global-slot-store",
    sourceAddress: row.storeAddressHex,
    relationship: row.width,
    targetAddress: row.targetAddressHex,
    detail: `${row.targetName} sourceReg=x${row.sourceRegister} ${row.baseInstructionHex}/${row.storeInstructionHex}`,
  }));
  return [
    ...instructionRows,
    ...referenceRows,
    ...neighborRows,
    ...typedObjectInlineKeyWriterJumpTableRows,
    ...runtimeResolvedKeyConsumerRows,
    ...characterLobbyProfileRows,
    ...characterLobbyStateObjectProfileRows,
    ...runtimePlayerLockProfileRows,
    ...runtimeResourceKeyStatusPredicateRows,
    ...runtimeResourceKeyStatusPredicateProfileRows,
    ...runtimeResourceKeyGlobalSetterRows,
    ...runtimeResourceKeyGlobalSetterProfileRows,
    ...runtimeResourceKeySetterInputRows,
    ...runtimeResourceKeyUpstreamRecoveryRows,
    ...runtimeResolvedKeyIndexQueryConsumerRows,
    ...typedObjectInputSourceOwnershipRows,
    ...typedObjectReplaySourceSelectorCallerRows,
    ...runtimeResolvedKeyObjectEntryApplyProfileRows,
    ...runtimeResolvedKeyObjectRequestOwnerProfileRows,
    ...runtimeOwnerResolveIndexProfileRows,
    ...typedObjectDispatcherInputSourceProfileRows,
    ...typedObjectRawIosDataRows,
    ...descriptorPayloadResolverShimProfileRows,
    ...descriptorPayloadResolverShimCallerContextRows,
    ...runtimeResourceKeyPostAccessorCallerContextRows,
    ...runtimeResourceKeyGlobalResolverCallerContextRows,
    ...genericCallbackDispatchCallsiteContextRows,
    ...genericCallbackDispatchHelperCallsiteContextRows,
    ...globalSlotStoreRows,
  ];
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function buildManifest({ binaryPath = defaultBinary } = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const evidence = instructionEvidence(buffer, elf);
  const addressReferences = buildAddressReferences(buffer, elf, addresses);
  const globalSlotStores = scanTextStores(buffer, elf, [
    { name: "runtimeCurrentKeyOwnerGlobalSlot", address: addresses.runtimeCurrentKeyOwnerGlobalSlot },
    { name: "runtimeCurrentKeyOwnerGlobalMaybeSlot", address: addresses.runtimeCurrentKeyOwnerGlobalMaybeSlot },
    { name: "runtimeCurrentKeyOwnerChildIndexGlobalSlot", address: addresses.runtimeCurrentKeyOwnerChildIndexGlobalSlot },
    { name: "runtimeCurrentSecondaryObjectIndexGlobalSlot", address: addresses.runtimeCurrentSecondaryObjectIndexGlobalSlot },
    { name: "runtimeCurrentOwnerRegistryIndexGlobalSlot", address: addresses.runtimeCurrentOwnerRegistryIndexGlobalSlot },
    { name: "runtimePlayerLockIndexGlobalSlot", address: addresses.runtimePlayerLockIndexGlobalSlot },
    {
      name: "runtimeResolvedKeyObjectRequestOwnerResolveIndexGlobalSlot",
      address: addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexGlobalSlot,
    },
    {
      name: "runtimeResolvedKeyObjectRequestRelatedCreateIndexGlobalSlot",
      address: addresses.runtimeResolvedKeyObjectRequestRelatedCreateIndexGlobalSlot,
    },
    { name: "levelSetupRuntimeIndexGlobalSlot", address: addresses.levelSetupRuntimeIndexGlobalSlot },
  ]);
  const moduleRegistrationNeighborCalls = directBranchesInRange(
    buffer,
    elf,
    addresses.moduleRegistrationCallWindowStart,
    addresses.moduleRegistrationCallWindowEnd,
  );
  const referenceByName = new Map(addressReferences.map((record) => [record.name, record]));
  const allInstructionChecksMatched = evidence.every((row) => row.matched);
  const moduleRegistration = referenceByName.get("levelRuntimeModuleRegistration");
  const vtableBase = referenceByName.get("levelRuntimeVtableBase");
  const objectInitializer = referenceByName.get("levelRuntimeObjectInitializer");
  const invokeCallback = referenceByName.get("levelRuntimeVirtualInvokeCallback");
  const ownerDispatch = referenceByName.get("levelRuntimeOwnerDispatch");
  const ownerDispatchCallsite = referenceByName.get("levelRuntimeOwnerDispatchCallsite");
  const loader = referenceByName.get("levelRuntimeVisualsLoader");
  const tailThunk = referenceByName.get("levelRuntimeVisualsLoaderTailThunk");
  const levelSetupModuleRegistration = referenceByName.get("levelSetupModuleRegistration");
  const levelSetupModuleObjectInitializer = referenceByName.get("levelSetupModuleObjectInitializer");
  const levelSetupModuleVirtualInvokeCallback = referenceByName.get("levelSetupModuleVirtualInvokeCallback");
  const levelSetupRegisteredCallback = referenceByName.get("levelSetupRegisteredCallback");
  const levelSetupCallbackGenericRegistrationCallsite = referenceByName.get("levelSetupCallbackGenericRegistrationCallsite");
  const genericCallbackRegistration = referenceByName.get("genericCallbackRegistration");
  const genericCallbackRegistrationTreeInsert = referenceByName.get("genericCallbackRegistrationTreeInsert");
  const levelSetupRuntimeIndexGlobalSlot = referenceByName.get("levelSetupRuntimeIndexGlobalSlot");
  const levelSetupRegistryRecordGlobalSlot = referenceByName.get("levelSetupRegistryRecordGlobalSlot");
  const levelSetupSecondaryResourceGlobalSlot = referenceByName.get("levelSetupSecondaryResourceGlobalSlot");
  const genericCallbackDispatch = referenceByName.get("genericCallbackDispatch");
  const genericCallbackDispatchPayloadResolver = referenceByName.get("genericCallbackDispatchPayloadResolver");
  const genericCallbackDispatchHelper = referenceByName.get("genericCallbackDispatchHelper");
  const descriptorPayloadResolverShim = referenceByName.get("descriptorPayloadResolverShim");
  const descriptorPayloadResolver = referenceByName.get("descriptorPayloadResolver");
  const typedObjectDispatcher = referenceByName.get("typedObjectDispatcher");
  const typedObjectDispatcherJumpTable = referenceByName.get("typedObjectDispatcherJumpTable");
  const objectBuilderBDispatchCase = referenceByName.get("objectBuilderBDispatchCase");
  const objectBuilderBParserWrapper = referenceByName.get("objectBuilderBParserWrapper");
  const objectBuilderBConstructor = referenceByName.get("objectBuilderBConstructor");
  const objectBuilderBVtableObjectPointer = referenceByName.get("objectBuilderBVtableObjectPointer");
  const typedObjectVgrPathBuilder = referenceByName.get("typedObjectVgrPathBuilder");
  const typedObjectVgrOpenFunction = referenceByName.get("typedObjectVgrOpenFunction");
  const typedObjectVgrReadFunction = referenceByName.get("typedObjectVgrReadFunction");
  const typedObjectVgrPathFormatString = referenceByName.get("typedObjectVgrPathFormatString");
  const typedObjectVgrFileModeString = referenceByName.get("typedObjectVgrFileModeString");
  const typedObjectFreadWrapper = referenceByName.get("typedObjectFreadWrapper");
  const typedObjectRuntimeKeySelectionDispatchCase = referenceByName.get(
    "typedObjectRuntimeKeySelectionDispatchCase",
  );
  const typedObjectRuntimeKeySelectionHelper = referenceByName.get("typedObjectRuntimeKeySelectionHelper");
  const typedObjectInlineKeyWriterDispatchCase = referenceByName.get(
    "typedObjectInlineKeyWriterDispatchCase",
  );
  const typedObjectInlineKeyWriterHelper = referenceByName.get("typedObjectInlineKeyWriterHelper");
  const typedObjectInlineKeyWriterHelperCallsite = referenceByName.get(
    "typedObjectInlineKeyWriterHelperCallsite",
  );
  const runtimeResourceKeySelectionSetter = referenceByName.get("runtimeResourceKeySelectionSetter");
  const runtimeResourceKeyGlobalSetter = referenceByName.get("runtimeResourceKeyGlobalSetter");
  const runtimeResourceKeyGlobalResolver = referenceByName.get("runtimeResourceKeyGlobalResolver");
  const runtimeResourceKeyResolvedAccessor = referenceByName.get("runtimeResourceKeyResolvedAccessor");
  const runtimeResourceKeyPostAccessor = referenceByName.get("runtimeResourceKeyPostAccessor");
  const runtimeResourceKeyGlobalStringSlot = referenceByName.get("runtimeResourceKeyGlobalStringSlot");
  const runtimeResourceKeyGlobalResolvedSlot = referenceByName.get("runtimeResourceKeyGlobalResolvedSlot");
  const runtimeResourceKeyStatusPredicate = referenceByName.get("runtimeResourceKeyStatusPredicate");
  const runtimeCurrentKeyOwnerGlobalSlot = referenceByName.get("runtimeCurrentKeyOwnerGlobalSlot");
  const runtimeCurrentKeyOwnerAccessor = referenceByName.get("runtimeCurrentKeyOwnerAccessor");
  const runtimeCurrentKeyOwnerConstructor = referenceByName.get("runtimeCurrentKeyOwnerConstructor");
  const runtimeCurrentKeyOwnerDestructor = referenceByName.get("runtimeCurrentKeyOwnerDestructor");
  const runtimeCurrentKeyOwnerChildIndexGlobalSlot = referenceByName.get(
    "runtimeCurrentKeyOwnerChildIndexGlobalSlot",
  );
  const runtimeCurrentKeyOwnerChildIndexRegistration = referenceByName.get(
    "runtimeCurrentKeyOwnerChildIndexRegistration",
  );
  const runtimeCurrentKeyOwnerChildSlot4Callback = referenceByName.get("runtimeCurrentKeyOwnerChildSlot4Callback");
  const runtimeCurrentSecondaryObjectIndexGlobalSlot = referenceByName.get(
    "runtimeCurrentSecondaryObjectIndexGlobalSlot",
  );
  const runtimeCurrentSecondaryObjectIndexRegistration = referenceByName.get(
    "runtimeCurrentSecondaryObjectIndexRegistration",
  );
  const runtimeCurrentSecondaryObjectKeyedCallbackFirst = referenceByName.get(
    "runtimeCurrentSecondaryObjectKeyedCallbackFirst",
  );
  const runtimeCurrentOwnerChildAccessor = referenceByName.get("runtimeCurrentOwnerChildAccessor");
  const runtimeCurrentOwnerActiveStateBridge = referenceByName.get("runtimeCurrentOwnerActiveStateBridge");
  const runtimeCurrentOwnerPositionBridge = referenceByName.get("runtimeCurrentOwnerPositionBridge");
  const runtimeCurrentOwnerStateRefreshBridge = referenceByName.get("runtimeCurrentOwnerStateRefreshBridge");
  const runtimeCurrentOwnerStateCleanupBridge = referenceByName.get("runtimeCurrentOwnerStateCleanupBridge");
  const runtimeCurrentOwnerRegistrationBuilder = referenceByName.get("runtimeCurrentOwnerRegistrationBuilder");
  const runtimeCurrentOwnerRegistryIndexGlobalSlot = referenceByName.get(
    "runtimeCurrentOwnerRegistryIndexGlobalSlot",
  );
  const runtimeCurrentOwnerRegistryIndexLazyInitializer = referenceByName.get(
    "runtimeCurrentOwnerRegistryIndexLazyInitializer",
  );
  const runtimeCurrentOwnerRegistryIndexLazySourceSlot = referenceByName.get(
    "runtimeCurrentOwnerRegistryIndexLazySourceSlot",
  );
  const runtimeCurrentOwnerPrimaryCallbackTable = referenceByName.get("runtimeCurrentOwnerPrimaryCallbackTable");
  const runtimeCurrentOwnerSecondaryCallbackTable = referenceByName.get("runtimeCurrentOwnerSecondaryCallbackTable");
  const runtimeCurrentOwnerSlot4Callback = referenceByName.get("runtimeCurrentOwnerSlot4Callback");
  const runtimeCurrentOwnerSlot4UpdateDispatcher = referenceByName.get(
    "runtimeCurrentOwnerSlot4UpdateDispatcher",
  );
  const runtimeCurrentOwnerStatePositionProjector = referenceByName.get("runtimeCurrentOwnerStatePositionProjector");
  const runtimeCurrentOwnerStateAttach = referenceByName.get("runtimeCurrentOwnerStateAttach");
  const runtimeCurrentOwnerPostAttachTransformRefresh = referenceByName.get(
    "runtimeCurrentOwnerPostAttachTransformRefresh",
  );
  const runtimeCurrentOwnerHudMinimapConstructor = referenceByName.get("runtimeCurrentOwnerHudMinimapConstructor");
  const runtimeCurrentOwnerHudMinimapUpdate = referenceByName.get("runtimeCurrentOwnerHudMinimapUpdate");
  const runtimeCurrentOwnerHudMinimapVtablePrimary = referenceByName.get(
    "runtimeCurrentOwnerHudMinimapVtablePrimary",
  );
  const runtimeCurrentOwnerHudMinimapSubobjectInitializer = referenceByName.get(
    "runtimeCurrentOwnerHudMinimapSubobjectInitializer",
  );
  const runtimeCurrentOwnerHudMinimapSubobjectUpdate = referenceByName.get(
    "runtimeCurrentOwnerHudMinimapSubobjectUpdate",
  );
  const runtimeCurrentOwnerHudMinimapPositionSampler = referenceByName.get(
    "runtimeCurrentOwnerHudMinimapPositionSampler",
  );
  const runtimeCurrentOwnerHudMinimapSubobjectVtablePrimary = referenceByName.get(
    "runtimeCurrentOwnerHudMinimapSubobjectVtablePrimary",
  );
  const runtimeCurrentOwnerHudMinimapPositionSamplerVtableSlot = referenceByName.get(
    "runtimeCurrentOwnerHudMinimapPositionSamplerVtableSlot",
  );
  const hudMinimapString = referenceByName.get("hudMinimapString");
  const hudMinimapBuildPathFormatString = referenceByName.get("hudMinimapBuildPathFormatString");
  const runtimePlayerLockIndexGlobalSlot = referenceByName.get("runtimePlayerLockIndexGlobalSlot");
  const runtimePlayerLockRegistration = referenceByName.get("runtimePlayerLockRegistration");
  const runtimePlayerLockObjectInitializer = referenceByName.get("runtimePlayerLockObjectInitializer");
  const runtimePlayerLockVirtualInvokeCallback = referenceByName.get("runtimePlayerLockVirtualInvokeCallback");
  const runtimePlayerLockIndexMatchCallback = referenceByName.get("runtimePlayerLockIndexMatchCallback");
  const runtimePlayerLockOwnerCreateFromCurrentKey = referenceByName.get("runtimePlayerLockOwnerCreateFromCurrentKey");
  const runtimePlayerLockSimpleIndexQuery = referenceByName.get("runtimePlayerLockSimpleIndexQuery");
  const runtimePlayerLockKeyedDispatchLoop = referenceByName.get("runtimePlayerLockKeyedDispatchLoop");
  const playerLockString = referenceByName.get("playerLockString");
  const hudRuntimeString = referenceByName.get("hudRuntimeString");
  const tutorialFiveClientString = referenceByName.get("tutorialFiveClientString");
  const visionTotemString = referenceByName.get("visionTotemString");
  const runtimeResolvedKeyObjectRequestOwnerRegistration = referenceByName.get(
    "runtimeResolvedKeyObjectRequestOwnerRegistration",
  );
  const runtimeResolvedKeyObjectRequestOwnerPrimaryCallback = referenceByName.get(
    "runtimeResolvedKeyObjectRequestOwnerPrimaryCallback",
  );
  const runtimeResolvedKeyObjectRequestOwnerSlot1Callback = referenceByName.get(
    "runtimeResolvedKeyObjectRequestOwnerSlot1Callback",
  );
  const runtimeResolvedKeyObjectRequestOwnerSlot4Callback = referenceByName.get(
    "runtimeResolvedKeyObjectRequestOwnerSlot4Callback",
  );
  const runtimeModuleCallbackSlotInstaller = referenceByName.get("runtimeModuleCallbackSlotInstaller");
  const runtimeModuleCallbackSlotDispatch = referenceByName.get("runtimeModuleCallbackSlotDispatch");
  const runtimeModuleCallbackSlotDispatchRecords = referenceByName.get("runtimeModuleCallbackSlotDispatchRecords");
  const runtimeModuleCallbackFrameDispatch = referenceByName.get("runtimeModuleCallbackFrameDispatch");
  const runtimeModuleCallbackFrameDispatchSlot6 = referenceByName.get("runtimeModuleCallbackFrameDispatchSlot6");
  const runtimeModuleObjectCreateWrapper = referenceByName.get("runtimeModuleObjectCreateWrapper");
  const runtimeModuleObjectLookupOrCreate = referenceByName.get("runtimeModuleObjectLookupOrCreate");
  const runtimeModuleObjectSlot0Create = referenceByName.get("runtimeModuleObjectSlot0Create");
  const runtimeResolvedKeyObjectRequestOwnerResolveIndexRegistration = referenceByName.get(
    "runtimeResolvedKeyObjectRequestOwnerResolveIndexRegistration",
  );
  const runtimeResolvedKeyObjectRequestOwnerResolveIndexGlobalSlot = referenceByName.get(
    "runtimeResolvedKeyObjectRequestOwnerResolveIndexGlobalSlot",
  );
  const runtimeResolvedKeyObjectRequestRelatedCreateIndexRegistration = referenceByName.get(
    "runtimeResolvedKeyObjectRequestRelatedCreateIndexRegistration",
  );
  const characterLobbyOwnerInitializer = referenceByName.get("characterLobbyOwnerInitializer");
  const characterLobbyOwnerPrimaryVtable = referenceByName.get("characterLobbyOwnerPrimaryVtable");
  const characterLobbyRuntimeKeySwitchCallback = referenceByName.get("characterLobbyRuntimeKeySwitchCallback");
  const characterLobbyRuntimeKeySwitchVtableSlot = referenceByName.get("characterLobbyRuntimeKeySwitchVtableSlot");
  const characterLobbyRuntimeKeySwitchThunk = referenceByName.get("characterLobbyRuntimeKeySwitchThunk");
  const characterLobbySubobjectVtable = referenceByName.get("characterLobbySubobjectVtable");
  const characterLobbyStateRefresh = referenceByName.get("characterLobbyStateRefresh");
  const characterLobbyModeSwitcher = referenceByName.get("characterLobbyModeSwitcher");
  const characterLobbyStateAConstructor = referenceByName.get("characterLobbyStateAConstructor");
  const characterLobbyStateARefresh = referenceByName.get("characterLobbyStateARefresh");
  const characterLobbyStateADestructor = referenceByName.get("characterLobbyStateADestructor");
  const characterLobbyStateAApplyPayload = referenceByName.get("characterLobbyStateAApplyPayload");
  const characterLobbyStateAPayloadSelect = referenceByName.get("characterLobbyStateAPayloadSelect");
  const characterLobbyStateARebuildVisualLists = referenceByName.get("characterLobbyStateARebuildVisualLists");
  const characterLobbyStateAUpdateVisualItems = referenceByName.get("characterLobbyStateAUpdateVisualItems");
  const characterLobbyStateBConstructor = referenceByName.get("characterLobbyStateBConstructor");
  const characterLobbyStateBRefresh = referenceByName.get("characterLobbyStateBRefresh");
  const characterLobbyStateBDestructor = referenceByName.get("characterLobbyStateBDestructor");
  const characterLobbyStateBApplyPayload = referenceByName.get("characterLobbyStateBApplyPayload");
  const characterLobbyStateBPayloadSelect = referenceByName.get("characterLobbyStateBPayloadSelect");
  const characterLobbyStateBRebuildVisualLists = referenceByName.get("characterLobbyStateBRebuildVisualLists");
  const characterLobbyStateBUpdateVisualItems = referenceByName.get("characterLobbyStateBUpdateVisualItems");
  const uiCharacterLobbyEnteredSoundString = referenceByName.get("uiCharacterLobbyEnteredSoundString");
  const characterLobbyDraftSelectHeroString = referenceByName.get("characterLobbyDraftSelectHeroString");
  const characterLobbyDraftLockInHeroString = referenceByName.get("characterLobbyDraftLockInHeroString");
  const characterLobbyDraftLockedInButtonString = referenceByName.get("characterLobbyDraftLockedInButtonString");
  const characterLobbyDraftHeroBanSoundString = referenceByName.get("characterLobbyDraftHeroBanSoundString");
  const characterLobbyDraftLockInSoundString = referenceByName.get("characterLobbyDraftLockInSoundString");
  const characterLobbyDraftSwapHeroesVoiceString = referenceByName.get("characterLobbyDraftSwapHeroesVoiceString");
  const characterLobbyDraftNamedAllySelectingString = referenceByName.get(
    "characterLobbyDraftNamedAllySelectingString",
  );
  const characterLobbyDraftNamedEnemySelectingString = referenceByName.get(
    "characterLobbyDraftNamedEnemySelectingString",
  );
  const characterLobbyDraftNamedEnemyBanningString = referenceByName.get(
    "characterLobbyDraftNamedEnemyBanningString",
  );
  const objectBuilderAFunction = referenceByName.get("objectBuilderAFunction");
  const objectBuilderBFunction = referenceByName.get("objectBuilderBFunction");
  const runtimeResolvedKeyObjectRequestContextAccessor = referenceByName.get(
    "runtimeResolvedKeyObjectRequestContextAccessor",
  );
  const runtimeResolvedKeyObjectListProcessor = referenceByName.get("runtimeResolvedKeyObjectListProcessor");
  const runtimeResolvedKeyObjectListProcessorArrayLookup = referenceByName.get(
    "runtimeResolvedKeyObjectListProcessorArrayLookup",
  );
  const runtimeResolvedKeyObjectListProcessorArrayHashLookup = referenceByName.get(
    "runtimeResolvedKeyObjectListProcessorArrayHashLookup",
  );
  const runtimeResolvedKeyObjectListProcessorSingleLookup = referenceByName.get(
    "runtimeResolvedKeyObjectListProcessorSingleLookup",
  );
  const runtimeResolvedKeyObjectListProcessorSingleHashLookup = referenceByName.get(
    "runtimeResolvedKeyObjectListProcessorSingleHashLookup",
  );
  const runtimeResolvedKeyObjectEntryApply = referenceByName.get("runtimeResolvedKeyObjectEntryApply");
  const runtimeResolvedKeyObjectEntryTransformWriter = referenceByName.get(
    "runtimeResolvedKeyObjectEntryTransformWriter",
  );
  const runtimeResolvedKeyObjectEntrySecondaryAttach = referenceByName.get(
    "runtimeResolvedKeyObjectEntrySecondaryAttach",
  );
  const runtimeResolvedKeyObjectEntryScratchBuilder = referenceByName.get(
    "runtimeResolvedKeyObjectEntryScratchBuilder",
  );
  const runtimeResolvedKeyObjectEntryHashInsert = referenceByName.get("runtimeResolvedKeyObjectEntryHashInsert");
  const runtimeResolvedKeyProfileTargetNames = new Set([
    "levelSetupRegisteredCallback",
    "levelRuntimeOwnerDispatch",
    "levelRuntimeVisualsLoader",
    "levelVisualsApplyProcessor",
    "sceneProbeProfilePayloadLoad",
  ]);
  const runtimeResolvedKeyLocalConsumerTargets = [
    "genericCallbackDispatchHelper",
    "genericCallbackIndexQuery",
    "genericCallbackDispatch",
    "levelSetupRegisteredCallback",
    "levelRuntimeOwnerDispatch",
    "levelRuntimeVisualsLoader",
    "levelVisualsApplyProcessor",
    "sceneProbeProfilePayloadLoad",
    "resourceKeyByIdLookup",
    "runtimeResourceKeySelectionSetter",
    "runtimeResourceKeyGlobalSetter",
    "runtimeResourceKeyGlobalResolver",
    "runtimeResourceKeyStatusPredicate",
    "characterLobbyModeSwitcher",
  ]
    .map((name) => ({ name, address: addresses[name] }))
    .filter((target) => typeof target.address === "number");
  const runtimeResolvedKeyLocalConsumerBranches = scanDirectCallerNeighborhoodsForTargets(
    buffer,
    elf,
    runtimeResourceKeyResolvedAccessor?.directCallers || [],
    runtimeResolvedKeyLocalConsumerTargets,
  );
  const runtimeResolvedKeyLocalProfileConsumerBranches = runtimeResolvedKeyLocalConsumerBranches.filter((row) =>
    runtimeResolvedKeyProfileTargetNames.has(row.targetName),
  );
  const runtimeResourceKeyStatusPredicateLocalTargets = runtimeResolvedKeyLocalConsumerTargets.filter(
    (target) => target.name !== "runtimeResourceKeyStatusPredicate",
  );
  const runtimeResourceKeyStatusPredicateLocalBranches = scanDirectCallerNeighborhoodsForTargets(
    buffer,
    elf,
    runtimeResourceKeyStatusPredicate?.directCallers || [],
    runtimeResourceKeyStatusPredicateLocalTargets,
  );
  const runtimeResourceKeyStatusPredicateLocalProfileBranches =
    runtimeResourceKeyStatusPredicateLocalBranches.filter((row) =>
      runtimeResolvedKeyProfileTargetNames.has(row.targetName),
    );
  const characterLobbyStatusPredicateBranches = runtimeResourceKeyStatusPredicateLocalBranches.filter(
    (row) => row.consumerCallerAddress === 0xa7cac4,
  );
  const runtimeResourceKeyGlobalSetterLocalTargets = runtimeResolvedKeyLocalConsumerTargets.filter(
    (target) => target.name !== "runtimeResourceKeyGlobalSetter",
  );
  const runtimeResourceKeyGlobalSetterLocalBranches = scanDirectCallerNeighborhoodsForTargets(
    buffer,
    elf,
    runtimeResourceKeyGlobalSetter?.directCallers || [],
    runtimeResourceKeyGlobalSetterLocalTargets,
    0x80,
    0x220,
  );
  const runtimeResourceKeyGlobalSetterLocalProfileBranches =
    runtimeResourceKeyGlobalSetterLocalBranches.filter((row) =>
      runtimeResolvedKeyProfileTargetNames.has(row.targetName),
    );
  const runtimeResourceKeyPostAccessorCallerContexts = scanRuntimeResourceKeyPostAccessorCallerContexts(
    buffer,
    elf,
    runtimeResourceKeyPostAccessor?.directCallers || [],
  );
  const runtimeResourceKeyPostAccessorCallerClassifications = countBy(
    runtimeResourceKeyPostAccessorCallerContexts,
    (row) => row.classification,
  );
  const runtimeResourceKeyPostAccessorActivePreviewCandidateCallers =
    runtimeResourceKeyPostAccessorCallerContexts.filter((row) => row.activePreviewCandidate).length;
  const runtimeResourceKeyPostAccessorSettingsPreferredBuildPathCallers =
    runtimeResourceKeyPostAccessorCallerContexts.filter(
      (row) => row.classification === "settings-preferred-build-path",
    ).length;
  const runtimeResourceKeyPostAccessorCallsitesFullyClassified =
    runtimeResourceKeyPostAccessorCallerContexts.length > 0 &&
    runtimeResourceKeyPostAccessorCallerContexts.every(
      (row) => row.classification !== "unclassified-runtime-key-post-accessor",
    );
  const runtimeResourceKeyGlobalResolverCallerContexts =
    scanRuntimeResourceKeyGlobalResolverCallerContexts(
      buffer,
      elf,
      runtimeResourceKeyGlobalResolver?.directCallers || [],
    );
  const runtimeResourceKeySetterInputContexts = buildRuntimeResourceKeySetterInputContexts(evidence);
  const runtimeResourceKeyGlobalResolverCallerClassifications = countBy(
    runtimeResourceKeyGlobalResolverCallerContexts,
    (row) => row.classification,
  );
  const runtimeResourceKeyGlobalResolverCallsitesFullyClassified =
    runtimeResourceKeyGlobalResolverCallerContexts.length > 0 &&
    runtimeResourceKeyGlobalResolverCallerContexts.every(
      (row) => row.classification !== "unclassified-runtime-key-global-resolver",
    );
  const runtimeResourceKeyGlobalResolverActivePreviewCandidateCallers =
    runtimeResourceKeyGlobalResolverCallerContexts.filter((row) => row.activePreviewCandidate).length;
  const runtimeResolvedKeyIndexQueryConsumerAudit = buildRuntimeResolvedKeyIndexQueryConsumerAudit({
    evidence,
    runtimeResolvedKeyLocalConsumerBranches,
  });
  const characterLobbyRuntimeProfileBranches = scanAddressNeighborhoodsForTargets(
    buffer,
    elf,
    [
      { name: "characterLobbyOwnerInitializer", address: addresses.characterLobbyOwnerInitializer },
      { name: "characterLobbyStateRefresh", address: addresses.characterLobbyStateRefresh },
      { name: "characterLobbyModeSwitcher", address: addresses.characterLobbyModeSwitcher },
      { name: "characterLobbyRuntimeKeySwitchCallback", address: addresses.characterLobbyRuntimeKeySwitchCallback },
      { name: "characterLobbyRuntimeKeySwitchThunk", address: addresses.characterLobbyRuntimeKeySwitchThunk },
    ],
    runtimeResolvedKeyLocalConsumerTargets.filter((target) => runtimeResolvedKeyProfileTargetNames.has(target.name)),
  );
  const characterLobbyStateObjectProfileBranches = scanAddressNeighborhoodsForTargets(
    buffer,
    elf,
    [
      { name: "characterLobbyStateAConstructor", address: addresses.characterLobbyStateAConstructor },
      { name: "characterLobbyStateARefresh", address: addresses.characterLobbyStateARefresh },
      { name: "characterLobbyStateADestructor", address: addresses.characterLobbyStateADestructor },
      { name: "characterLobbyStateAApplyPayload", address: addresses.characterLobbyStateAApplyPayload },
      { name: "characterLobbyStateAPayloadSelect", address: addresses.characterLobbyStateAPayloadSelect },
      { name: "characterLobbyStateARebuildVisualLists", address: addresses.characterLobbyStateARebuildVisualLists },
      { name: "characterLobbyStateAUpdateVisualItems", address: addresses.characterLobbyStateAUpdateVisualItems },
      { name: "characterLobbyStateBConstructor", address: addresses.characterLobbyStateBConstructor },
      { name: "characterLobbyStateBRefresh", address: addresses.characterLobbyStateBRefresh },
      { name: "characterLobbyStateBDestructor", address: addresses.characterLobbyStateBDestructor },
      { name: "characterLobbyStateBApplyPayload", address: addresses.characterLobbyStateBApplyPayload },
      { name: "characterLobbyStateBPayloadSelect", address: addresses.characterLobbyStateBPayloadSelect },
      { name: "characterLobbyStateBRebuildVisualLists", address: addresses.characterLobbyStateBRebuildVisualLists },
      { name: "characterLobbyStateBUpdateVisualItems", address: addresses.characterLobbyStateBUpdateVisualItems },
    ],
    runtimeResolvedKeyLocalConsumerTargets.filter((target) => runtimeResolvedKeyProfileTargetNames.has(target.name)),
    0x80,
    0x260,
  );
  const runtimePlayerLockProfileBranches = scanAddressNeighborhoodsForTargets(
    buffer,
    elf,
    [
      { name: "runtimePlayerLockRegistration", address: addresses.runtimePlayerLockRegistration },
      { name: "runtimePlayerLockOwnerCreateFromCurrentKey", address: addresses.runtimePlayerLockOwnerCreateFromCurrentKey },
      { name: "runtimePlayerLockSimpleIndexQuery", address: addresses.runtimePlayerLockSimpleIndexQuery },
      { name: "runtimePlayerLockResolvedKeyQueryA", address: addresses.runtimePlayerLockResolvedKeyQueryA },
      { name: "runtimePlayerLockResolvedKeyQueryB", address: addresses.runtimePlayerLockResolvedKeyQueryB },
      { name: "runtimePlayerLockResolvedKeyQueryC", address: addresses.runtimePlayerLockResolvedKeyQueryC },
      { name: "runtimePlayerLockKeyedDispatchLoop", address: addresses.runtimePlayerLockKeyedDispatchLoop },
    ],
    runtimeResolvedKeyLocalConsumerTargets.filter((target) => runtimeResolvedKeyProfileTargetNames.has(target.name)),
    0x80,
    0x260,
  );
  const runtimeOwnerResolveIndexProfileBranches = scanAddressNeighborhoodsForTargets(
    buffer,
    elf,
    [
      {
        name: "runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadKnownRequest",
        address: addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadKnownRequest,
      },
      {
        name: "runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterA",
        address: addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterA,
      },
      {
        name: "runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterB",
        address: addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterB,
      },
      {
        name: "runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterC",
        address: addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterC,
      },
      {
        name: "runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterD",
        address: addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterD,
      },
      {
        name: "runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadValueA",
        address: addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadValueA,
      },
      {
        name: "runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadValueB",
        address: addresses.runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadValueB,
      },
    ],
    runtimeResolvedKeyLocalConsumerTargets.filter((target) => runtimeResolvedKeyProfileTargetNames.has(target.name)),
    0x80,
    0x260,
  );
  const runtimeResolvedKeyObjectRequestOwnerProfileBranches = scanAddressNeighborhoodsForTargets(
    buffer,
    elf,
    [
      {
        name: "runtimeResolvedKeyObjectRequestOwnerRegistration",
        address: addresses.runtimeResolvedKeyObjectRequestOwnerRegistration,
      },
      {
        name: "runtimeResolvedKeyObjectRequestOwnerPrimaryCallback",
        address: addresses.runtimeResolvedKeyObjectRequestOwnerPrimaryCallback,
      },
      {
        name: "runtimeResolvedKeyObjectRequestOwnerSlot1Callback",
        address: addresses.runtimeResolvedKeyObjectRequestOwnerSlot1Callback,
      },
      {
        name: "runtimeResolvedKeyObjectRequestOwnerSlot4Callback",
        address: addresses.runtimeResolvedKeyObjectRequestOwnerSlot4Callback,
      },
    ],
    runtimeResolvedKeyLocalConsumerTargets.filter((target) => runtimeResolvedKeyProfileTargetNames.has(target.name)),
  );
  const runtimeResolvedKeyObjectEntryApplyProfileBranches = scanAddressNeighborhoodsForTargets(
    buffer,
    elf,
    [
      { name: "runtimeResolvedKeyObjectListProcessor", address: addresses.runtimeResolvedKeyObjectListProcessor },
      {
        name: "runtimeResolvedKeyObjectListProcessorArrayLookup",
        address: addresses.runtimeResolvedKeyObjectListProcessorArrayLookup,
      },
      {
        name: "runtimeResolvedKeyObjectListProcessorSingleLookup",
        address: addresses.runtimeResolvedKeyObjectListProcessorSingleLookup,
      },
      { name: "runtimeResolvedKeyObjectEntryApply", address: addresses.runtimeResolvedKeyObjectEntryApply },
    ],
    runtimeResolvedKeyLocalConsumerTargets.filter((target) => runtimeResolvedKeyProfileTargetNames.has(target.name)),
  );
  const typedObjectDispatcherInputSourceProfileBranches = scanAddressNeighborhoodsForTargets(
    buffer,
    elf,
    [
      { name: "typedObjectDispatcherFrameStreamFunction", address: addresses.typedObjectDispatcherFrameStreamFunction },
      { name: "typedObjectDispatcherFrameCallerCallsite", address: addresses.typedObjectDispatcherFrameCallerCallsite },
      { name: "typedObjectDispatcherTimedQueueFunction", address: addresses.typedObjectDispatcherTimedQueueFunction },
      { name: "typedObjectDispatcherTimedQueueCallerCallsite", address: addresses.typedObjectDispatcherTimedQueueCallerCallsite },
    ],
    runtimeResolvedKeyLocalConsumerTargets.filter((target) => runtimeResolvedKeyProfileTargetNames.has(target.name)),
    0x80,
    0x240,
  );
  const typedObjectReplaySourceSelectorProfileBranches = scanAddressNeighborhoodsForTargets(
    buffer,
    elf,
    [
      {
        name: "typedObjectReplaySourceSelectorRuntimeSwitchCaller",
        address: addresses.typedObjectReplaySourceSelectorRuntimeSwitchCaller,
      },
      {
        name: "typedObjectReplaySourceSelectorRuntimeSwitchCallsite",
        address: addresses.typedObjectReplaySourceSelectorRuntimeSwitchCallsite,
      },
      {
        name: "typedObjectReplaySourceSelectorStartupInitCaller",
        address: addresses.typedObjectReplaySourceSelectorStartupInitCaller,
      },
      {
        name: "typedObjectReplaySourceSelectorStartupInitCallsite",
        address: addresses.typedObjectReplaySourceSelectorStartupInitCallsite,
      },
      {
        name: "typedObjectReplaySourceSelectorModeZeroThunk",
        address: addresses.typedObjectReplaySourceSelectorModeZeroThunk,
      },
      {
        name: "typedObjectReplaySourceSelectorModeZeroThunkCallsite",
        address: addresses.typedObjectReplaySourceSelectorModeZeroThunkCallsite,
      },
    ],
    runtimeResolvedKeyLocalConsumerTargets.filter((target) => runtimeResolvedKeyProfileTargetNames.has(target.name)),
    0x100,
    0x260,
  );
  const descriptorPayloadResolverShimProfileBranches = scanDirectCallerNeighborhoodsForTargets(
    buffer,
    elf,
    descriptorPayloadResolverShim?.directCallers || [],
    runtimeResolvedKeyLocalConsumerTargets.filter((target) => runtimeResolvedKeyProfileTargetNames.has(target.name)),
    0x80,
    0x240,
  );
  const descriptorPayloadResolverShimCallerContexts = scanDescriptorPayloadResolverShimCallerContexts(
    buffer,
    elf,
    descriptorPayloadResolverShim?.directCallers || [],
  );
  const descriptorPayloadResolverShimCallerClassifications = countBy(
    descriptorPayloadResolverShimCallerContexts,
    (row) => row.classification,
  );
  const descriptorPayloadResolverShimActivePreviewCandidateCallers =
    (descriptorPayloadResolverShimCallerClassifications["string-backed-other"] || 0) +
    (descriptorPayloadResolverShimCallerClassifications["unclassified-dynamic"] || 0);
  const genericCallbackDispatchCallsiteContexts = buildGenericCallbackDispatchCallsiteContexts(evidence);
  const genericCallbackDispatchCallsiteClassifications = countBy(
    genericCallbackDispatchCallsiteContexts,
    (row) => row.classification,
  );
  const genericCallbackDispatchCallsitesUsingLevelSetupRegistryDescriptor =
    genericCallbackDispatchCallsiteContexts.filter((row) => row.usesLevelSetupRegistryDescriptor).length;
  const genericCallbackDispatchCallsitesUsingResolverOutputDescriptor =
    genericCallbackDispatchCallsiteContexts.filter((row) => row.usesResolverOutputDescriptor).length;
  const genericCallbackDispatchHelperCallsiteContexts =
    buildGenericCallbackDispatchHelperCallsiteContexts(evidence);
  const genericCallbackDispatchHelperCallsiteClassifications = countBy(
    genericCallbackDispatchHelperCallsiteContexts,
    (row) => row.classification,
  );
  const genericCallbackDispatchHelperCallsitesWithLevelSetupIndexQuery =
    genericCallbackDispatchHelperCallsiteContexts.filter((row) => row.hasLevelSetupIndexQueryAfterDispatch).length;
  const genericCallbackDispatchHelperActivePreviewCandidateCallsites =
    genericCallbackDispatchHelperCallsiteContexts.filter((row) => row.activePreviewCandidate).length;
  const levelSetupActivePreviewCandidateContexts = genericCallbackDispatchHelperCallsiteContexts
    .filter((row) => row.activePreviewCandidate)
    .map((row) => ({
      callsiteName: row.callsiteName,
      callerAddressHex: row.callerAddressHex,
      classification: row.classification,
      keySource: row.keySource,
      outputListSource: row.outputListSource,
      contextSource: row.contextSource,
      postDispatchPath: row.postDispatchPath,
      concreteKeyValuesRecovered:
        row.callsiteName === "object-builder-b-resource-key-level-setup-query"
          ? false
          : row.callsiteName === "runtime-request-resolved-key-level-setup-query"
            ? false
            : null,
      unresolvedInput:
        row.callsiteName === "object-builder-b-resource-key-level-setup-query"
          ? "typed-object 0x03f3 payload word0 / local .vgr or captured frame payload"
          : row.callsiteName === "runtime-request-resolved-key-level-setup-query"
            ? "runtime selected cached key value behind 0xbebf54/0xbec044"
            : "unknown",
      activePreviewProof: false,
    }));
  const typedObjectInlineKeyWriterJumpTableEntry = readJumpTableTarget(
    buffer,
    elf,
    addresses.typedObjectDispatcherJumpTable,
    addresses.typedObjectInlineKeyWriterTypeId,
    0x3e9,
  );
  const storesFor = (targetName) => globalSlotStores.filter((row) => row.targetName === targetName);
  const hasStoreAt = (targetName, address) =>
    storesFor(targetName).some((row) => row.storeAddressHex === hex(address));
  const typedObjectDispatcherDirectCallerAddresses = new Set(
    (typedObjectDispatcher?.directCallers || []).map((caller) => caller.callerAddressHex),
  );
  const typedObjectDispatcherFrameStreamSourceRecovered =
    evidence.some((row) => row.address === 0x8130b0 && row.matched) &&
    evidence.some((row) => row.address === 0x8130ec && row.matched) &&
    evidence.some((row) => row.address === 0x813108 && row.matched) &&
    evidence.some((row) => row.address === 0x813184 && row.matched) &&
    evidence.some((row) => row.address === 0x81318c && row.matched) &&
    evidence.some((row) => row.address === 0x813190 && row.matched) &&
    evidence.some((row) => row.address === 0x8131fc && row.matched) &&
    evidence.some((row) => row.address === 0x81321c && row.matched) &&
    evidence.some((row) => row.address === 0x81322c && row.matched);
  const typedObjectDispatcherTimedQueueSourceRecovered =
    evidence.some((row) => row.address === 0x8444e4 && row.matched) &&
    evidence.some((row) => row.address === 0x844508 && row.matched) &&
    evidence.some((row) => row.address === 0x844524 && row.matched) &&
    evidence.some((row) => row.address === 0x84453c && row.matched) &&
    evidence.some((row) => row.address === 0x84454c && row.matched) &&
    evidence.some((row) => row.address === 0x84455c && row.matched) &&
    evidence.some((row) => row.address === 0x844580 && row.matched) &&
    evidence.some((row) => row.address === 0x844588 && row.matched) &&
    evidence.some((row) => row.address === 0x844594 && row.matched);
  const typedObjectVgrPathFormatStringValue = readCStringAtVirtualAddress(
    buffer,
    elf,
    addresses.typedObjectVgrPathFormatString,
  );
  const typedObjectReplayBaseNameStringValue = readCStringAtVirtualAddress(
    buffer,
    elf,
    addresses.typedObjectReplayBaseNameString,
  );
  const typedObjectReplayManifestNameStringValue = readCStringAtVirtualAddress(
    buffer,
    elf,
    addresses.typedObjectReplayManifestNameString,
  );
  const typedObjectVgrFileModeStringValue = readCStringAtVirtualAddress(
    buffer,
    elf,
    addresses.typedObjectVgrFileModeString,
  );
  const typedObjectVgrTimestampFormatStringValue = readCStringAtVirtualAddress(
    buffer,
    elf,
    addresses.typedObjectVgrTimestampFormatString,
  );
  const typedObjectVgrFileWriteModeStringValue = readCStringAtVirtualAddress(
    buffer,
    elf,
    addresses.typedObjectVgrFileWriteModeString,
  );
  const levelTypeDescriptorNameStringValue = readCStringAtVirtualAddress(
    buffer,
    elf,
    addresses.levelTypeDescriptorNameString,
  );
  const levelTypeDescriptorComputedHash = engineHashString(levelTypeDescriptorNameStringValue || "");
  const levelTypeDescriptorComputedHashHex = engineHashHex(levelTypeDescriptorNameStringValue || "");
  const typedObjectVgrLocalFileCandidates = findLocalVgrFileCandidates();
  const typedObjectVgrLocalFileScanRoots = defaultLocalVgrSearchRoots.filter((root) => fs.existsSync(root));
  const typedObjectRawIosDataAudit = auditIosRawDataTypedObjectPayloads();
  const typedObjectRawIosDataDeepHashAudit =
    auditTypedObjectCandidateResourceHashMatches(typedObjectRawIosDataAudit);
  const runtimeResourceKeyUpstreamRecoveryAudit = buildRuntimeResourceKeyUpstreamRecoveryAudit({
    evidence,
    typedObjectDispatcherInputSourceProfileBranches,
    typedObjectVgrLocalFileCandidates,
    typedObjectRawIosDataAudit,
    typedObjectRawIosDataDeepHashAudit,
    typedObjectVgrPathFormatStringValue,
    typedObjectReplayBaseNameStringValue,
    typedObjectReplayManifestNameStringValue,
    characterLobbyRuntimeProfileBranches,
    characterLobbyStateObjectProfileBranches,
  });
  const typedObjectInputSourceOwnershipAudit = buildTypedObjectInputSourceOwnershipAudit({
    evidence,
    referenceByName,
    typedObjectDispatcherInputSourceProfileBranches,
  });
  const typedObjectReplaySourceSelectorCallerAudit = buildTypedObjectReplaySourceSelectorCallerAudit({
    evidence,
    referenceByName,
    typedObjectReplaySourceSelectorProfileBranches,
  });
  const characterLobbyDraftUiReferences = [
    characterLobbyDraftSelectHeroString,
    characterLobbyDraftLockInHeroString,
    characterLobbyDraftLockedInButtonString,
    characterLobbyDraftHeroBanSoundString,
    characterLobbyDraftLockInSoundString,
    characterLobbyDraftSwapHeroesVoiceString,
    characterLobbyDraftNamedAllySelectingString,
    characterLobbyDraftNamedEnemySelectingString,
    characterLobbyDraftNamedEnemyBanningString,
  ].reduce((sum, record) => sum + (record?.textReferences.length || 0), 0);
  const levelVisualsApplyProcessorFieldRoutingAddresses = [
    addresses.levelVisualsApplySelectorListA,
    addresses.levelVisualsApplySelectorListACall,
    addresses.levelVisualsApplyTransformListA,
    addresses.levelVisualsApplyTransformListACall,
    addresses.levelVisualsApplyRuntimeListPredicateCall,
    addresses.levelVisualsApplyConditionalSelectorListA,
    addresses.levelVisualsApplyConditionalSelectorListACall,
    addresses.levelVisualsApplyConditionalTransformListA,
    addresses.levelVisualsApplyConditionalTransformListACall,
    addresses.levelVisualsApplyFallbackSelectorList,
    addresses.levelVisualsApplyFallbackSelectorListCall,
    addresses.levelVisualsApplyFallbackTransformList,
    addresses.levelVisualsApplyFallbackTransformListCall,
    addresses.levelVisualsApplyAuxList38,
    addresses.levelVisualsApplyAuxList38IndexLoad,
    addresses.levelVisualsApplyAuxList38Call,
    addresses.levelVisualsApplyAuxList40,
    addresses.levelVisualsApplyAuxList40IndexLoad,
    addresses.levelVisualsApplyAuxList40Call,
    addresses.levelVisualsApplyStaticLensFlareList,
    addresses.levelVisualsApplyStaticLensFlareObjectIndexLoad,
    addresses.levelVisualsApplyStaticLensFlareResourceAccessorCall,
    addresses.levelVisualsApplyStaticLensFlareResourceResolveCall,
    addresses.levelVisualsApplyStaticLensFlarePrimaryCall,
    addresses.levelVisualsApplyStaticLensFlareSecondaryCall,
    addresses.levelVisualsApplyProfilePayloadLoad,
    addresses.levelVisualsApplyProfilePayloadValidateCall,
    addresses.levelVisualsApplyProfileTempCallA,
    addresses.levelVisualsApplyProfileTempCallB,
    addresses.levelVisualsApplyProfileTempCallC,
    addresses.levelVisualsApplyProfilePayloadDispatchCall,
  ];
  const levelVisualsApplyProcessorFieldRoutingRecovered =
    levelVisualsApplyProcessorFieldRoutingAddresses.every((address) =>
      evidence.some((row) => row.address === address && row.matched),
    );
  const runtimeResourceKeyStaticRecoveryGate = {
    status: "static-exhausted-runtime-capture-or-payload-decoder-required",
    activeCandidateCallsiteHex: hex(addresses.runtimeResolvedKeyObjectRequestHelperCallsite),
    activeCandidateKeySource: "cached runtime resource key from 0xbebf54 normalized through 0xbec044",
    concreteKeyValuesRecovered: false,
    staticConcreteKeyRecoverable: runtimeResourceKeySetterInputContexts.some(
      (row) => row.staticConcreteKeyRecoverable,
    ),
    allSetterInputsRequireRuntimeCapture:
      runtimeResourceKeySetterInputContexts.length > 0 &&
      runtimeResourceKeySetterInputContexts.every((row) => row.requiresRuntimeCapture),
    setterInputSourceClasses: runtimeResourceKeySetterInputContexts.map((row) => ({
      callerAddressHex: row.callerAddressHex,
      sourceOwner: row.sourceOwner,
      sourceKind: row.sourceKind,
      sourceOffset: row.sourceOffset,
      activePreviewProof: row.activePreviewProof,
      staticConcreteKeyRecoverable: row.staticConcreteKeyRecoverable,
      requiresRuntimeCapture: row.requiresRuntimeCapture,
      blocker: row.concreteKeyBlocker,
    })),
    postAccessorCallerClassifications: runtimeResourceKeyPostAccessorCallerClassifications,
    globalResolverCallerClassifications: runtimeResourceKeyGlobalResolverCallerClassifications,
    activePostAccessorCandidateCount: runtimeResourceKeyPostAccessorActivePreviewCandidateCallers,
    settingsPostAccessorNegativeEvidenceCount: runtimeResourceKeyPostAccessorSettingsPreferredBuildPathCallers,
    globalResolverActivePreviewCandidateCount: runtimeResourceKeyGlobalResolverActivePreviewCandidateCallers,
    typedObjectPayloadReservoirPresent:
      typedObjectRawIosDataAudit.dataRootExists && typedObjectRawIosDataAudit.fileCount > 0,
    typedObjectLocalFrameCandidateCount:
      typedObjectRawIosDataAudit.frameCandidateCount +
      typedObjectRawIosDataAudit.deepScanFrameCandidateCount,
    typedObjectDeepScanFrameCandidateCount:
      typedObjectRawIosDataAudit.deepScanFrameCandidateCount,
    typedObjectDeepScanResourceLikeKeyFrameCandidateCount:
      typedObjectRawIosDataAudit.deepScanResourceLikeKeyFrameCandidateCount,
    typedObjectDeepScanObjectBuilderWord0EngineHashMatchCount:
      typedObjectRawIosDataDeepHashAudit.engineHashMatchCount,
    typedObjectPayloadConfirmed: false,
    localVgrCandidateCount: typedObjectVgrLocalFileCandidates.length,
    acceptedRecoveryPaths: [
      "import a real runtime selector capture with a closed active-helper -> Level setup -> LevelVisuals -> profile sequence",
      "recover and decode the upstream typed-object/frame/.vgr payload that supplies the concrete active key",
      "prove a separate current-package non-stream active preview source that reaches Level setup descriptor 0x2ae61c8 / Level hash 0x858E20D4",
    ],
    rejectedRecoveryPaths: [
      "assigning MapViewer_5v5 or any lightfield by static candidate name only",
      "promoting UI::SKIN_VIEWER, preview, or presentationData string xrefs without a LevelVisuals/profile-loader neighborhood",
      "using the global cached key alone as active preview proof",
    ],
    interpretation:
      "The only active Level setup helper candidate is 0x8befac, but its dispatch key comes from runtime-selected cached state. All direct global key setter inputs are payload/record driven, not static literals, and the bounded post-accessor caller set has one active candidate plus Settings negative evidence. Static analysis therefore cannot safely choose a concrete hero/model preview profile here.",
  };
  const summary = {
    instructionChecks: evidence.length,
    instructionOpcodeMismatches: evidence.filter((row) => !row.matched).length,
    allInstructionChecksMatched,
    moduleRegistrationDirectCallers: moduleRegistration?.directCallers.length || 0,
    moduleRegistrationNeighborCalls: moduleRegistrationNeighborCalls.length,
    levelRuntimeModuleRegistrationInHub: moduleRegistrationNeighborCalls.some((row) => row.isLevelRuntimeModuleRegistration),
    vtableBaseTextReferences: vtableBase?.textReferences.length || 0,
    objectInitializerTextReferences: objectInitializer?.textReferences.length || 0,
    invokeCallbackTextReferences: invokeCallback?.textReferences.length || 0,
    ownerDispatchDirectCallers: ownerDispatch?.directCallers.length || 0,
    ownerDispatchCallsiteConfirmed:
      ownerDispatch?.directCallers.some((caller) => caller.callerAddressHex === hex(addresses.levelRuntimeOwnerDispatchCallsite)) ||
      false,
    ownerDispatchCallsiteReferences:
      (ownerDispatchCallsite?.directCallers.length || 0) +
      (ownerDispatchCallsite?.u64References.length || 0) +
      (ownerDispatchCallsite?.textReferences.length || 0),
    levelSetupModuleRegistrationDirectCallers: levelSetupModuleRegistration?.directCallers.length || 0,
    levelSetupModuleRegistrationInHub:
      levelSetupModuleRegistration?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.levelSetupModuleRegistrationHubCallsite),
      ) || false,
    levelSetupObjectInitializerTextReferences: levelSetupModuleObjectInitializer?.textReferences.length || 0,
    levelSetupInvokeCallbackTextReferences: levelSetupModuleVirtualInvokeCallback?.textReferences.length || 0,
    levelSetupRegisteredCallbackTextReferences: levelSetupRegisteredCallback?.textReferences.length || 0,
    levelSetupRegisteredCallbackDirectCallers: levelSetupRegisteredCallback?.directCallers.length || 0,
    levelSetupRegistryDescriptorStaticTextReferences:
      levelSetupRegistryRecordGlobalSlot?.textReferences.length || 0,
    levelSetupRegistryDescriptorStaticU64References:
      levelSetupRegistryRecordGlobalSlot?.u64References.length || 0,
    levelSetupRegistryDescriptorDirectCallers:
      levelSetupRegistryRecordGlobalSlot?.directCallers.length || 0,
    levelSetupDescriptorPointerSlotU64References:
      referenceByName.get("levelSetupDescriptorPointerSlot")?.u64References.length || 0,
    levelTypeDescriptorTextReferences:
      referenceByName.get("levelTypeDescriptor")?.textReferences.length || 0,
    levelTypeDescriptorU64References:
      referenceByName.get("levelTypeDescriptor")?.u64References.length || 0,
    levelTypeDescriptorNameStringValue,
    levelTypeDescriptorComputedHash,
    levelTypeDescriptorComputedHashHex,
    levelTypeDescriptorInitRecovered:
      levelTypeDescriptorNameStringValue === "Level" &&
      levelTypeDescriptorComputedHashHex === "858E20D4" &&
      evidence.some((row) => row.address === 0x7cda00 && row.matched) &&
      evidence.some((row) => row.address === 0x7cda08 && row.matched) &&
      evidence.some((row) => row.address === 0x7cda10 && row.matched) &&
      evidence.some((row) => row.address === 0x7cda20 && row.matched) &&
      evidence.some((row) => row.address === 0x7cda34 && row.matched),
    levelSetupDescriptorStaticRefsBounded:
      (levelSetupRegistryRecordGlobalSlot?.textReferences.length || 0) === 1 &&
      (levelSetupRegistryRecordGlobalSlot?.u64References.length || 0) === 1 &&
      (levelSetupRegistryRecordGlobalSlot?.directCallers.length || 0) === 0,
    levelSetupRegisteredCallbackStaticRefsBounded:
      (levelSetupRegisteredCallback?.textReferences.length || 0) === 1 &&
      (levelSetupRegisteredCallback?.directCallers.length || 0) === 0,
    levelSetupCallbackRegistrationTailCallConfirmed:
      genericCallbackRegistration?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.levelSetupCallbackGenericRegistrationCallsite),
      ) || false,
    genericCallbackRegistrationDirectTailCallers: genericCallbackRegistration?.directCallers.length || 0,
    genericCallbackTreeInsertConfirmed:
      genericCallbackRegistrationTreeInsert?.directCallers.some((caller) => caller.callerAddressHex === "0x188ecd4") ||
      false,
    genericCallbackDispatchDirectCallers: genericCallbackDispatch?.directCallers.length || 0,
    genericCallbackDispatchCallsiteClassifications,
    genericCallbackDispatchCallsitesWithMatchedOpcodes:
      genericCallbackDispatchCallsiteContexts.filter((row) => row.opcodesMatched).length,
    genericCallbackDispatchCallsitesUsingLevelSetupRegistryDescriptor,
    genericCallbackDispatchCallsitesUsingResolverOutputDescriptor,
    genericCallbackDispatchCallsitesFullyClassified:
      (genericCallbackDispatch?.directCallers.length || 0) === genericCallbackDispatchCallsiteContexts.length &&
      genericCallbackDispatchCallsiteContexts.every((row) => row.opcodesMatched),
    genericCallbackDispatchPayloadResolverDirectCallers:
      genericCallbackDispatchPayloadResolver?.directCallers.length || 0,
    genericCallbackDispatchHelperDirectCallers: genericCallbackDispatchHelper?.directCallers.length || 0,
    genericCallbackDispatchHelperCallsiteClassifications,
    genericCallbackDispatchHelperCallsitesWithMatchedOpcodes:
      genericCallbackDispatchHelperCallsiteContexts.filter((row) => row.opcodesMatched).length,
    genericCallbackDispatchHelperCallsitesWithLevelSetupIndexQuery,
    genericCallbackDispatchHelperActivePreviewCandidateCallsites,
    levelSetupActivePreviewCandidateConcreteKeyValuesRecovered: false,
    levelSetupActivePreviewCandidatesBoundedButUnresolved:
      genericCallbackDispatchHelperActivePreviewCandidateCallsites > 0,
    levelSetupActivePreviewCandidateBlockers: levelSetupActivePreviewCandidateContexts.map((row) => ({
      callsiteName: row.callsiteName,
      callerAddressHex: row.callerAddressHex,
      unresolvedInput: row.unresolvedInput,
    })),
    genericCallbackDispatchHelperCallsitesFullyClassified:
      (genericCallbackDispatchHelper?.directCallers.length || 0) ===
        genericCallbackDispatchHelperCallsiteContexts.length &&
      genericCallbackDispatchHelperCallsiteContexts.every((row) => row.opcodesMatched),
    descriptorPayloadResolverShimDirectCallers: descriptorPayloadResolverShim?.directCallers.length || 0,
    descriptorPayloadResolverShimLocalProfileBranches:
      descriptorPayloadResolverShimProfileBranches.length,
    descriptorPayloadResolverShimCallerClassifications,
    descriptorPayloadResolverShimStringBackedCallers: descriptorPayloadResolverShimCallerContexts.filter(
      (row) => row.stringValues.length > 0,
    ).length,
    descriptorPayloadResolverShimUnclassifiedCallers:
      descriptorPayloadResolverShimCallerClassifications["unclassified-dynamic"] || 0,
    descriptorPayloadResolverShimActivePreviewCandidateCallers,
    descriptorPayloadResolverShimCallersBounded:
      (descriptorPayloadResolverShim?.directCallers.length || 0) > 0 &&
      descriptorPayloadResolverShimProfileBranches.length === 0 &&
      descriptorPayloadResolverShimActivePreviewCandidateCallers === 0,
    descriptorPayloadResolverDirectTailCallers: descriptorPayloadResolver?.directCallers.length || 0,
    typedObjectDispatcherDirectCallers: typedObjectDispatcher?.directCallers.length || 0,
    typedObjectDispatcherFrameStreamSourceRecovered,
    typedObjectDispatcherTimedQueueSourceRecovered,
    typedObjectDispatcherInputSourcesFullyClassified:
      (typedObjectDispatcher?.directCallers.length || 0) === 2 &&
      typedObjectDispatcherDirectCallerAddresses.has(hex(addresses.typedObjectDispatcherFrameCallerCallsite)) &&
      typedObjectDispatcherDirectCallerAddresses.has(hex(addresses.typedObjectDispatcherTimedQueueCallerCallsite)) &&
      typedObjectDispatcherFrameStreamSourceRecovered &&
      typedObjectDispatcherTimedQueueSourceRecovered,
    typedObjectDispatcherInputSourceProfileBranches:
      typedObjectDispatcherInputSourceProfileBranches.length,
    typedObjectDispatcherJumpTableTextReferences: typedObjectDispatcherJumpTable?.textReferences.length || 0,
    objectBuilderBTypeIdHex: hex(addresses.objectBuilderBTypeId),
    objectBuilderBTypeIdDecimal: addresses.objectBuilderBTypeId,
    objectBuilderBDispatchCaseReferences:
      (objectBuilderBDispatchCase?.directCallers.length || 0) +
      (objectBuilderBDispatchCase?.u64References.length || 0) +
      (objectBuilderBDispatchCase?.textReferences.length || 0),
    objectBuilderBParserWrapperDirectCallers: objectBuilderBParserWrapper?.directCallers.length || 0,
    objectBuilderBConstructorDirectCallers: objectBuilderBConstructor?.directCallers.length || 0,
    objectBuilderBVtableDataReferences:
      (objectBuilderBVtableObjectPointer?.u64References.length || 0) +
      (objectBuilderBVtableObjectPointer?.textReferences.length || 0),
    typedObjectVgrPathBuilderDirectCallers: typedObjectVgrPathBuilder?.directCallers.length || 0,
    typedObjectVgrOpenFunctionDirectCallers: typedObjectVgrOpenFunction?.directCallers.length || 0,
    typedObjectVgrReadFunctionDirectCallers: typedObjectVgrReadFunction?.directCallers.length || 0,
    typedObjectVgrPathFormatTextReferences: typedObjectVgrPathFormatString?.textReferences.length || 0,
    typedObjectVgrFileModeTextReferences: typedObjectVgrFileModeString?.textReferences.length || 0,
    typedObjectVgrPathFormatStringValue,
    typedObjectReplayBaseNameStringValue,
    typedObjectReplayManifestNameStringValue,
    typedObjectVgrFileModeStringValue,
    typedObjectVgrTimestampFormatStringValue,
    typedObjectVgrFileWriteModeStringValue,
    typedObjectVgrPathFormatStringRecovered:
      typedObjectVgrPathFormatStringValue === "%s/%s.%d.vgr",
    typedObjectReplayDefaultNamesRecovered:
      typedObjectReplayBaseNameStringValue === "test007" &&
      typedObjectReplayManifestNameStringValue === "replayManifest.txt",
    typedObjectVgrFileModeStringRecovered: typedObjectVgrFileModeStringValue === "rb",
    typedObjectVgrTimestampFormatStringRecovered:
      typedObjectVgrTimestampFormatStringValue === "_%Y-%m-%dT%H-%M-%S.dat",
    typedObjectVgrFileWriteModeStringRecovered: typedObjectVgrFileWriteModeStringValue === "wb",
    typedObjectVgrLocalFileCandidateCount: typedObjectVgrLocalFileCandidates.length,
    typedObjectVgrLocalFilesFound: typedObjectVgrLocalFileCandidates.length > 0,
    runtimeResourceKeyUpstreamRecoveryState: runtimeResourceKeyUpstreamRecoveryAudit.status,
    runtimeResourceKeyUpstreamSourceCount: runtimeResourceKeyUpstreamRecoveryAudit.sourceCount,
    runtimeResourceKeyUpstreamSourcesWithStrictProfileBranches:
      runtimeResourceKeyUpstreamRecoveryAudit.sourcesWithStrictProfileBranches,
    runtimeResourceKeyUpstreamLocalDecodedPayloadAvailable:
      runtimeResourceKeyUpstreamRecoveryAudit.localDecodedPayloadAvailable,
    runtimeResourceKeyUpstreamConcreteActiveKeyRecovered:
      runtimeResourceKeyUpstreamRecoveryAudit.concreteActiveKeyRecovered,
    typedObjectInputSourceOwnershipState: typedObjectInputSourceOwnershipAudit.status,
    typedObjectInputSourceOwnershipRecovered: typedObjectInputSourceOwnershipAudit.recovered,
    typedObjectInputSourceGlobalSlotHex: typedObjectInputSourceOwnershipAudit.globalSourceSlotHex,
    typedObjectInputSourceModeCount: typedObjectInputSourceOwnershipAudit.modeCount,
    typedObjectInputSourceActivePreviewProof: typedObjectInputSourceOwnershipAudit.activePreviewProof,
    typedObjectInputSourceRendererTakeoverAllowed:
      typedObjectInputSourceOwnershipAudit.rendererProfileTakeoverAllowed,
    typedObjectReplaySourceSelectorCallerState: typedObjectReplaySourceSelectorCallerAudit.status,
    typedObjectReplaySourceSelectorCallersRecovered: typedObjectReplaySourceSelectorCallerAudit.recovered,
    typedObjectReplaySourceSelectorDirectCallerCount:
      typedObjectReplaySourceSelectorCallerAudit.selectorDirectCallerCount,
    typedObjectReplaySourceSelectorModeZeroCallerCount:
      typedObjectReplaySourceSelectorCallerAudit.modeZeroCallerCount,
    typedObjectReplaySourceSelectorModeOneCallerCount:
      typedObjectReplaySourceSelectorCallerAudit.modeOneCallerCount,
    typedObjectReplaySourceSelectorStrictProfileBranchCount:
      typedObjectReplaySourceSelectorCallerAudit.strictProfileBranchCount,
    typedObjectReplaySourceSelectorActivePreviewProof:
      typedObjectReplaySourceSelectorCallerAudit.activePreviewProof,
    typedObjectReplaySourceSelectorRendererTakeoverAllowed:
      typedObjectReplaySourceSelectorCallerAudit.rendererProfileTakeoverAllowed,
    typedObjectRawIosDataRootExists: typedObjectRawIosDataAudit.dataRootExists,
    typedObjectRawIosDataFileCount: typedObjectRawIosDataAudit.fileCount,
    typedObjectRawIosDataExtensionlessFileCount: typedObjectRawIosDataAudit.extensionlessFileCount,
    typedObjectRawIosDataHashNamedFileCount: typedObjectRawIosDataAudit.hashNamedFileCount,
    typedObjectRawIosDataTotalSizeBytes: typedObjectRawIosDataAudit.totalSizeBytes,
    typedObjectRawIosDataPrefixBytes: typedObjectRawIosDataAudit.prefixBytes,
    typedObjectRawIosDataCff0PrefixBytes: typedObjectRawIosDataAudit.cff0PrefixBytes,
    typedObjectRawIosDataPrefixClassifications: typedObjectRawIosDataAudit.prefixClassifications,
    typedObjectRawIosDataRsc0FileCount: typedObjectRawIosDataAudit.rsc0FileCount,
    typedObjectRawIosDataRsc0HeaderPayloadSizeMatchCount:
      typedObjectRawIosDataAudit.rsc0HeaderPayloadSizeMatchCount,
    typedObjectRawIosDataRsc0InnerClassifications:
      typedObjectRawIosDataAudit.rsc0InnerClassifications,
    typedObjectRawIosDataCff0FileCount: typedObjectRawIosDataAudit.cff0FileCount,
    typedObjectRawIosDataCff0ParsedPrefixCount: typedObjectRawIosDataAudit.cff0ParsedPrefixCount,
    typedObjectRawIosDataCff0Classifications: typedObjectRawIosDataAudit.cff0Classifications,
    typedObjectRawIosDataCff0FirstChunkMagicCounts:
      typedObjectRawIosDataAudit.cff0FirstChunkMagicCounts,
    typedObjectRawIosDataCff0ChunkMagicCounts: typedObjectRawIosDataAudit.cff0ChunkMagicCounts,
    typedObjectRawIosDataHeuristicState: typedObjectRawIosDataAudit.heuristicState,
    typedObjectRawIosDataFrameCandidateCount: typedObjectRawIosDataAudit.frameCandidateCount,
    typedObjectRawIosDataFrameCandidatesCapped: typedObjectRawIosDataAudit.frameCandidatesCapped || false,
    typedObjectRawIosDataDeepScanBytes: typedObjectRawIosDataAudit.deepScanBytes,
    typedObjectRawIosDataDeepScanFileCount: typedObjectRawIosDataAudit.deepScanFileCount,
    typedObjectRawIosDataDeepScanBytesRead: typedObjectRawIosDataAudit.deepScanBytesRead,
    typedObjectRawIosDataDeepFrameCandidateCount:
      typedObjectRawIosDataAudit.deepScanFrameCandidateCount,
    typedObjectRawIosDataDeepFrameCandidateTypeCounts:
      typedObjectRawIosDataAudit.deepScanFrameCandidateTypeCounts,
    typedObjectRawIosDataDeepResourceLikeKeyFrameCandidateCount:
      typedObjectRawIosDataAudit.deepScanResourceLikeKeyFrameCandidateCount,
    typedObjectRawIosDataDeepResourceLikeKeyFrameCandidateTypeCounts:
      typedObjectRawIosDataAudit.deepScanResourceLikeKeyFrameCandidateTypeCounts,
    typedObjectRawIosDataDeepFrameCandidatesCapped:
      typedObjectRawIosDataAudit.deepScanFrameCandidatesCapped || false,
    typedObjectRawIosDataDeepObjectBuilderWord0CandidateCount:
      typedObjectRawIosDataDeepHashAudit.candidateWordCount,
    typedObjectRawIosDataDeepObjectBuilderWord0EngineHashMatchCount:
      typedObjectRawIosDataDeepHashAudit.engineHashMatchCount,
    typedObjectRawIosDataDeepObjectBuilderWord0EngineHashState:
      typedObjectRawIosDataDeepHashAudit.state,
    typedObjectRawIosDataPayloadReservoirPresent:
      typedObjectRawIosDataAudit.dataRootExists && typedObjectRawIosDataAudit.fileCount > 0,
    typedObjectRawIosDataPayloadConfirmed: false,
    objectBuilderBConcreteResourceKeyValuesRecovered: false,
    objectBuilderBConcreteResourceKeyRecoveryState:
      typedObjectVgrLocalFileCandidates.length > 0
        ? "local-vgr-candidates-need-decoding"
        : "blocked-without-confirmed-vgr-or-frame-payload",
    typedObjectFreadWrapperDirectCallers: typedObjectFreadWrapper?.directCallers.length || 0,
    typedObjectRuntimeKeySelectionTypeIdHex: hex(addresses.typedObjectRuntimeKeySelectionTypeId),
    typedObjectRuntimeKeySelectionTypeIdDecimal: addresses.typedObjectRuntimeKeySelectionTypeId,
    typedObjectRuntimeKeySelectionDispatchCaseReferences:
      (typedObjectRuntimeKeySelectionDispatchCase?.directCallers.length || 0) +
      (typedObjectRuntimeKeySelectionDispatchCase?.u64References.length || 0) +
      (typedObjectRuntimeKeySelectionDispatchCase?.textReferences.length || 0),
    typedObjectRuntimeKeySelectionHelperDirectCallers:
      typedObjectRuntimeKeySelectionHelper?.directCallers.length || 0,
    typedObjectInlineKeyWriterTypeIdHex: hex(addresses.typedObjectInlineKeyWriterTypeId),
    typedObjectInlineKeyWriterTypeIdDecimal: addresses.typedObjectInlineKeyWriterTypeId,
    typedObjectInlineKeyWriterJumpTableTarget:
      typedObjectInlineKeyWriterJumpTableEntry?.targetAddressHex || "",
    typedObjectInlineKeyWriterDispatchCaseReferences:
      (typedObjectInlineKeyWriterDispatchCase?.directCallers.length || 0) +
      (typedObjectInlineKeyWriterDispatchCase?.u64References.length || 0) +
      (typedObjectInlineKeyWriterDispatchCase?.textReferences.length || 0),
    typedObjectInlineKeyWriterHelperDirectCallers:
      typedObjectInlineKeyWriterHelper?.directCallers.length || 0,
    typedObjectInlineKeyWriterHelperCallsiteReferences:
      (typedObjectInlineKeyWriterHelperCallsite?.directCallers.length || 0) +
      (typedObjectInlineKeyWriterHelperCallsite?.u64References.length || 0) +
      (typedObjectInlineKeyWriterHelperCallsite?.textReferences.length || 0),
    runtimeResourceKeySelectionSetterDirectCallers:
      runtimeResourceKeySelectionSetter?.directCallers.length || 0,
    runtimeResourceKeyGlobalSetterDirectCallers: runtimeResourceKeyGlobalSetter?.directCallers.length || 0,
    runtimeResourceKeyGlobalSetterLocalConsumerBranches:
      runtimeResourceKeyGlobalSetterLocalBranches.length,
    runtimeResourceKeyGlobalSetterLocalProfileBranches:
      runtimeResourceKeyGlobalSetterLocalProfileBranches.length,
    runtimeResourceKeyGlobalSetterKnownCallerSetRecovered:
      (runtimeResourceKeyGlobalSetter?.directCallers || []).some(
        (caller) => caller.callerAddressHex === hex(0x82b6c0),
      ) &&
      (runtimeResourceKeyGlobalSetter?.directCallers || []).some(
        (caller) => caller.callerAddressHex === hex(0x8bf574),
      ) &&
      (runtimeResourceKeyGlobalSetter?.directCallers || []).some(
        (caller) => caller.callerAddressHex === hex(0xa7ca68),
      ),
    runtimeResourceKeySetterInputContextsRecovered:
      runtimeResourceKeySetterInputContexts.length === 3 &&
      runtimeResourceKeySetterInputContexts.every((row) => row.opcodesMatched),
    runtimeResourceKeySetterConcreteValuesStaticRecoverable:
      runtimeResourceKeySetterInputContexts.some((row) => row.staticConcreteKeyRecoverable),
    runtimeResourceKeySetterConcreteValuesRequireRuntimeCapture:
      runtimeResourceKeySetterInputContexts.every((row) => row.requiresRuntimeCapture),
    runtimeResourceKeySetterInputSourceClassifications: countBy(
      runtimeResourceKeySetterInputContexts,
      (row) => row.sourceKind,
    ),
    runtimeResourceKeyGlobalCacheIsActivePreviewProof: false,
    runtimeResolvedKeyObjectDualKeyLayoutRecovered:
      evidence.some((row) => row.address === 0xbe3a5c && row.matched) &&
      evidence.some((row) => row.address === 0xbe3a60 && row.matched) &&
      evidence.some((row) => row.address === 0xbe3a70 && row.matched) &&
      evidence.some((row) => row.address === 0xbec044 && row.matched),
    runtimeResolvedKeyObjectPreOwnerKeyOffsetHex: "0x8",
    runtimeResolvedKeyObjectDispatchKeyOffsetHex: "0x20",
    runtimeResolvedKeyObjectComesFromResourceTableResolver:
      evidence.some((row) => row.address === 0xc72dd8 && row.matched) &&
      evidence.some((row) => row.address === 0xc72de4 && row.matched) &&
      evidence.some((row) => row.address === 0xc72df0 && row.matched) &&
      evidence.some((row) => row.address === 0x188f978 && row.matched),
    runtimeResolvedKeyObjectResolverReturnSource: "resource table resolver return value from 0x188f8f8 matched node +0x28",
    resourceKeyTableGlobalRootLifecycleRecovered:
      evidence.some((row) => row.address === 0xc729b4 && row.matched) &&
      evidence.some((row) => row.address === 0xc72a08 && row.matched) &&
      evidence.some((row) => row.address === 0xc72ef0 && row.matched) &&
      evidence.some((row) => row.address === 0xc72dc0 && row.matched),
    resourceKeyTableGlobalRootSlotHex: hex(addresses.resourceKeyTableGlobalRootSlot),
    resourceKeyTableRootObjectKnownFields: ["+0x28", "+0x30", "+0x38", "+0x40"],
    resourceKeyTableHashStringLookupRecovered:
      evidence.some((row) => row.address === 0xc72cec && row.matched) &&
      evidence.some((row) => row.address === 0xc72d28 && row.matched) &&
      evidence.some((row) => row.address === 0xc72d60 && row.matched) &&
      evidence.some((row) => row.address === 0xc72d6c && row.matched),
    resourceKeyTableEntryHashArrayOffsetHex: "0x30",
    resourceKeyTableEntryCountOffsetHex: "0x38",
    resourceKeyTableEntryVectorOffsetHex: "0x40",
    resourceKeyTableMatchedEntryKeyOffsetHex: "0x0",
    resourceKeyTableMatchedEntryPayloadAliasOffsetHex: "0x8",
    resourceKeyByIdPayloadLookupRecovered:
      evidence.some((row) => row.address === 0xc72df4 && row.matched) &&
      evidence.some((row) => row.address === 0xc72e0c && row.matched) &&
      evidence.some((row) => row.address === 0xc72e28 && row.matched),
    resourceKeyByIdTypedLookupRecovered:
      evidence.some((row) => row.address === 0xc72e2c && row.matched) &&
      evidence.some((row) => row.address === 0xc72e74 && row.matched) &&
      evidence.some((row) => row.address === 0xc72e88 && row.matched) &&
      evidence.some((row) => row.address === 0xc72e94 && row.matched) &&
      evidence.some((row) => row.address === 0xc72e98 && row.matched) &&
      evidence.some((row) => row.address === 0xc72ea4 && row.matched),
    resourceKeyByIdTypedLookupDescriptorCheckOffsetHex: "0x4",
    runtimeResourceKeySetterSourcesClassifiedButNotPreviewProven:
      (runtimeResourceKeyGlobalSetter?.directCallers || []).length === 3 &&
      runtimeResourceKeyGlobalSetterLocalProfileBranches.length === 0 &&
      runtimeResourceKeyGlobalResolverActivePreviewCandidateCallers === 0,
    runtimeResourceKeyActivePreviewUnresolvedEdge:
      "concrete cached key selected behind 0xbebf54/0xbec044 and the upstream setter source that proves hero/model preview Level/Profile selection",
    runtimeResolvedKeyIndexQueryConsumerState: runtimeResolvedKeyIndexQueryConsumerAudit.status,
    runtimeResolvedKeyIndexQueryConsumersRecovered: runtimeResolvedKeyIndexQueryConsumerAudit.recovered,
    runtimeResolvedKeyIndexQueryUniqueCallsites:
      runtimeResolvedKeyIndexQueryConsumerAudit.uniqueIndexQueryCallsiteCount,
    runtimeResolvedKeyIndexQueryLevelSetupCount:
      runtimeResolvedKeyIndexQueryConsumerAudit.levelSetupIndexQueryCount,
    runtimeResolvedKeyIndexQueryNonLevelSetupCount:
      runtimeResolvedKeyIndexQueryConsumerAudit.nonLevelSetupIndexQueryCount,
    runtimeResolvedKeyIndexQueryUnknownCount:
      runtimeResolvedKeyIndexQueryConsumerAudit.unknownIndexQueryCount,
    runtimeResolvedKeyIndexQueryConcreteActiveKeyRecovered:
      runtimeResolvedKeyIndexQueryConsumerAudit.concreteActiveKeyRecovered,
    runtimeResourceKeyStaticRecoveryState: runtimeResourceKeyStaticRecoveryGate.status,
    runtimeResourceKeyStaticConcreteKeyRecoverable:
      runtimeResourceKeyStaticRecoveryGate.staticConcreteKeyRecoverable,
    runtimeResourceKeyAllSetterInputsRequireRuntimeCapture:
      runtimeResourceKeyStaticRecoveryGate.allSetterInputsRequireRuntimeCapture,
    runtimeResourceKeyAcceptedRecoveryPathCount:
      runtimeResourceKeyStaticRecoveryGate.acceptedRecoveryPaths.length,
    runtimeResourceKeyRejectedRecoveryPathCount:
      runtimeResourceKeyStaticRecoveryGate.rejectedRecoveryPaths.length,
    runtimeResourceKeyGlobalResolverDirectCallers:
      runtimeResourceKeyGlobalResolver?.directCallers.length || 0,
    runtimeResourceKeyGlobalResolverCallerClassifications:
      runtimeResourceKeyGlobalResolverCallerClassifications,
    runtimeResourceKeyGlobalResolverCallsitesFullyClassified:
      runtimeResourceKeyGlobalResolverCallsitesFullyClassified,
    runtimeResourceKeyGlobalResolverActivePreviewCandidateCallers:
      runtimeResourceKeyGlobalResolverActivePreviewCandidateCallers,
    runtimeResourceKeyResolvedAccessorDirectCallers:
      runtimeResourceKeyResolvedAccessor?.directCallers.length || 0,
    runtimeResourceKeyPostAccessorDirectCallers: runtimeResourceKeyPostAccessor?.directCallers.length || 0,
    runtimeResourceKeyPostAccessorCallerClassifications:
      runtimeResourceKeyPostAccessorCallerClassifications,
    runtimeResourceKeyPostAccessorCallsitesFullyClassified:
      runtimeResourceKeyPostAccessorCallsitesFullyClassified,
    runtimeResourceKeyPostAccessorActivePreviewCandidateCallers:
      runtimeResourceKeyPostAccessorActivePreviewCandidateCallers,
    runtimeResourceKeyPostAccessorSettingsPreferredBuildPathCallers:
      runtimeResourceKeyPostAccessorSettingsPreferredBuildPathCallers,
    runtimeResourceKeyPostAccessorNonActiveCallersClassifiedAsSettings:
      runtimeResourceKeyPostAccessorCallerContexts.length ===
        runtimeResourceKeyPostAccessorActivePreviewCandidateCallers +
          runtimeResourceKeyPostAccessorSettingsPreferredBuildPathCallers &&
      runtimeResourceKeyPostAccessorSettingsPreferredBuildPathCallers === 2,
    runtimeResourceKeyResolvedAccessorLocalConsumerScanTargets:
      runtimeResolvedKeyLocalConsumerTargets.length,
    runtimeResourceKeyResolvedAccessorLocalConsumerBranches:
      runtimeResolvedKeyLocalConsumerBranches.length,
    runtimeResourceKeyResolvedAccessorLocalProfileConsumerBranches:
      runtimeResolvedKeyLocalProfileConsumerBranches.length,
    runtimeResourceKeyGlobalStringSlotTextReferences:
      runtimeResourceKeyGlobalStringSlot?.textReferences.length || 0,
    runtimeResourceKeyGlobalResolvedSlotTextReferences:
      runtimeResourceKeyGlobalResolvedSlot?.textReferences.length || 0,
    runtimeResourceKeyStatusPredicateDirectCallers:
      runtimeResourceKeyStatusPredicate?.directCallers.length || 0,
    runtimeResourceKeyStatusPredicateLocalConsumerBranches:
      runtimeResourceKeyStatusPredicateLocalBranches.length,
    runtimeResourceKeyStatusPredicateLocalProfileBranches:
      runtimeResourceKeyStatusPredicateLocalProfileBranches.length,
    runtimeResourceKeyStatusPredicateCharacterLobbyCallerConfirmed:
      runtimeResourceKeyStatusPredicate?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(0xa7cac4),
      ) || false,
    runtimeResourceKeyStatusPredicateCharacterLobbyResolvedKeyCheckRecovered:
      evidence.some((row) => row.address === 0xa7cac0 && row.matched) &&
      evidence.some((row) => row.address === 0xa7cac4 && row.matched) &&
      evidence.some((row) => row.address === 0xa7cae0 && row.matched),
    runtimeResourceKeyStatusPredicateCharacterLobbyLocalBranches:
      characterLobbyStatusPredicateBranches.length,
    runtimeCurrentKeyOwnerGlobalSlotTextReferences:
      runtimeCurrentKeyOwnerGlobalSlot?.textReferences.length || 0,
    runtimeCurrentKeyOwnerGlobalSlotStores:
      storesFor("runtimeCurrentKeyOwnerGlobalSlot").length,
    runtimeCurrentKeyOwnerAccessorDirectCallers:
      runtimeCurrentKeyOwnerAccessor?.directCallers.length || 0,
    runtimeCurrentKeyOwnerConstructorDirectCallers:
      runtimeCurrentKeyOwnerConstructor?.directCallers.length || 0,
    runtimeCurrentKeyOwnerDestructorDirectCallers:
      runtimeCurrentKeyOwnerDestructor?.directCallers.length || 0,
    runtimeCurrentKeyOwnerChildIndexTextReferences:
      runtimeCurrentKeyOwnerChildIndexGlobalSlot?.textReferences.length || 0,
    runtimeCurrentKeyOwnerChildIndexStores:
      storesFor("runtimeCurrentKeyOwnerChildIndexGlobalSlot").length,
    runtimeCurrentKeyOwnerChildIndexRegistrationDirectCallers:
      runtimeCurrentKeyOwnerChildIndexRegistration?.directCallers.length || 0,
    runtimeCurrentKeyOwnerChildSlot4CallbackDirectCallers:
      runtimeCurrentKeyOwnerChildSlot4Callback?.directCallers.length || 0,
    runtimeCurrentSecondaryObjectIndexTextReferences:
      runtimeCurrentSecondaryObjectIndexGlobalSlot?.textReferences.length || 0,
    runtimeCurrentSecondaryObjectIndexStores:
      storesFor("runtimeCurrentSecondaryObjectIndexGlobalSlot").length,
    runtimeCurrentSecondaryObjectIndexRegistrationDirectCallers:
      runtimeCurrentSecondaryObjectIndexRegistration?.directCallers.length || 0,
    runtimeCurrentSecondaryObjectFirstKeyedCallbackDirectCallers:
      runtimeCurrentSecondaryObjectKeyedCallbackFirst?.directCallers.length || 0,
    runtimeCurrentOwnerChildAccessorDirectCallers:
      runtimeCurrentOwnerChildAccessor?.directCallers.length || 0,
    runtimeCurrentOwnerActiveStateBridgeDirectCallers:
      runtimeCurrentOwnerActiveStateBridge?.directCallers.length || 0,
    runtimeCurrentOwnerPositionBridgeDirectCallers:
      runtimeCurrentOwnerPositionBridge?.directCallers.length || 0,
    runtimeCurrentOwnerStateRefreshBridgeDirectCallers:
      runtimeCurrentOwnerStateRefreshBridge?.directCallers.length || 0,
    runtimeCurrentOwnerStateCleanupBridgeDirectCallers:
      runtimeCurrentOwnerStateCleanupBridge?.directCallers.length || 0,
    runtimeCurrentOwnerRegistrationBuilderDirectCallers:
      runtimeCurrentOwnerRegistrationBuilder?.directCallers.length || 0,
    runtimeCurrentOwnerRegistryIndexTextReferences:
      runtimeCurrentOwnerRegistryIndexGlobalSlot?.textReferences.length || 0,
    runtimeCurrentOwnerRegistryIndexStores:
      storesFor("runtimeCurrentOwnerRegistryIndexGlobalSlot").length,
    runtimeCurrentOwnerRegistryIndexLazyInitializerReferences:
      (runtimeCurrentOwnerRegistryIndexLazyInitializer?.directCallers.length || 0) +
      (runtimeCurrentOwnerRegistryIndexLazyInitializer?.u64References.length || 0) +
      (runtimeCurrentOwnerRegistryIndexLazyInitializer?.textReferences.length || 0),
    runtimeCurrentOwnerRegistryIndexLazySourceSlotReferences:
      (runtimeCurrentOwnerRegistryIndexLazySourceSlot?.u64References.length || 0) +
      (runtimeCurrentOwnerRegistryIndexLazySourceSlot?.textReferences.length || 0),
    runtimeCurrentOwnerPrimaryCallbackTableReferences:
      (runtimeCurrentOwnerPrimaryCallbackTable?.textReferences.length || 0) +
      (runtimeCurrentOwnerPrimaryCallbackTable?.u64References.length || 0),
    runtimeCurrentOwnerSecondaryCallbackTableReferences:
      (runtimeCurrentOwnerSecondaryCallbackTable?.textReferences.length || 0) +
      (runtimeCurrentOwnerSecondaryCallbackTable?.u64References.length || 0),
    runtimeCurrentOwnerSlot4CallbackReferences:
      (runtimeCurrentOwnerSlot4Callback?.directCallers.length || 0) +
      (runtimeCurrentOwnerSlot4Callback?.textReferences.length || 0) +
      (runtimeCurrentOwnerSlot4Callback?.u64References.length || 0),
    runtimeCurrentOwnerSlot4UpdateDispatcherDirectCallers:
      runtimeCurrentOwnerSlot4UpdateDispatcher?.directCallers.length || 0,
    runtimeCurrentOwnerStatePositionProjectorDirectCallers:
      runtimeCurrentOwnerStatePositionProjector?.directCallers.length || 0,
    runtimeCurrentOwnerStateAttachDirectCallers:
      runtimeCurrentOwnerStateAttach?.directCallers.length || 0,
    runtimeCurrentOwnerPostAttachTransformRefreshDirectCallers:
      runtimeCurrentOwnerPostAttachTransformRefresh?.directCallers.length || 0,
    runtimeCurrentOwnerHudMinimapConstructorDirectCallers:
      runtimeCurrentOwnerHudMinimapConstructor?.directCallers.length || 0,
    runtimeCurrentOwnerHudMinimapConstructorEmbeddedCallersRecovered:
      (runtimeCurrentOwnerHudMinimapConstructor?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.runtimeCurrentOwnerHudMinimapLargeOwnerConstructorCallsiteA),
      ) || false) &&
      (runtimeCurrentOwnerHudMinimapConstructor?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.runtimeCurrentOwnerHudMinimapLargeOwnerConstructorCallsiteB),
      ) || false) &&
      (runtimeCurrentOwnerHudMinimapConstructor?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.runtimeCurrentOwnerHudMinimapLargeOwnerConstructorCallsiteC),
      ) || false),
    runtimeCurrentOwnerHudMinimapUpdateDirectCallers:
      runtimeCurrentOwnerHudMinimapUpdate?.directCallers.length || 0,
    runtimeCurrentOwnerHudMinimapUpdateEmbeddedCallersRecovered:
      (runtimeCurrentOwnerHudMinimapUpdate?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.runtimeCurrentOwnerHudMinimapUpdateCallsiteA),
      ) || false) &&
      (runtimeCurrentOwnerHudMinimapUpdate?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.runtimeCurrentOwnerHudMinimapUpdateCallsiteB),
      ) || false) &&
      (runtimeCurrentOwnerHudMinimapUpdate?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.runtimeCurrentOwnerHudMinimapUpdateCallsiteC),
      ) || false),
    runtimeCurrentOwnerHudMinimapVtableReferences:
      (runtimeCurrentOwnerHudMinimapVtablePrimary?.u64References.length || 0) +
      (runtimeCurrentOwnerHudMinimapVtablePrimary?.textReferences.length || 0),
    runtimeCurrentOwnerHudMinimapSubobjectInitializerDirectCallers:
      runtimeCurrentOwnerHudMinimapSubobjectInitializer?.directCallers.length || 0,
    runtimeCurrentOwnerHudMinimapSubobjectUpdateDirectCallers:
      runtimeCurrentOwnerHudMinimapSubobjectUpdate?.directCallers.length || 0,
    runtimeCurrentOwnerHudMinimapPositionSamplerReferences:
      (runtimeCurrentOwnerHudMinimapPositionSampler?.directCallers.length || 0) +
      (runtimeCurrentOwnerHudMinimapPositionSampler?.u64References.length || 0) +
      (runtimeCurrentOwnerHudMinimapPositionSampler?.textReferences.length || 0),
    runtimeCurrentOwnerHudMinimapSubobjectVtableReferences:
      (runtimeCurrentOwnerHudMinimapSubobjectVtablePrimary?.u64References.length || 0) +
      (runtimeCurrentOwnerHudMinimapSubobjectVtablePrimary?.textReferences.length || 0),
    runtimeCurrentOwnerHudMinimapPositionSamplerVtableReferences:
      (runtimeCurrentOwnerHudMinimapPositionSamplerVtableSlot?.u64References.length || 0) +
      (runtimeCurrentOwnerHudMinimapPositionSamplerVtableSlot?.textReferences.length || 0),
    hudMinimapStringTextReferences: hudMinimapString?.textReferences.length || 0,
    hudMinimapBuildPathFormatStringTextReferences:
      hudMinimapBuildPathFormatString?.textReferences.length || 0,
    runtimePlayerLockIndexTextReferences:
      runtimePlayerLockIndexGlobalSlot?.textReferences.length || 0,
    runtimePlayerLockIndexStores:
      storesFor("runtimePlayerLockIndexGlobalSlot").length,
    runtimePlayerLockRegistrationDirectCallers:
      runtimePlayerLockRegistration?.directCallers.length || 0,
    runtimePlayerLockObjectInitializerTextReferences:
      runtimePlayerLockObjectInitializer?.textReferences.length || 0,
    runtimePlayerLockVirtualInvokeCallbackTextReferences:
      runtimePlayerLockVirtualInvokeCallback?.textReferences.length || 0,
    runtimePlayerLockIndexMatchCallbackTextReferences:
      runtimePlayerLockIndexMatchCallback?.textReferences.length || 0,
    runtimePlayerLockOwnerCreateFromCurrentKeyDirectCallers:
      runtimePlayerLockOwnerCreateFromCurrentKey?.directCallers.length || 0,
    runtimePlayerLockSimpleIndexQueryReferences:
      (runtimePlayerLockSimpleIndexQuery?.directCallers.length || 0) +
      (runtimePlayerLockSimpleIndexQuery?.textReferences.length || 0),
    runtimePlayerLockKeyedDispatchLoopDirectCallers:
      runtimePlayerLockKeyedDispatchLoop?.directCallers.length || 0,
    runtimePlayerLockNegativeStringTextReferences:
      (playerLockString?.textReferences.length || 0) +
      (hudRuntimeString?.textReferences.length || 0) +
      (tutorialFiveClientString?.textReferences.length || 0) +
      (visionTotemString?.textReferences.length || 0),
    runtimePlayerLockLocalProfileBranches:
      runtimePlayerLockProfileBranches.length,
    runtimeResolvedKeyObjectRequestOwnerRegistrationDirectCallers:
      runtimeResolvedKeyObjectRequestOwnerRegistration?.directCallers.length || 0,
    runtimeResolvedKeyObjectRequestOwnerPrimaryCallbackTextReferences:
      runtimeResolvedKeyObjectRequestOwnerPrimaryCallback?.textReferences.length || 0,
    runtimeResolvedKeyObjectRequestOwnerSlot1CallbackTextReferences:
      runtimeResolvedKeyObjectRequestOwnerSlot1Callback?.textReferences.length || 0,
    runtimeResolvedKeyObjectRequestOwnerSlot4CallbackTextReferences:
      runtimeResolvedKeyObjectRequestOwnerSlot4Callback?.textReferences.length || 0,
    runtimeModuleCallbackSlotInstallerDirectCallers:
      runtimeModuleCallbackSlotInstaller?.directCallers.length || 0,
    runtimeModuleCallbackSlotDispatchDirectCallers:
      runtimeModuleCallbackSlotDispatch?.directCallers.length || 0,
    runtimeModuleCallbackSlotDispatchRecordsDirectCallers:
      runtimeModuleCallbackSlotDispatchRecords?.directCallers.length || 0,
    runtimeModuleCallbackFrameDispatchDirectCallers:
      runtimeModuleCallbackFrameDispatch?.directCallers.length || 0,
    runtimeModuleCallbackFrameDispatchSlot6DirectCallers:
      runtimeModuleCallbackFrameDispatchSlot6?.directCallers.length || 0,
    runtimeModuleObjectCreateWrapperDirectCallers:
      runtimeModuleObjectCreateWrapper?.directCallers.length || 0,
    runtimeModuleObjectLookupOrCreateDirectCallers:
      runtimeModuleObjectLookupOrCreate?.directCallers.length || 0,
    runtimeModuleObjectSlot0CreateDirectCallers:
      runtimeModuleObjectSlot0Create?.directCallers.length || 0,
    runtimeResolvedKeyObjectRequestOwnerResolveIndexRegistrationDirectCallers:
      runtimeResolvedKeyObjectRequestOwnerResolveIndexRegistration?.directCallers.length || 0,
    runtimeResolvedKeyObjectRequestOwnerResolveIndexTextReferences:
      runtimeResolvedKeyObjectRequestOwnerResolveIndexGlobalSlot?.textReferences.length || 0,
    runtimeResolvedKeyObjectRequestOwnerResolveIndexLocalProfileBranches:
      runtimeOwnerResolveIndexProfileBranches.length,
    runtimeResolvedKeyObjectRequestRelatedCreateIndexRegistrationDirectCallers:
      runtimeResolvedKeyObjectRequestRelatedCreateIndexRegistration?.directCallers.length || 0,
    runtimeResolvedKeyObjectRequestOwnerLocalProfileBranches:
      runtimeResolvedKeyObjectRequestOwnerProfileBranches.length,
    characterLobbyOwnerInitializerReferences:
      (characterLobbyOwnerInitializer?.directCallers.length || 0) +
      (characterLobbyOwnerInitializer?.u64References.length || 0) +
      (characterLobbyOwnerInitializer?.textReferences.length || 0),
    characterLobbyOwnerPrimaryVtableReferences:
      (characterLobbyOwnerPrimaryVtable?.u64References.length || 0) +
      (characterLobbyOwnerPrimaryVtable?.textReferences.length || 0),
    characterLobbyRuntimeKeySwitchCallbackVtableReferences:
      (characterLobbyRuntimeKeySwitchCallback?.u64References.length || 0) +
      (characterLobbyRuntimeKeySwitchVtableSlot?.u64References.length || 0),
    characterLobbyRuntimeKeySwitchThunkReferences:
      (characterLobbyRuntimeKeySwitchThunk?.directCallers.length || 0) +
      (characterLobbyRuntimeKeySwitchThunk?.u64References.length || 0),
    characterLobbySubobjectVtableReferences:
      (characterLobbySubobjectVtable?.u64References.length || 0) +
      (characterLobbySubobjectVtable?.textReferences.length || 0),
    characterLobbyStateRefreshDirectCallers: characterLobbyStateRefresh?.directCallers.length || 0,
    characterLobbyModeSwitcherDirectCallers: characterLobbyModeSwitcher?.directCallers.length || 0,
    characterLobbyLocalProfileBranches: characterLobbyRuntimeProfileBranches.length,
    characterLobbyStateAConstructorDirectCallers:
      characterLobbyStateAConstructor?.directCallers.length || 0,
    characterLobbyStateARefreshDirectCallers: characterLobbyStateARefresh?.directCallers.length || 0,
    characterLobbyStateADestructorReferences:
      (characterLobbyStateADestructor?.directCallers.length || 0) +
      (characterLobbyStateADestructor?.u64References.length || 0),
    characterLobbyStateAApplyPayloadDirectCallers:
      characterLobbyStateAApplyPayload?.directCallers.length || 0,
    characterLobbyStateAPayloadSelectDirectCallers:
      characterLobbyStateAPayloadSelect?.directCallers.length || 0,
    characterLobbyStateARebuildVisualListsDirectCallers:
      characterLobbyStateARebuildVisualLists?.directCallers.length || 0,
    characterLobbyStateAUpdateVisualItemsDirectCallers:
      characterLobbyStateAUpdateVisualItems?.directCallers.length || 0,
    characterLobbyStateBConstructorDirectCallers:
      characterLobbyStateBConstructor?.directCallers.length || 0,
    characterLobbyStateBRefreshDirectCallers: characterLobbyStateBRefresh?.directCallers.length || 0,
    characterLobbyStateBDestructorReferences:
      (characterLobbyStateBDestructor?.directCallers.length || 0) +
      (characterLobbyStateBDestructor?.u64References.length || 0),
    characterLobbyStateBApplyPayloadDirectCallers:
      characterLobbyStateBApplyPayload?.directCallers.length || 0,
    characterLobbyStateBPayloadSelectDirectCallers:
      characterLobbyStateBPayloadSelect?.directCallers.length || 0,
    characterLobbyStateBRebuildVisualListsDirectCallers:
      characterLobbyStateBRebuildVisualLists?.directCallers.length || 0,
    characterLobbyStateBUpdateVisualItemsDirectCallers:
      characterLobbyStateBUpdateVisualItems?.directCallers.length || 0,
    characterLobbyStateObjectLocalProfileBranches:
      characterLobbyStateObjectProfileBranches.length,
    uiCharacterLobbyEnteredSoundStringTextReferences:
      uiCharacterLobbyEnteredSoundString?.textReferences.length || 0,
    characterLobbyDraftUiStringTextReferences: characterLobbyDraftUiReferences,
    objectBuilderAFunctionDataReferences:
      (objectBuilderAFunction?.u64References.length || 0) + (objectBuilderAFunction?.textReferences.length || 0),
    objectBuilderBFunctionDataReferences:
      (objectBuilderBFunction?.u64References.length || 0) + (objectBuilderBFunction?.textReferences.length || 0),
    runtimeResolvedKeyObjectRequestContextAccessorDirectCallers:
      runtimeResolvedKeyObjectRequestContextAccessor?.directCallers.length || 0,
    runtimeResolvedKeyObjectListProcessorDirectCallers:
      runtimeResolvedKeyObjectListProcessor?.directCallers.length || 0,
    runtimeResolvedKeyObjectListProcessorArrayLookupDirectCallers:
      runtimeResolvedKeyObjectListProcessorArrayLookup?.directCallers.length || 0,
    runtimeResolvedKeyObjectListProcessorArrayHashLookupDirectCallers:
      runtimeResolvedKeyObjectListProcessorArrayHashLookup?.directCallers.length || 0,
    runtimeResolvedKeyObjectListProcessorSingleLookupDirectCallers:
      runtimeResolvedKeyObjectListProcessorSingleLookup?.directCallers.length || 0,
    runtimeResolvedKeyObjectListProcessorSingleHashLookupDirectCallers:
      runtimeResolvedKeyObjectListProcessorSingleHashLookup?.directCallers.length || 0,
    runtimeResolvedKeyObjectEntryApplyDirectCallers:
      runtimeResolvedKeyObjectEntryApply?.directCallers.length || 0,
    runtimeResolvedKeyObjectEntryTransformWriterDirectCallers:
      runtimeResolvedKeyObjectEntryTransformWriter?.directCallers.length || 0,
    runtimeResolvedKeyObjectEntrySecondaryAttachDirectCallers:
      runtimeResolvedKeyObjectEntrySecondaryAttach?.directCallers.length || 0,
    runtimeResolvedKeyObjectEntryScratchBuilderDirectCallers:
      runtimeResolvedKeyObjectEntryScratchBuilder?.directCallers.length || 0,
    runtimeResolvedKeyObjectEntryHashInsertDirectCallers:
      runtimeResolvedKeyObjectEntryHashInsert?.directCallers.length || 0,
    runtimeResolvedKeyObjectEntryApplyLocalProfileBranches:
      runtimeResolvedKeyObjectEntryApplyProfileBranches.length,
    genericCallbackDispatchExactMatchPathRecovered:
      evidence.some((row) => row.address === 0x188ebb8 && row.matched) &&
      evidence.some((row) => row.address === 0x188ebbc && row.matched) &&
      evidence.some((row) => row.address === 0x188ec88 && row.matched) &&
      evidence.some((row) => row.address === 0x188ec90 && row.matched) &&
      evidence.some((row) => row.address === 0x188eca0 && row.matched),
    genericCallbackDispatchFallbackPathRecovered:
      evidence.some((row) => row.address === 0x188ec54 && row.matched) &&
      evidence.some((row) => row.address === 0x188ec5c && row.matched) &&
      evidence.some((row) => row.address === 0x188ec64 && row.matched) &&
      evidence.some((row) => row.address === 0x188ec68 && row.matched) &&
      evidence.some((row) => row.address === 0x188ec6c && row.matched),
    genericCallbackDispatchKnownCallsitesRecovered:
      evidence.some((row) => row.address === 0x8cc03c && row.matched) &&
      evidence.some((row) => row.address === 0xc79b1c && row.matched) &&
      evidence.some((row) => row.address === 0x188e3ec && row.matched),
    genericCallbackDispatchHelperRecovered:
      evidence.some((row) => row.address === 0x188e338 && row.matched) &&
      evidence.some((row) => row.address === 0x188e3d4 && row.matched) &&
      evidence.some((row) => row.address === 0x188e3e4 && row.matched) &&
      evidence.some((row) => row.address === 0x188e3e8 && row.matched) &&
      evidence.some((row) => row.address === 0x188e3ec && row.matched),
    descriptorPayloadResolverRecovered:
      evidence.some((row) => row.address === 0x188cc88 && row.matched) &&
      evidence.some((row) => row.address === 0x188cc98 && row.matched) &&
      evidence.some((row) => row.address === 0x188f918 && row.matched) &&
      evidence.some((row) => row.address === 0x188f930 && row.matched) &&
      evidence.some((row) => row.address === 0x188f970 && row.matched) &&
      evidence.some((row) => row.address === 0x188f978 && row.matched),
    manifestDispatchCallsitesRecovered:
      evidence.some((row) => row.address === 0x81c9a8 && row.matched) &&
      evidence.some((row) => row.address === 0x81ca94 && row.matched) &&
      evidence.some((row) => row.address === 0x826554 && row.matched),
    objectBuilderDispatchCallsitesRecovered:
      evidence.some((row) => row.address === 0xc0374c && row.matched) &&
      evidence.some((row) => row.address === 0xc04b98 && row.matched),
    typedObjectDispatcherRecovered:
      evidence.some((row) => row.address === 0x82dc34 && row.matched) &&
      evidence.some((row) => row.address === 0x82dc60 && row.matched) &&
      evidence.some((row) => row.address === 0x82dc70 && row.matched) &&
      evidence.some((row) => row.address === 0x82dc7c && row.matched),
    objectBuilderBTypedObjectCaseRecovered:
      evidence.some((row) => row.address === 0x82e4ac && row.matched) &&
      evidence.some((row) => row.address === 0x82e4b0 && row.matched) &&
      evidence.some((row) => row.address === 0x82e4c0 && row.matched) &&
      evidence.some((row) => row.address === 0x82ea98 && row.matched) &&
      evidence.some((row) => row.address === 0x82b278 && row.matched) &&
      evidence.some((row) => row.address === 0xc04628 && row.matched),
    objectBuilderBResourceKeySourceRecovered:
      evidence.some((row) => row.address === 0x82b0e8 && row.matched) &&
      evidence.some((row) => row.address === 0x82b0ec && row.matched) &&
      evidence.some((row) => row.address === 0x82b1b8 && row.matched) &&
      evidence.some((row) => row.address === 0x82b278 && row.matched) &&
      evidence.some((row) => row.address === 0xc04638 && row.matched) &&
      evidence.some((row) => row.address === 0xc04b88 && row.matched),
    typedObjectDispatcherKnownCallersRecovered:
      typedObjectDispatcherFrameStreamSourceRecovered &&
      typedObjectDispatcherTimedQueueSourceRecovered &&
      (typedObjectDispatcher?.directCallers.length || 0) === 2,
    typedObjectVgrInputPathRecovered:
      evidence.some((row) => row.address === 0x825ff4 && row.matched) &&
      evidence.some((row) => row.address === 0x826000 && row.matched) &&
      evidence.some((row) => row.address === 0x825ac0 && row.matched) &&
      evidence.some((row) => row.address === 0x825ac4 && row.matched) &&
      evidence.some((row) => row.address === 0xd6e16c && row.matched),
    typedObjectRuntimeKeySelectionCaseRecovered:
      evidence.some((row) => row.address === 0x82fbcc && row.matched) &&
      evidence.some((row) => row.address === 0x82fbd0 && row.matched) &&
      evidence.some((row) => row.address === 0x82fbd8 && row.matched) &&
      evidence.some((row) => row.address === 0x82fbe4 && row.matched) &&
      evidence.some((row) => row.address === 0x82fbec && row.matched),
    typedObjectRuntimeKeySelectionHelperRecovered:
      evidence.some((row) => row.address === 0x82d894 && row.matched) &&
      evidence.some((row) => row.address === 0x82d8a4 && row.matched) &&
      evidence.some((row) => row.address === 0x82d8a8 && row.matched) &&
      evidence.some((row) => row.address === 0x82d8ac && row.matched) &&
      evidence.some((row) => row.address === 0x82d8bc && row.matched) &&
      evidence.some((row) => row.address === 0x82d8c0 && row.matched),
    typedObjectInlineKeyWriterCaseRecovered:
      typedObjectInlineKeyWriterJumpTableEntry?.targetAddress ===
        addresses.typedObjectInlineKeyWriterDispatchCase &&
      evidence.some((row) => row.address === 0x82dc80 && row.matched) &&
      evidence.some((row) => row.address === 0x82dc84 && row.matched) &&
      evidence.some((row) => row.address === 0x82dc8c && row.matched) &&
      evidence.some((row) => row.address === 0x82dcdc && row.matched) &&
      (typedObjectInlineKeyWriterHelper?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.typedObjectInlineKeyWriterHelperCallsite),
      ) || false),
    typedObjectInlineKeyWriterHelperRecovered:
      evidence.some((row) => row.address === 0x82b68c && row.matched) &&
      evidence.some((row) => row.address === 0x82b6ac && row.matched) &&
      evidence.some((row) => row.address === 0x82b6b8 && row.matched) &&
      evidence.some((row) => row.address === 0x82b6c0 && row.matched) &&
      evidence.some((row) => row.address === 0x82b6d4 && row.matched) &&
      evidence.some((row) => row.address === 0x82b6d8 && row.matched) &&
      evidence.some((row) => row.address === 0x82b6dc && row.matched) &&
      evidence.some((row) => row.address === 0x82b6e0 && row.matched),
    runtimeResourceKeySelectionSetterRecovered:
      evidence.some((row) => row.address === 0x8bf558 && row.matched) &&
      evidence.some((row) => row.address === 0x8bf574 && row.matched) &&
      evidence.some((row) => row.address === 0x8bf578 && row.matched) &&
      evidence.some((row) => row.address === 0x8bf588 && row.matched) &&
      evidence.some((row) => row.address === 0xbebf7c && row.matched) &&
      evidence.some((row) => row.address === 0xbebfc0 && row.matched) &&
      evidence.some((row) => row.address === 0xbebfc8 && row.matched),
    runtimeResourceKeyGlobalSetterCallerSetRecovered:
      evidence.some((row) => row.address === 0x82b6c0 && row.matched) &&
      evidence.some((row) => row.address === 0x82b6dc && row.matched) &&
      evidence.some((row) => row.address === 0x8bf574 && row.matched) &&
      evidence.some((row) => row.address === 0xa7ca68 && row.matched) &&
      (runtimeResourceKeyGlobalSetter?.directCallers || []).some(
        (caller) => caller.callerAddressHex === hex(0x82b6c0),
      ) &&
      (runtimeResourceKeyGlobalSetter?.directCallers || []).some(
        (caller) => caller.callerAddressHex === hex(0x8bf574),
      ) &&
      (runtimeResourceKeyGlobalSetter?.directCallers || []).some(
        (caller) => caller.callerAddressHex === hex(0xa7ca68),
      ),
    runtimeCurrentKeyOwnerGlobalLifecycleRecovered:
      evidence.some((row) => row.address === 0x8be39c && row.matched) &&
      evidence.some((row) => row.address === 0x8be3c4 && row.matched) &&
      evidence.some((row) => row.address === 0x8be62c && row.matched) &&
      evidence.some((row) => row.address === 0x8bed9c && row.matched) &&
      hasStoreAt("runtimeCurrentKeyOwnerGlobalSlot", addresses.runtimeCurrentKeyOwnerGlobalStoreCallsite) &&
      hasStoreAt("runtimeCurrentKeyOwnerGlobalSlot", addresses.runtimeCurrentKeyOwnerGlobalClearCallsite),
    runtimeCurrentKeyOwnerChildIndexRegistrationRecovered:
      (runtimeCurrentKeyOwnerChildIndexRegistration?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(0x8badf4),
      ) || false) &&
      evidence.some((row) => row.address === 0x9195a8 && row.matched) &&
      evidence.some((row) => row.address === 0x9195ac && row.matched) &&
      evidence.some((row) => row.address === 0x9195cc && row.matched) &&
      hasStoreAt("runtimeCurrentKeyOwnerChildIndexGlobalSlot", addresses.runtimeCurrentKeyOwnerChildIndexStoreCallsite),
    runtimeCurrentSecondaryObjectIndexRegistrationRecovered:
      (runtimeCurrentSecondaryObjectIndexRegistration?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(0x8badec),
      ) || false) &&
      evidence.some((row) => row.address === 0x913258 && row.matched) &&
      evidence.some((row) => row.address === 0x91325c && row.matched) &&
      evidence.some((row) => row.address === 0x9135bc && row.matched) &&
      evidence.some((row) => row.address === 0x9135dc && row.matched) &&
      hasStoreAt("runtimeCurrentSecondaryObjectIndexGlobalSlot", addresses.runtimeCurrentSecondaryObjectIndexStoreCallsite),
    runtimeCurrentKeyOwnerChildCreatePathRecovered:
      evidence.some((row) => row.address === 0x8bfa6c && row.matched) &&
      evidence.some((row) => row.address === 0x8bfa74 && row.matched) &&
      evidence.some((row) => row.address === 0x8bfa9c && row.matched) &&
      evidence.some((row) => row.address === 0x8bfd84 && row.matched) &&
      evidence.some((row) => row.address === 0x8bfdb4 && row.matched) &&
      evidence.some((row) => row.address === 0x8bfdb8 && row.matched),
    runtimeCurrentOwnerRegistrationRecovered:
      (runtimeCurrentOwnerRegistrationBuilder?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.runtimeCurrentOwnerRegistrationHubCallsite),
      ) || false) &&
      evidence.some((row) => row.address === 0x8badcc && row.matched) &&
      evidence.some((row) => row.address === 0x8cfb7c && row.matched) &&
      evidence.some((row) => row.address === 0x8cfba8 && row.matched) &&
      evidence.some((row) => row.address === 0x8cfbdc && row.matched) &&
      evidence.some((row) => row.address === 0x8cfbe4 && row.matched) &&
      evidence.some((row) => row.address === 0x8cfbe8 && row.matched) &&
      hasStoreAt("runtimeCurrentOwnerRegistryIndexGlobalSlot", 0x8cfbe4),
    runtimeCurrentOwnerRegistryIndexLazyInitRecovered:
      evidence.some((row) => row.address === 0x79f37c && row.matched) &&
      evidence.some((row) => row.address === 0x79f380 && row.matched) &&
      evidence.some((row) => row.address === 0x79f384 && row.matched) &&
      evidence.some((row) => row.address === 0x79f39c && row.matched) &&
      evidence.some((row) => row.address === 0x79f3a0 && row.matched) &&
      hasStoreAt("runtimeCurrentOwnerRegistryIndexGlobalSlot", addresses.runtimeCurrentOwnerRegistryIndexLazyStoreCallsite),
    runtimeCurrentOwnerSlot4RuntimeUpdateRecovered:
      evidence.some((row) => row.address === 0x8cfc24 && row.matched) &&
      evidence.some((row) => row.address === 0x8cfc8c && row.matched) &&
      evidence.some((row) => row.address === 0x8cfd7c && row.matched) &&
      evidence.some((row) => row.address === 0x8cfdec && row.matched) &&
      evidence.some((row) => row.address === 0x8cfe70 && row.matched) &&
      evidence.some((row) => row.address === 0x8cff38 && row.matched) &&
      evidence.some((row) => row.address === 0x8d00e8 && row.matched),
    runtimeCurrentOwnerHudMinimapPathRecovered:
      evidence.some((row) => row.address === 0x94adbc && row.matched) &&
      evidence.some((row) => row.address === 0x94adc0 && row.matched) &&
      evidence.some((row) => row.address === 0x94adf0 && row.matched) &&
      evidence.some((row) => row.address === 0x94adf4 && row.matched) &&
      evidence.some((row) => row.address === 0x94adfc && row.matched) &&
      evidence.some((row) => row.address === 0x94af3c && row.matched) &&
      evidence.some((row) => row.address === 0x94af98 && row.matched) &&
      evidence.some((row) => row.address === 0x94afa4 && row.matched) &&
      evidence.some((row) => row.address === 0x94afb8 && row.matched) &&
      evidence.some((row) => row.address === 0x94c7c4 && row.matched) &&
      (runtimeCurrentOwnerHudMinimapConstructor?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.runtimeCurrentOwnerHudMinimapLargeOwnerConstructorCallsiteA),
      ) || false) &&
      (runtimeCurrentOwnerHudMinimapConstructor?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.runtimeCurrentOwnerHudMinimapLargeOwnerConstructorCallsiteB),
      ) || false) &&
      (runtimeCurrentOwnerHudMinimapConstructor?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.runtimeCurrentOwnerHudMinimapLargeOwnerConstructorCallsiteC),
      ) || false) &&
      (runtimeCurrentOwnerHudMinimapUpdate?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.runtimeCurrentOwnerHudMinimapUpdateCallsiteA),
      ) || false) &&
      (runtimeCurrentOwnerHudMinimapUpdate?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.runtimeCurrentOwnerHudMinimapUpdateCallsiteB),
      ) || false) &&
      (runtimeCurrentOwnerHudMinimapUpdate?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(addresses.runtimeCurrentOwnerHudMinimapUpdateCallsiteC),
      ) || false),
    runtimeCurrentOwnerHudMinimapClassifiedAsHudNotHeroPreview:
      (hudMinimapString?.textReferences.length || 0) > 0 &&
      evidence.some((row) => row.address === 0x94adc0 && row.matched) &&
      evidence.some((row) => row.address === 0x94c8b8 && row.matched),
    runtimePlayerLockHudIndexPathRecovered:
      evidence.some((row) => row.address === 0x8bae1c && row.matched) &&
      evidence.some((row) => row.address === 0x90c9a4 && row.matched) &&
      evidence.some((row) => row.address === 0x90c9e4 && row.matched) &&
      evidence.some((row) => row.address === 0x90ca1c && row.matched) &&
      evidence.some((row) => row.address === 0x90ca20 && row.matched) &&
      evidence.some((row) => row.address === 0x90ca44 && row.matched) &&
      evidence.some((row) => row.address === 0x80180c && row.matched) &&
      evidence.some((row) => row.address === 0x88821c && row.matched) &&
      evidence.some((row) => row.address === 0xbab8d0 && row.matched) &&
      hasStoreAt("runtimePlayerLockIndexGlobalSlot", 0x90ca1c),
    runtimePlayerLockHudClassifiedAsNegativeEvidence:
      runtimePlayerLockProfileBranches.length === 0 &&
      ((playerLockString?.textReferences.length || 0) +
        (hudRuntimeString?.textReferences.length || 0) +
        (tutorialFiveClientString?.textReferences.length || 0) +
        (visionTotemString?.textReferences.length || 0)) > 0,
    runtimeCurrentOwnerActiveStateBridgeRecovered:
      evidence.some((row) => row.address === 0x8d05d4 && row.matched) &&
      evidence.some((row) => row.address === 0x8d05e4 && row.matched) &&
      evidence.some((row) => row.address === 0x8d061c && row.matched) &&
      evidence.some((row) => row.address === 0x8d0674 && row.matched) &&
      evidence.some((row) => row.address === 0x8d068c && row.matched) &&
      evidence.some((row) => row.address === 0x8d06c4 && row.matched) &&
      evidence.some((row) => row.address === 0x8d06c8 && row.matched),
    runtimeCurrentOwnerStateBridgeCallersRecovered:
      evidence.some((row) => row.address === 0x8d0c48 && row.matched) &&
      evidence.some((row) => row.address === 0x8d0f8c && row.matched) &&
      evidence.some((row) => row.address === 0x8cfb70 && row.matched) &&
      evidence.some((row) => row.address === 0x8cfb74 && row.matched),
    runtimeCurrentOwnerStateRefreshCleanupRecovered:
      evidence.some((row) => row.address === 0x8d10ac && row.matched) &&
      evidence.some((row) => row.address === 0x8d10bc && row.matched) &&
      evidence.some((row) => row.address === 0x8d1084 && row.matched) &&
      evidence.some((row) => row.address === 0x8d122c && row.matched) &&
      evidence.some((row) => row.address === 0x8d123c && row.matched) &&
      evidence.some((row) => row.address === 0x8d1274 && row.matched),
    runtimeResolvedKeyObjectRequestOwnerRegistrationRecovered:
      evidence.some((row) => row.address === 0x8bad0c && row.matched) &&
      evidence.some((row) => row.address === 0x8bee80 && row.matched) &&
      evidence.some((row) => row.address === 0x8beedc && row.matched) &&
      evidence.some((row) => row.address === 0x8beee4 && row.matched) &&
      evidence.some((row) => row.address === 0x8beef4 && row.matched) &&
      evidence.some((row) => row.address === 0x8bef00 && row.matched) &&
      evidence.some((row) => row.address === 0x8bef14 && row.matched) &&
      evidence.some((row) => row.address === 0x188c2f4 && row.matched) &&
      evidence.some((row) => row.address === 0x188c304 && row.matched),
    runtimeModuleCallbackSlotDispatchRecovered:
      evidence.some((row) => row.address === 0x188bf50 && row.matched) &&
      evidence.some((row) => row.address === 0x188bf8c && row.matched) &&
      evidence.some((row) => row.address === 0x188bf9c && row.matched) &&
      evidence.some((row) => row.address === 0x188bfb4 && row.matched) &&
      evidence.some((row) => row.address === 0x188bfd8 && row.matched) &&
      evidence.some((row) => row.address === 0x188c638 && row.matched) &&
      evidence.some((row) => row.address === 0x188c658 && row.matched) &&
      evidence.some((row) => row.address === 0x188c684 && row.matched) &&
      evidence.some((row) => row.address === 0x188c69c && row.matched) &&
      evidence.some((row) => row.address === 0x188c6a0 && row.matched),
    runtimeModuleCallbackFrameDispatchRecovered:
      evidence.some((row) => row.address === 0x188e614 && row.matched) &&
      evidence.some((row) => row.address === 0x188e63c && row.matched) &&
      evidence.some((row) => row.address === 0x188e640 && row.matched) &&
      evidence.some((row) => row.address === 0x188e68c && row.matched) &&
      evidence.some((row) => row.address === 0x188e690 && row.matched) &&
      evidence.some((row) => row.address === 0x188e6b4 && row.matched) &&
      evidence.some((row) => row.address === 0x188e6b8 && row.matched) &&
      evidence.some((row) => row.address === 0x188e6d8 && row.matched) &&
      evidence.some((row) => row.address === 0x188e6dc && row.matched) &&
      evidence.some((row) => row.address === 0x188e71c && row.matched) &&
      evidence.some((row) => row.address === 0x188e720 && row.matched) &&
      evidence.some((row) => row.address === 0x8228b0 && row.matched) &&
      evidence.some((row) => row.address === 0x8228c0 && row.matched),
    runtimeResolvedKeyObjectRequestSharedSlotDispatchMechanicsRecovered:
      evidence.some((row) => row.address === 0x8beedc && row.matched) &&
      evidence.some((row) => row.address === 0x188c2f4 && row.matched) &&
      evidence.some((row) => row.address === 0x188bf9c && row.matched) &&
      evidence.some((row) => row.address === 0x188c6a0 && row.matched),
    runtimeModuleObjectSlot0CreateRecovered:
      evidence.some((row) => row.address === 0x188b8d4 && row.matched) &&
      evidence.some((row) => row.address === 0x188c490 && row.matched) &&
      evidence.some((row) => row.address === 0x188c49c && row.matched) &&
      evidence.some((row) => row.address === 0x188bbfc && row.matched) &&
      evidence.some((row) => row.address === 0x188bc04 && row.matched) &&
      evidence.some((row) => row.address === 0x188bc08 && row.matched) &&
      evidence.some((row) => row.address === 0x188bc14 && row.matched),
    runtimeResolvedKeyObjectRequestPrimarySlot0GenericInvokeRecovered:
      evidence.some((row) => row.address === 0x8bef90 && row.matched) &&
      evidence.some((row) => row.address === 0x188b8d4 && row.matched) &&
      evidence.some((row) => row.address === 0x188c49c && row.matched) &&
      evidence.some((row) => row.address === 0x188bc14 && row.matched),
    runtimeResolvedKeyObjectRequestRelatedObjectCreateRecovered:
      evidence.some((row) => row.address === 0x8befc0 && row.matched) &&
      evidence.some((row) => row.address === 0x188e2cc && row.matched) &&
      evidence.some((row) => row.address === 0x188c49c && row.matched) &&
      evidence.some((row) => row.address === 0x8befcc && row.matched),
    runtimeResolvedKeyObjectRequestRegistryIndexSourcesRecovered:
      evidence.some((row) => row.address === 0x8b90a0 && row.matched) &&
      evidence.some((row) => row.address === 0x8b90cc && row.matched) &&
      evidence.some((row) => row.address === 0x8b9108 && row.matched) &&
      evidence.some((row) => row.address === 0xc74158 && row.matched) &&
      evidence.some((row) => row.address === 0xc74194 && row.matched) &&
      evidence.some((row) => row.address === 0xc741c0 && row.matched),
    runtimeResolvedKeyObjectRequestOwnerResolveIndexConsumersBounded:
      (runtimeResolvedKeyObjectRequestOwnerResolveIndexGlobalSlot?.textReferences.length || 0) >= 7 &&
      runtimeOwnerResolveIndexProfileBranches.length === 0 &&
      evidence.some((row) => row.address === 0x936cec && row.matched) &&
      evidence.some((row) => row.address === 0x936cf8 && row.matched) &&
      evidence.some((row) => row.address === 0x936e58 && row.matched) &&
      evidence.some((row) => row.address === 0x936e64 && row.matched) &&
      evidence.some((row) => row.address === 0x976048 && row.matched) &&
      evidence.some((row) => row.address === 0x97605c && row.matched) &&
      evidence.some((row) => row.address === 0xac2384 && row.matched) &&
      evidence.some((row) => row.address === 0xac239c && row.matched) &&
      evidence.some((row) => row.address === 0xc06270 && row.matched) &&
      evidence.some((row) => row.address === 0xc06284 && row.matched) &&
      evidence.some((row) => row.address === 0xc06320 && row.matched) &&
      evidence.some((row) => row.address === 0xc0632c && row.matched),
    runtimeResolvedKeyObjectRequestPrimarySlot0ActivePreviewInvokeResolved: false,
    runtimeResolvedKeyObjectRequestPathRecovered:
      evidence.some((row) => row.address === 0x8bef98 && row.matched) &&
      evidence.some((row) => row.address === 0x8bef9c && row.matched) &&
      evidence.some((row) => row.address === 0x8befa8 && row.matched) &&
      evidence.some((row) => row.address === 0x8befac && row.matched) &&
      evidence.some((row) => row.address === 0x8befdc && row.matched) &&
      evidence.some((row) => row.address === 0x8befec && row.matched),
    runtimeResolvedKeyObjectContextApplyRecovered:
      evidence.some((row) => row.address === 0x8beff0 && row.matched) &&
      evidence.some((row) => row.address === 0x8beff4 && row.matched) &&
      evidence.some((row) => row.address === 0x8beff8 && row.matched) &&
      evidence.some((row) => row.address === 0x8bf000 && row.matched) &&
      evidence.some((row) => row.address === 0x8bf004 && row.matched) &&
      evidence.some((row) => row.address === 0x8bf008 && row.matched) &&
      evidence.some((row) => row.address === 0x8bf010 && row.matched),
    runtimeResolvedKeyObjectEntryApplyRecovered:
      evidence.some((row) => row.address === 0xca3be4 && row.matched) &&
      evidence.some((row) => row.address === 0xca3bf4 && row.matched) &&
      evidence.some((row) => row.address === 0xca3c04 && row.matched) &&
      evidence.some((row) => row.address === 0xca3c38 && row.matched) &&
      evidence.some((row) => row.address === 0xca3c50 && row.matched) &&
      evidence.some((row) => row.address === 0xca3c6c && row.matched) &&
      evidence.some((row) => row.address === 0xc7a35c && row.matched) &&
      evidence.some((row) => row.address === 0xc7a384 && row.matched) &&
      evidence.some((row) => row.address === 0xc7a460 && row.matched) &&
      evidence.some((row) => row.address === 0xc7a488 && row.matched) &&
      evidence.some((row) => row.address === 0xca35b4 && row.matched) &&
      evidence.some((row) => row.address === 0xca35bc && row.matched) &&
      evidence.some((row) => row.address === 0xca35f8 && row.matched) &&
      evidence.some((row) => row.address === 0xca3770 && row.matched) &&
      evidence.some((row) => row.address === 0xca397c && row.matched),
    characterLobbyRuntimeKeySwitchCandidateRecovered:
      evidence.some((row) => row.address === 0xa7c954 && row.matched) &&
      evidence.some((row) => row.address === 0xa7c970 && row.matched) &&
      evidence.some((row) => row.address === 0xa7c980 && row.matched) &&
      evidence.some((row) => row.address === 0xa7ca54 && row.matched) &&
      evidence.some((row) => row.address === 0xa7ca60 && row.matched) &&
      evidence.some((row) => row.address === 0xa7ca68 && row.matched) &&
      evidence.some((row) => row.address === 0xa7cae0 && row.matched),
    characterLobbyKeySwitchRecordShapeRecovered:
      evidence.some((row) => row.address === 0xa7ca54 && row.matched) &&
      evidence.some((row) => row.address === 0xa7ca84 && row.matched) &&
      evidence.some((row) => row.address === 0xa7ca88 && row.matched),
    characterLobbyKeySwitchModeDispatchRecovered:
      evidence.some((row) => row.address === 0xa7ca90 && row.matched) &&
      evidence.some((row) => row.address === 0xa7ca98 && row.matched) &&
      evidence.some((row) => row.address === 0xa7caa0 && row.matched) &&
      evidence.some((row) => row.address === 0xa7caa4 && row.matched) &&
      evidence.some((row) => row.address === 0xa7caac && row.matched) &&
      evidence.some((row) => row.address === 0xa7cab4 && row.matched) &&
      evidence.some((row) => row.address === 0xa7cae0 && row.matched),
    characterLobbyKeySwitchThunkRecovered:
      evidence.some((row) => row.address === 0xa7cb0c && row.matched) &&
      evidence.some((row) => row.address === 0xa7cb10 && row.matched),
    characterLobbyStateObjectsBounded:
      evidence.some((row) => row.address === 0xa7c9c8 && row.matched) &&
      evidence.some((row) => row.address === 0xa7c9d0 && row.matched) &&
      evidence.some((row) => row.address === 0xa7c9f4 && row.matched) &&
      evidence.some((row) => row.address === 0xa7c9fc && row.matched) &&
      evidence.some((row) => row.address === 0xa7ca1c && row.matched) &&
      (characterLobbyStateAConstructor?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(0xa7c9c8),
      ) || false) &&
      (characterLobbyStateBConstructor?.directCallers.some(
        (caller) => caller.callerAddressHex === hex(0xa7c9f4),
      ) || false) &&
      evidence.some((row) => row.address === 0xad56f0 && row.matched) &&
      evidence.some((row) => row.address === 0xad5e6c && row.matched) &&
      evidence.some((row) => row.address === 0xacd664 && row.matched) &&
      evidence.some((row) => row.address === 0xacea90 && row.matched) &&
      characterLobbyStateObjectProfileBranches.length === 0,
    objectBuilderBLevelSetupIndexQueryRecovered:
      evidence.some((row) => row.address === 0xc04c0c && row.matched) &&
      evidence.some((row) => row.address === 0xc04c20 && row.matched),
    levelSetupRuntimeIndexGlobalSlotTextReferences: levelSetupRuntimeIndexGlobalSlot?.textReferences.length || 0,
    levelSetupRegistryRecordGlobalSlotTextReferences: levelSetupRegistryRecordGlobalSlot?.textReferences.length || 0,
    levelSetupSecondaryResourceGlobalSlotTextReferences: levelSetupSecondaryResourceGlobalSlot?.textReferences.length || 0,
    loaderDirectCallers: loader?.directCallers.length || 0,
    loaderTailThunkConfirmed: tailThunk?.u64References.some((reference) => reference.virtualAddressHex === hex(addresses.levelRuntimeSecondaryVtable)) || false,
    activeLevelDispatchResolved:
      evidence.some((row) => row.address === 0x8cbdec && row.matched) &&
      evidence.some((row) => row.address === 0x8cbdfc && row.matched) &&
      evidence.some((row) => row.address === 0x8cbe04 && row.matched) &&
      evidence.some((row) => row.address === 0x8cbe08 && row.matched) &&
      evidence.some((row) => row.address === 0xc79b24 && row.matched) &&
      evidence.some((row) => row.address === 0xc79b28 && row.matched),
    activeLevelStoreConfirmed: evidence.some((row) => row.address === 0x8cbf6c && row.matched),
    activeLevelVisualsListReadConfirmed: evidence.some((row) => row.address === 0x8cbfb8 && row.matched),
    levelVisualsApplyProcessorFieldRoutingChecks: levelVisualsApplyProcessorFieldRoutingAddresses.length,
    levelVisualsApplyProcessorFieldRoutingRecovered,
    activeLevelCleanupScanCallbackConfirmed:
      evidence.some((row) => row.address === 0x8ccfa4 && row.matched) &&
      evidence.some((row) => row.address === 0x8ccfa8 && row.matched),
    activeLevelSetupCallbackRegistrationRecovered:
      evidence.some((row) => row.address === 0xc716c0 && row.matched) &&
      evidence.some((row) => row.address === 0xc79a34 && row.matched) &&
      evidence.some((row) => row.address === 0xc79ab8 && row.matched) &&
      evidence.some((row) => row.address === 0xc79ac4 && row.matched) &&
      evidence.some((row) => row.address === 0x188ecc4 && row.matched) &&
      evidence.some((row) => row.address === 0x188ecd4 && row.matched),
    genericCallbackDispatchRecovered:
      evidence.some((row) => row.address === 0x188ebb8 && row.matched) &&
      evidence.some((row) => row.address === 0x188ec88 && row.matched) &&
      evidence.some((row) => row.address === 0x188eca0 && row.matched),
    activeLevelSetupFieldExpansionRecovered:
      evidence.some((row) => row.address === 0xc79b30 && row.matched) &&
      evidence.some((row) => row.address === 0xc79b40 && row.matched) &&
      evidence.some((row) => row.address === 0xc79b50 && row.matched) &&
      evidence.some((row) => row.address === 0xc79b60 && row.matched) &&
      evidence.some((row) => row.address === 0xc79b70 && row.matched) &&
      evidence.some((row) => row.address === 0xc79ba8 && row.matched),
    activeLevelSelectionResolved: false,
    activeHeroPreviewProfileResolved: false,
  };
  return {
    generatedAt: new Date().toISOString(),
    binaryPath,
    policy:
      "diagnostic-only current-binary Level runtime owner audit; this proves owner/module wiring but does not select a renderer light/profile path",
    addresses: Object.fromEntries(Object.entries(addresses).map(([name, value]) => [name, hex(value)])),
    summary,
    runtimeResourceKeyStaticRecoveryGate,
    runtimeResourceKeyUpstreamRecoveryAudit,
    runtimeResolvedKeyIndexQueryConsumerAudit,
    typedObjectInputSourceOwnershipAudit,
    typedObjectReplaySourceSelectorCallerAudit,
    levelVisualsApplyProcessorFieldRouting: {
      functionAddressHex: hex(addresses.levelVisualsApplyProcessor),
      evidenceState: levelVisualsApplyProcessorFieldRoutingRecovered
        ? "current-binary-opcode-backed"
        : "incomplete-or-opcode-mismatch",
      sourceTableSelectorLists: [
        {
          levelVisualsOffsetHex: "0x8",
          readAddressHex: hex(addresses.levelVisualsApplySelectorListA),
          helperAddressHex: hex(addresses.levelVisualsApplySourceTableSelectorHelper),
          callsiteAddressHex: hex(addresses.levelVisualsApplySelectorListACall),
          x0Source: "apply arg0 preserved in x20",
          x1Source: "current list entry",
          x2Source: "apply arg2 preserved in x21",
        },
        {
          levelVisualsOffsetHex: "0x18",
          readAddressHex: hex(addresses.levelVisualsApplyConditionalSelectorListA),
          helperAddressHex: hex(addresses.levelVisualsApplySourceTableSelectorHelper),
          callsiteAddressHex: hex(addresses.levelVisualsApplyConditionalSelectorListACall),
          condition: "runtime predicate 0x830e00 true branch",
          x0Source: "apply arg0 preserved in x20",
          x1Source: "current list entry",
          x2Source: "apply arg2 preserved in x21",
        },
        {
          levelVisualsOffsetHex: "0x10",
          readAddressHex: hex(addresses.levelVisualsApplyFallbackSelectorList),
          helperAddressHex: hex(addresses.levelVisualsApplySourceTableSelectorHelper),
          callsiteAddressHex: hex(addresses.levelVisualsApplyFallbackSelectorListCall),
          condition: "runtime predicate 0x830e00 false branch",
          x0Source: "apply arg0 preserved in x20",
          x1Source: "current list entry",
          x2Source: "apply arg2 preserved in x21",
        },
      ],
      transformShapeLists: [
        {
          levelVisualsOffsetHex: "0x20",
          readAddressHex: hex(addresses.levelVisualsApplyTransformListA),
          helperAddressHex: hex(addresses.levelVisualsApplyTransformShapeHelper),
          callsiteAddressHex: hex(addresses.levelVisualsApplyTransformListACall),
        },
        {
          levelVisualsOffsetHex: "0x30",
          readAddressHex: hex(addresses.levelVisualsApplyConditionalTransformListA),
          helperAddressHex: hex(addresses.levelVisualsApplyTransformShapeHelper),
          callsiteAddressHex: hex(addresses.levelVisualsApplyConditionalTransformListACall),
          condition: "runtime predicate 0x830e00 true branch",
        },
        {
          levelVisualsOffsetHex: "0x28",
          readAddressHex: hex(addresses.levelVisualsApplyFallbackTransformList),
          helperAddressHex: hex(addresses.levelVisualsApplyTransformShapeHelper),
          callsiteAddressHex: hex(addresses.levelVisualsApplyFallbackTransformListCall),
          condition: "runtime predicate 0x830e00 false branch",
        },
      ],
      conditionalBranch: {
        predicateAddressHex: hex(addresses.levelVisualsApplyRuntimePredicate),
        callsiteAddressHex: hex(addresses.levelVisualsApplyRuntimeListPredicateCall),
        trueBranchOffsetsHex: ["0x18", "0x30"],
        falseBranchOffsetsHex: ["0x10", "0x28"],
      },
      auxLists: [
        {
          levelVisualsOffsetHex: "0x38",
          readAddressHex: hex(addresses.levelVisualsApplyAuxList38),
          globalIndexSlotHex: "0x30350b8",
          globalIndexLoadAddressHex: hex(addresses.levelVisualsApplyAuxList38IndexLoad),
          helperAddressHex: hex(addresses.levelVisualsApplyAuxList38Helper),
          callsiteAddressHex: hex(addresses.levelVisualsApplyAuxList38Call),
        },
        {
          levelVisualsOffsetHex: "0x40",
          readAddressHex: hex(addresses.levelVisualsApplyAuxList40),
          globalIndexSlotHex: "0x3034d30",
          globalIndexLoadAddressHex: hex(addresses.levelVisualsApplyAuxList40IndexLoad),
          helperAddressHex: hex(addresses.levelVisualsApplyAuxList40Helper),
          callsiteAddressHex: hex(addresses.levelVisualsApplyAuxList40Call),
        },
      ],
      staticLensFlareList: {
        levelVisualsOffsetHex: "0x58",
        readAddressHex: hex(addresses.levelVisualsApplyStaticLensFlareList),
        globalIndexSlotHex: "0x3035098",
        globalIndexLoadAddressHex: hex(addresses.levelVisualsApplyStaticLensFlareObjectIndexLoad),
        resourceAccessorCallsiteHex: hex(addresses.levelVisualsApplyStaticLensFlareResourceAccessorCall),
        resourceResolverCallsiteHex: hex(addresses.levelVisualsApplyStaticLensFlareResourceResolveCall),
        helperAddressHexes: [
          hex(addresses.levelVisualsApplyStaticLensFlarePrimaryHelper),
          hex(addresses.levelVisualsApplyStaticLensFlareSecondaryHelper),
        ],
      },
      profilePayload: {
        levelVisualsOffsetHex: "0x50",
        readAddressHex: hex(addresses.levelVisualsApplyProfilePayloadLoad),
        validateCallsiteHex: hex(addresses.levelVisualsApplyProfilePayloadValidateCall),
        temporaryCallAddressHexes: ["0xe24388", "0xe2448c", "0xe24474"],
        dispatchAddressHex: hex(addresses.sceneProbeProfilePayloadLoad),
        dispatchCallsiteHex: hex(addresses.levelVisualsApplyProfilePayloadDispatchCall),
      },
      boundary:
        "This proves LevelVisuals apply-processor field routing, not the active hero/model preview LevelVisuals record, field names, or renderer takeover gate.",
    },
    instructionEvidence: evidence,
    moduleRegistrationNeighborCalls,
    runtimeResolvedKeyLocalConsumerBranches,
    runtimeResolvedKeyLocalProfileConsumerBranches,
    runtimeResourceKeyGlobalSetterLocalBranches,
    runtimeResourceKeyGlobalSetterLocalProfileBranches,
    runtimeResourceKeySetterInputContexts,
    runtimeResourceKeyStatusPredicateLocalBranches,
    runtimeResourceKeyStatusPredicateLocalProfileBranches,
    typedObjectInlineKeyWriterJumpTableEntry,
    characterLobbyRuntimeProfileBranches,
    characterLobbyStateObjectProfileBranches,
    runtimePlayerLockProfileBranches,
    runtimeOwnerResolveIndexProfileBranches,
    runtimeResolvedKeyObjectRequestOwnerProfileBranches,
    runtimeResolvedKeyObjectEntryApplyProfileBranches,
    runtimeResolvedKeyIndexQueryConsumerAudit,
    typedObjectDispatcherInputSourceProfileBranches,
    typedObjectReplaySourceSelectorProfileBranches,
    typedObjectVgrLocalFileScanRoots,
    typedObjectVgrLocalFileCandidates,
    typedObjectRawIosDataAudit,
    typedObjectRawIosDataDeepHashAudit,
    genericCallbackDispatchCallsiteContexts,
    genericCallbackDispatchHelperCallsiteContexts,
    levelSetupActivePreviewCandidateContexts,
    descriptorPayloadResolverShimProfileBranches,
    descriptorPayloadResolverShimCallerContexts,
    runtimeResourceKeyPostAccessorCallerContexts,
    runtimeResourceKeyGlobalResolverCallerContexts,
    globalSlotStores,
    addressReferences,
    recovered: [
      "The current binary registers the Level runtime visuals owner from the module registration hub at 0x8bada4.",
      "The module registration function writes object initializer 0x8ccfcc and virtual invoke callback 0x8ccfe8 into the registry record at +0xb0, stores runtime kind 0x38, and publishes the record/index through registry +0x13fb8 and global 0x30350a8.",
      "The owner installs primary vtable 0x26c8a50 at object +0x0 and secondary vtable 0x26c8aa8 at object +0x28; the secondary thunk subtracts 0x28 before tail-calling 0x8cbf40.",
      "The current binary dispatches this owner through 0x8cbdd4: it reads the registered runtime index from 0x30350a8, resolves the owner through the generic registry lookup 0x188b8b8, forwards the original x1 active-Level argument, loads owner vtable +0x20, and calls the loaded slot.",
      "The current direct caller 0xc79ad4 passes its x2 object as the active Level into 0x8cbdd4 at 0xc79b28, and stores the returned runtime owner/subobject pointer at caller object +0x298.",
      "The higher Level setup callback registration is now current-binary evidence: the module registration hub calls 0xc799f4 at 0xc716c0, 0xc799f4 stores setup initializer 0xc7a630 and invoke callback 0xc7a6ac into its registry record, publishes its record index at 0x2d44e98, prepares 0xc79ad4 as callback payload, and tail-calls generic callback registration 0x188eca4.",
      "Generic callback registration 0x188eca4 preserves the callback payload pointer on its stack and inserts/updates a keyed callback node through 0x188ed48/0x188ee14, so 0xc79ad4 is a registered callback rather than an ordinary direct-call target.",
      "The Level setup descriptor slot is now statically bounded. Slot 0x2ae61c8 has one current text reference, the registration load at 0xc79aac, plus one relocation/data reference and no direct branch callers; callback 0xc79ad4 has one current text reference at 0xc79ab8 and no direct branch callers. The upstream invocation therefore must be recovered through descriptor/payload resolver state, not through a missing static direct call.",
      `The Level setup callback descriptor is now typed: GOT slot 0x2ae61c8 points through descriptor pointer slot 0x2af0cf8 to the Level type descriptor at 0x3047e90. Its initializer 0x7cd9e0 calls the generic type descriptor initializer with name ${JSON.stringify(levelTypeDescriptorNameStringValue)}, kind 1, size 0x198, field-table pointers 0x30506e0/0x3050858, and computed descriptor key 0x${levelTypeDescriptorComputedHashHex}.`,
      "The generic callback dispatch side is now current-binary evidence: 0x188eba4 reads the dispatch key from descriptor +0x4, searches the callback registry tree, loads the matched callback function pointer from node +0x28, and forwards the original payload pointer as x2 before branching to the callback.",
      "Known current 0x188eba4 callsites are now separated by role: 0x8cc03c dispatches LevelVisuals +0x48 from the Level runtime visuals loader, 0xc79b1c dispatches active Level +0x158 inside the already-running Level setup callback, and 0x188e3ec is a higher global dispatch helper reached after 0x188cc88 resolves a descriptor/payload pair.",
      `The three current 0x188eba4 direct callsites are now parameter-source classified as ${JSON.stringify(genericCallbackDispatchCallsiteClassifications)}. All three have matched opcode evidence, ${genericCallbackDispatchCallsitesUsingLevelSetupRegistryDescriptor} direct callsites use Level setup registry descriptor slot 0x2ae61c8, and ${genericCallbackDispatchCallsitesUsingResolverOutputDescriptor} direct callsite uses a descriptor returned by 0x188cc88.`,
      "The Level runtime visuals loader callsite 0x8cc03c loads descriptor slot 0x2ae29a8 and payload LevelVisuals +0x48, so it is the already-known LightPlacement dispatch. The Level setup callsite 0xc79b1c loads adjacent secondary descriptor slot 0x2ae7ed8 and payload active Level +0x158, so it is an internal dispatch after 0xc79ad4 is already running. The global helper callsite 0x188e3ec loads the callback registry and dispatches descriptor/payload output from 0x188cc88.",
      "The higher global dispatch helper 0x188e338 is now current-binary evidence: it can install temporary payload-list/context globals, resolves a descriptor/payload pair through 0x188cc88, then dispatches the resolved descriptor and payload through global callback registry 0x311a968 and 0x188eba4.",
      `The seven current 0x188e338 direct helper callsites are now parameter-source classified as ${JSON.stringify(genericCallbackDispatchHelperCallsiteClassifications)}. All seven have matched opcode evidence; ${genericCallbackDispatchHelperCallsitesWithLevelSetupIndexQuery} callsites continue into a Level setup index 0x2d44e98 query after the helper dispatch, and ${genericCallbackDispatchHelperActivePreviewCandidateCallsites} remain active-preview candidates to trace deeper.`,
      "The active-preview candidate is now narrowed to 0x8befac. It dispatches the cached runtime resource key from 0xbebf54/0xbec044 with the owner-resolve object as x3, then queries Level setup index 0x2d44e98 and applies the matched object through context +0x140/+0x148.",
      "The 0xc04b98 object-builder B path still reaches a Level setup index query, but it is now classified as replay/stream payload evidence rather than active hero/model preview evidence: its key source is typed-object 0x03f3 payload word0, and the only bounded input sources are framed stream-buffer input plus the .vgr/timed queue.",
      "The active-preview candidate remains bounded but unresolved: 0x8befac lacks the concrete cached runtime key value selected behind 0xbebf54/0xbec044. Reaching the Level setup index query is therefore not enough to prove hero/model preview profile selection.",
      "Descriptor/payload resolver 0x188cc88 -> 0x188f8f8 is now current-binary evidence: 0x188cc88 selects a registry bucket, 0x188f8f8 hashes the key, searches the bucket tree, writes matched descriptor node +0x30 to the output pointer, and returns matched payload node +0x28.",
      `The 0x188cc88 descriptor/payload resolver shim has ${descriptorPayloadResolverShim?.directCallers.length || 0} current direct/tail callers. Scanning those caller neighborhoods against strict Level/Profile/Probe targets found ${descriptorPayloadResolverShimProfileBranches.length} direct branches, so none of the direct shim callers currently proves the active hero/model preview profile selector.`,
      `The 0x188cc88 direct/tail callers are now source-classified as ${JSON.stringify(descriptorPayloadResolverShimCallerClassifications)} with ${descriptorPayloadResolverShimActivePreviewCandidateCallers} unbounded active-preview candidates. The classified buckets are manifest readers, HUD quick-message setup, resource-key table shims, and the generic callback dispatch helper; they are resolver mechanics or negative manifest/HUD evidence rather than active hero/model preview Level/Profile selection.`,
      "The HeroManifest-adjacent dynamic resolver helpers at 0xbeaf44..0xbeb048 retry through resource-key string conversion 0xc72cec when a direct lookup misses, then continue reading manifest object fields. That makes them HeroManifest helper/fallback evidence, not proof of the active preview LevelVisuals profile source.",
      "Three 0x188e338 callers are now negative manifest evidence: 0x81c9a8, 0x81ca94, and 0x826554 dispatch the *KindredManifest* key and are not active hero/model preview Level/Profile selection.",
      "Two object-builder callsites are now separated as still-relevant but incomplete evidence: 0xc0374c and 0xc04b98 resolve a resource key through 0xc72dbc/0xc72da8, request one object through 0x188e338, and then populate the returned object. The 0xc04b3c branch later loads Level setup runtime index 0x2d44e98 and queries matching objects through 0x188e540.",
      "The object-builder B branch is now tied to the current-binary typed-object construction dispatcher: 0x82dc04 reads a big-endian 16-bit type id, normalizes it by subtracting 0x3e9, indexes jump table 0x1a995b0, and dispatches type id 0x03f3/1011 to case 0x82e4ac.",
      "Typed-object case 0x03f3 copies 0x2ea bytes, performs endian fixups, calls parser wrapper 0x82adb8 at 0x82ea98, and that wrapper calls constructor 0xc0458c at 0x82b278. The constructor installs vtable object pointer 0x2717420 and stores the resource key/id fields that 0xc04b3c later consumes.",
      "The 0x03f3 parser wrapper now proves where object-builder B's resource-key id comes from: it loads payload word0 at 0x82b0e8, preserves it at 0x82b0ec, reloads it as constructor argument w1 at 0x82b1b8, and constructor 0xc0458c stores w1/w2 at object +0x1c before 0xc04b3c resolves object +0x1c through 0xc72da8.",
      "The typed-object dispatcher has two current direct callers and both input sources are now structurally classified: 0x8131fc belongs to the framed stream-buffer source 0x8130b0, which reads bytes into object +0x8, reads a big-endian two-byte frame length, dispatches the payload to 0x82dc04, then compacts remaining buffered bytes; 0x844588 belongs to the timed/queued source 0x8444e4, which reads .vgr records through 0x825960 into object +0x19/+0x81c before dispatch. This proves object-builder B belongs to a shared runtime typed-object construction system, not a single preview-side heuristic.",
      `One upstream typed-object input path is now proven to be binary .vgr stream handling: 0x825f90 builds paths with the ${typedObjectVgrPathFormatStringValue || "<unreadable>"} format string at 0x1a99551, 0x825a70 opens the file using ${typedObjectVgrFileModeStringValue || "<unreadable>"} at 0x1ae9d62 through fopen@plt, and 0x825960 reads/byte-swaps stream data through the fread wrapper 0xd6e15c.`,
      `The same decompiled replay subsystem initializes the .vgr base name as ${JSON.stringify(typedObjectReplayBaseNameStringValue || "<unreadable>")} and the replay manifest name as ${JSON.stringify(typedObjectReplayManifestNameStringValue || "<unreadable>")}. That ties this feed to replay/recorded-stream state, not a proven static hero/model preview selector.`,
      `The same local file subsystem also formats timestamped ${typedObjectVgrTimestampFormatStringValue || "<unreadable>"} names and opens them with ${typedObjectVgrFileWriteModeStringValue || "<unreadable>"}, so the typed-object feed is a runtime stream/file-rotation mechanism rather than a proven static asset table in the extracted roots.`,
      `The local extracted asset roots currently expose ${typedObjectVgrLocalFileCandidates.length} .vgr file candidates under ${typedObjectVgrLocalFileScanRoots.join(", ") || "<none>"}. This makes concrete object-builder B key recovery depend on a real .vgr/frame payload capture or a deeper path-source trace, not on broad raw-data scans.`,
      `The iOS raw Data reservoir is now measured separately: ${typedObjectRawIosDataAudit.fileCount} files (${typedObjectRawIosDataAudit.extensionlessFileCount} extensionless, ${typedObjectRawIosDataAudit.hashNamedFileCount} hash-named) under ${typedObjectRawIosDataAudit.dataRoot}, scanned by ${typedObjectRawIosDataAudit.prefixBytes}-byte prefixes plus a ${typedObjectRawIosDataAudit.deepScanBytes}-byte strict frame scan over unknown/size-prefixed candidates with heuristic state ${typedObjectRawIosDataAudit.heuristicState}. RSC0 wrapper files are also inspected at their 0x20 inner payload offset; ${typedObjectRawIosDataAudit.rsc0HeaderPayloadSizeMatchCount}/${typedObjectRawIosDataAudit.rsc0FileCount} have payload-size fields matching file size - 0x20, with inner classes ${JSON.stringify(typedObjectRawIosDataAudit.rsc0InnerClassifications)}. Embedded/direct CFF0 prefixes are scanned by ${typedObjectRawIosDataAudit.cff0PrefixBytes}-byte prefixes; ${typedObjectRawIosDataAudit.cff0ParsedPrefixCount}/${typedObjectRawIosDataAudit.cff0FileCount} expose parseable prefix chunks with classes ${JSON.stringify(typedObjectRawIosDataAudit.cff0Classifications)} and chunk magic counts ${JSON.stringify(typedObjectRawIosDataAudit.cff0ChunkMagicCounts)}. The strict deep scan checked ${typedObjectRawIosDataAudit.deepScanFileCount} files / ${typedObjectRawIosDataAudit.deepScanBytesRead} bytes and found ${typedObjectRawIosDataAudit.deepScanFrameCandidateCount} structural typed-object frame candidates, including ${typedObjectRawIosDataAudit.deepScanResourceLikeKeyFrameCandidateCount} resource-like key-string candidates. The 0x03f3 word0 cross-check found ${typedObjectRawIosDataDeepHashAudit.engineHashMatchCount} engine-hash matches against ${typedObjectRawIosDataDeepHashAudit.checkedResourceRows} indexed build resources. This is diagnostic coverage only and does not confirm a typed-object payload source.`,
      `The runtime key upstream recovery audit is now explicit: ${runtimeResourceKeyUpstreamRecoveryAudit.sourceCount} upstream sources are bounded (${runtimeResourceKeyUpstreamRecoveryAudit.sources.map((source) => source.sourceId).join(", ")}), ${runtimeResourceKeyUpstreamRecoveryAudit.sourcesWithStrictProfileBranches} have strict Level/Profile local branches, and local decoded payload availability is ${runtimeResourceKeyUpstreamRecoveryAudit.localDecodedPayloadAvailable}. Renderer/profile takeover remains closed because no concrete active key was recovered.`,
      `The typed-object source owner is now vtable-bounded: frame source addresspoint ${hex(addresses.typedObjectFrameSourceVtableAddressPoint)}; timed source addresspoint ${hex(addresses.typedObjectTimedSourceVtableAddressPoint)}; timed source owns a frame child at +0x6d0 constructed by ${hex(addresses.typedObjectFrameSourceConstructor)}; global selector ${hex(addresses.typedObjectReplaySourceSelector)} stores current source at ${hex(addresses.typedObjectReplaySourceGlobalSlot)}; mode 0 is timed/vgr and mode 1 is alternate replay source. Renderer/profile takeover remains closed because this proves replay/stream source ownership, not a decoded active preview payload.`,
      `The typed-object replay source selector caller set is now bounded: selector ${hex(addresses.typedObjectReplaySourceSelector)} has direct callsites ${typedObjectReplaySourceSelectorCallerAudit.selectorDirectCallerHexes.join(", ")}, classified as startup mode 0, a mode-zero thunk, and a runtime switch choosing mode 1 or 0. The strict Level/Profile/Probe scan around those selector callers found ${typedObjectReplaySourceSelectorCallerAudit.strictProfileBranchCount} direct branches, so this remains replay/source lifecycle evidence rather than active hero/model preview proof.`,
      "A separate runtime key-selection typed-object case is now current-binary evidence: jump-table type id 0x046f/1135 reaches case 0x82fbcc, copies a 0x45-byte payload, byte-swaps payload +0x40, and calls helper 0x82d870.",
      "Helper 0x82d870 obtains the current runtime/profile owner through 0x8be0b0, copies the payload-leading string, reads payload +0x40 as a float/time field and +0x44 as a boolean flag, then calls 0x8bf530 with owner, key string, float/time, and flag.",
      "Runtime key setter 0x8bf530 writes the selected key string into global string slot 0x3051220 through 0xbebf7c, immediately resolves/caches it through 0xbebf9c -> 0xc72dc8 into 0x3051218, and stores the payload float/time field at owner +0x2bc.",
      "A second typed-object runtime key writer is now current-binary evidence: jump-table type id 0x03e9/1001 reaches case 0x82dc80, copies a 0x65-byte payload, calls helper 0x82b68c at 0x82dcdc, and that helper treats payload +0x20 as the runtime key string before writing it through 0xbebf7c at 0x82b6c0.",
      "All current direct callers of global key setter 0xbebf7c are now bounded: 0x8bf574 is the typed-object runtime key-selection setter, 0xa7ca68 is the CharacterLobby key-switch callback, and 0x82b6c0 is the type 0x03e9 inline-copied key writer helper that immediately resolves/caches through 0xbebf9c at 0x82b6dc.",
      "The global key setter input sources are now structurally separated too: 0x8bf574 passes 0x8bf530 arg1, 0x82b6c0 passes decoded type 0x03e9 payload +0x20, and 0xa7ca68 passes CharacterLobby record +0x4. None of these three callsites contains a static concrete key string; all require runtime payload/record capture for exact values.",
      "The resolved runtime key object now has two current-package key consumers: helper 0xbe3a4c reads the cached resolved object through 0xbebf54 and copies object +0x8 into the pre-owner request string, while post-accessor 0xbec044 returns object +0x20 for the Level setup dispatch key used at 0x8befac.",
      `Resolved-key index-query consumers are now separated by target index slot: ${runtimeResolvedKeyIndexQueryConsumerAudit.levelSetupIndexQueryCount} reaches Level setup 0x2d44e98, ${runtimeResolvedKeyIndexQueryConsumerAudit.playerLockIndexQueryCount} reach player-lock/HUD 0x2b0f0b0, and ${runtimeResolvedKeyIndexQueryConsumerAudit.ownerResolveIndexQueryCount} reach owner-resolve 0x3034d00. Unknown resolved-key index-query callsites: ${runtimeResolvedKeyIndexQueryConsumerAudit.unknownIndexQueryCount}.`,
      "The resolved-key object request owner registration is now current-binary evidence: the module registration hub calls 0x8bee60 at 0x8bad0c, and 0x8bee60 installs slot 0 callback 0x8bef18, slot 1 callback 0x8bf03c, and slot 4 callback 0x8bf064 through the shared callback-slot installer 0x188c2f4.",
      "The shared callback-slot dispatch shape is now current-binary evidence too: 0x188c638 preserves the requested slot, checks per-record slot callback and tail-callback pointers, calls 0x188bf3c, and 0x188bf3c invokes active-record callbacks through blr x11 before tail-branching through the slot tail callback.",
      "The native frame loop at 0x8227c0 now proves one upstream phase dispatcher: it calls 0x188e614 at 0x8228b0 to dispatch slots 2, 3, 4, and 5 through 0x188c638, then calls 0x188e714 at 0x8228c0 to dispatch slot 6.",
      "The generic slot 0 object-create path is now current-binary evidence: 0x188b8b8 calls 0x188c490, 0x188c490 tail-enters 0x188bb94, and 0x188bb94 invokes record initializer +0xb0 followed by slot 0 callback record +0x0. The resolved-key request path reaches this mechanism at 0x8bef90, and later creates/stores a related runtime object through 0x8befc0 -> 0x188e2ac -> 0x188c490 at owner +0x2b0.",
      "The two registry indices used by that resolved-key request path are now sourced: 0x8b90a0 registers the related-create owner and stores its index in 0x3034ce0, while 0xc74158 registers the owner-resolve path and stores its index in 0x3034d00.",
      "The owner-resolve registry index 0x3034d00 is now bounded beyond the main 0x8bef88 request path. Current references at 0x936cec, 0x936e58, 0x976048, 0xac2384, 0xc06270, and 0xc06320 all read the same 0x3034d00 slot and query through 0x188e540, while their strict local Profile/Probe scan finds 0 direct branches into Level setup callback, LevelVisuals loading, or scene/probe profile payload loading.",
      "The resolved runtime resource-key is now tied to a concrete object-request path: 0x8bef98 reads the cached key through 0xbebf54, 0x8bef9c prepares it through 0xbec044, 0x8befac dispatches it through generic helper 0x188e338 with the runtime owner as x3, 0x8befdc loads Level setup runtime index 0x2d44e98, and 0x8befec queries the matched object through 0x188e540.",
      "The matched object returned by 0x188e540 is now traced one step further: 0x8beff0 loads it from the stack into x19, then the path resolves a context through 0xc74ce4 and processes the object through context +0x140 and +0x148 via 0xca3bd0 at 0x8bf000 and 0x8bf010.",
      "The context processor 0xca3bd0 is now traced internally: each context entry chooses array/list lookup 0xc7a400 or single-object lookup 0xc7a2fc, both use FNV-style hashed object tables, and then dispatch payload +0x10 through entry apply 0xca3564 at 0xca3c38/0xca3c6c.",
      "Entry apply 0xca3564 resolves the entry apply key through 0xc72dbc/0xc72dc8, resolves a registry object through global index 0x2b84a40 and 0x188b8b8, writes a generated transform/orientation payload through 0xc72fd8, optionally attaches a secondary object through global index 0x30af5b0 and 0xc7ab28, then builds/inserts per-entry hashed data through 0xbb7d00 and 0xca3ffc.",
      "The character-lobby/state object has current-package vtable evidence: owner initializer 0xa7c7a4 is referenced from primary vtable 0x26ed4f8, and the key-switch callback 0xa7ca30 is referenced from subobject vtable slot 0x26ed630 with related subobject vtable 0x26ed688.",
      "A non-stream character-lobby candidate uses the same global runtime resource-key slot: vtable callback 0xa7ca30 is referenced from data.rel.ro slot 0x26ed630, copies record +0x4 as a resource-key string, writes it through 0xbebf7c, then applies the record mode/state through 0xa7c934.",
      "The CharacterLobby key-switch record shape is now opcode-bounded: callback 0xa7ca30 reads record +0x0 as a 0..4 mode enum, record +0x4 as the resource-key string, dispatches the mode through a local jump table, and maps those cases only into lobby states 0/1/2/3/4 before calling 0xa7c934.",
      "The character-lobby key-switch callback is now traced one step further: after writing record +0x4 through 0xbebf7c, it reads the cached resolved key through 0xbebf54 at 0xa7cac0, checks it through status predicate 0xbec208 at 0xa7cac4, and feeds the resulting boolean into mode/state switcher 0xa7c934.",
      "The CharacterLobby key-switch thunk is now opcode-bounded too: 0xa7cb0c adjusts the subobject pointer by -0xd8 and 0xa7cb10 tail-branches to 0xa7ca30. This is subobject/vtable forwarding, not a new Level/Profile source.",
      "The CharacterLobby mode switch is now bounded one layer deeper: mode switch 0xa7c934 constructs state object A through 0xad54a0 and stores it at owner +0xe8, or constructs state object B through 0xacd3cc and stores it at owner +0xe0, then forwards the created child through owner vtable slot +0x78.",
      "Both CharacterLobby state objects remain presentation/model-state evidence rather than shader/probe takeover evidence: their constructors and visual-list update paths register local payload/event callbacks and repeatedly read/status-check the cached runtime key, but their local strict scan still finds no direct Level/Profile/Probe branch.",
      "The CharacterLobby state-object string references classify this branch as draft-lobby UI/state rather than active hero model preview lighting: the local strings are MENU_DRAFT_LOBBY label/button keys, ui_drafting hero-ban/lock-in sounds, and VO_Vainglory_SwapHeroes.",
      "The same character-lobby/state neighborhood references build://Sounds/UI.assetbundle/ui_character_lobby_entered.mp3 at 0xa7c970, so this candidate is closer to hero/skin lobby presentation than the .vgr stream path.",
      "The current key owner global lifecycle is now current-binary evidence: constructor 0x8be378 initializes the owner, publishes it to global slot 0x3034cf8 at 0x8be62c, and destructor path 0x8bed64 clears the same slot at 0x8bed9c.",
      "The current key owner child registry index is now sourced: module registration hub callsite 0x8badf4 calls 0x919530, which publishes index 0x3034d10 at 0x9195a8 and installs slot 2/4 callbacks through 0x188c2f4.",
      "The secondary current object registry index is now sourced: module registration hub callsite 0x8badec calls 0x9131dc, which publishes index 0x2d44e78 at 0x913258, installs many keyed callbacks through 0x188c340, then installs slot 2/4 callbacks through 0x188c2f4.",
      "The current key owner child create path is now traced through two current-package users: 0x8bfa6c/0x8bfa74 search owner +0x18 for index 0x3034d10 and create through 0x188b8b8 at 0x8bfa9c when missing; 0x8bfd84/0x8bfdb4/0x8bfdb8 repeats the same lookup/create shape.",
      "The current owner state/position record registration is now sourced: module registration hub callsite 0x8badcc calls builder 0x8cfb7c, which creates a runtime record with callback tables 0x8d2100/0x8d2124, stores runtime kind 0x8a8, publishes registry index 0x3035264 at 0x8cfbe4, and installs slot 4 callback 0x8cfbec through 0x188c2f4.",
      "The second write to 0x3035264 is accounted for: guarded lazy initializer 0x79f37c checks guard slot 0x3035268, reads a source index, and copies it into 0x3035264 at 0x79f3a0. This explains why the store scan reports two writes for the same registry index.",
      "The same record's slot 4 runtime update path is now partially traced: callback 0x8cfbec performs per-frame/timeout object maintenance, then reaches update dispatcher 0x8cfd5c; dispatcher 0x8cfd5c reads attached object +0x828, calls 0xca7014/0xca6fbc, and projects attached-object position through 0x8cfe60.",
      "The current owner state attach path is tied into that update state: 0x8cff24 stores the attached object at owner +0x828, copies transform/timing fields into owner +0x830..+0x88x, and tail-refreshes cached transform through 0x8d014c.",
      "A current owner active-state bridge is now traced at 0x8d0598. In current-key-owner mode it reads owner 0x3034cf8 through 0x8be0b0, searches child index 0x3034d10, resolves child data through 0x8bf6c8, and also queries Level setup runtime index 0x2d44e98 through 0x188e540. In fallback mode it searches secondary current-object index 0x2d44e78 from object +0x828.",
      "The bridge has current-package callers at 0x8d0c48 and 0x8d0f8c, plus state refresh/cleanup thunks 0x8cfb70 -> 0x8d0fc4 and 0x8cfb74 -> 0x8d120c. Those refresh/cleanup paths use the same 0x3034d10/0x2d44e78 split, so this is a real current-owner state/position bridge rather than a standalone resource-key helper.",
      "The current owner index 0x3035264 now has one upstream consumer classified: constructor 0x94ad7c reads 0x3035264, creates/resolves a current owner through 0x188e2ac, stores it at object +0x340, and labels the object with the literal HUD_Minimap string at 0x1aa4e1a.",
      "The paired HUD_Minimap update 0x94aef8 queries Level setup index 0x2d44e98 through 0x188e540, forwards object +0x340 into subobject updater 0x94c79c, samples minimap layout through 0x94cb00, then attaches its external object through 0x8cff24 at 0x94afb8.",
      "The HUD_Minimap subobject path is also current-package evidence: initializer 0x94c650 installs subobject vtables, updater 0x94c79c stores the current owner pointer at subobject +0x100, and layout update 0x94c8ec uses build://%s formatting for minimap texture/resource layout work.",
      "This HUD_Minimap path is useful negative evidence: it proves why 0x3035264 and 0x8cff24 appear in a real runtime owner path, but the HUD_Minimap label and layout/texture helpers classify this branch as HUD/minimap state, not active hero/model preview lighting or material selection.",
      "A separate player-lock/HUD runtime index path is now bounded. Module hub callsite 0x8bae1c calls registration 0x90c9a4; that registration stores initializer 0x90cd10 and invoke callback 0x90cd44, publishes registry index 0x2b0f0b0 at 0x90ca1c, installs a slot callback through 0x188c2f4, and installs keyed callback 0x90ca68 through 0x188c340 with key id 0x377a062d.",
      "The 0x2b0f0b0 index explains additional resolved-key/index-query hits: 0x80180c creates/resolves through 0x188b8b8, 0x888210/0x88821c perform a simple 0x188e540 query, 0x8c5378/0x9166c4/0x95d530 perform current resolved-key checks before 0x188e540, and 0xbab8c0/0xbab8d0 iterate indexed objects before dispatching keyed callback id 0x377a062d.",
      "This player-lock/HUD index path is negative evidence for hero preview. Its local strings are __PLAYER_LOCK__, __HUD__, Tutorial05_5v5_Client, and *VisionTotem*, and its strict local Profile/Probe scan finds 0 direct branches into Level setup callback, LevelVisuals loading, or scene/probe profile payload loading.",
      `Resolved resource-key accessor 0xbebf54 has ${runtimeResourceKeyResolvedAccessor?.directCallers.length || 0} direct callers in the current binary; scanning each caller's local neighborhood against ${runtimeResolvedKeyLocalConsumerTargets.length} Level/Profile/Probe/key targets found ${runtimeResolvedKeyLocalProfileConsumerBranches.length} immediate Level/Profile/Probe branches.`,
      `Post-accessor 0xbec044 has ${runtimeResourceKeyPostAccessor?.directCallers.length || 0} direct callers in the current binary. Local context classification keeps 0x8bef9c as the only active-preview candidate and classifies ${runtimeResourceKeyPostAccessorSettingsPreferredBuildPathCallers} non-active callers as Settings/preferredBuildPath negative evidence.`,
      `Global resolver 0xbebf9c has ${runtimeResourceKeyGlobalResolver?.directCallers.length || 0} direct callers in the current binary. Local context classification splits them into ${Object.entries(runtimeResourceKeyGlobalResolverCallerClassifications)
        .map(([name, count]) => `${name}:${count}`)
        .join(", ")} with ${runtimeResourceKeyGlobalResolverActivePreviewCandidateCallers} active-preview callers.`,
      `Global resource-key setter 0xbebf7c has ${runtimeResourceKeyGlobalSetter?.directCallers.length || 0} direct callers in the current binary; scanning those local neighborhoods against ${runtimeResourceKeyGlobalSetterLocalTargets.length} Level/Profile/Probe/key targets found ${runtimeResourceKeyGlobalSetterLocalProfileBranches.length} immediate Level/Profile/Probe branches.`,
      `Resolved-key status predicate 0xbec208 has ${runtimeResourceKeyStatusPredicate?.directCallers.length || 0} direct callers in the current binary; scanning those local neighborhoods against ${runtimeResourceKeyStatusPredicateLocalTargets.length} Level/Profile/Probe/key targets found ${runtimeResourceKeyStatusPredicateLocalProfileBranches.length} immediate Level/Profile/Probe branches.`,
      `Scanning the character-lobby owner initializer/state refresh/mode switch/key-switch neighborhoods against the strict Level/Profile/Probe targets found ${characterLobbyRuntimeProfileBranches.length} direct branches.`,
      `Scanning the CharacterLobby state object constructors/refresh/apply/update neighborhoods against the strict Level/Profile/Probe targets found ${characterLobbyStateObjectProfileBranches.length} direct branches.`,
      `Scanning the additional 0x3034d00 owner-resolve index consumers against the strict Level/Profile/Probe targets found ${runtimeOwnerResolveIndexProfileBranches.length} direct branches.`,
      `Scanning the resolved-key object request owner registration/callback neighborhoods against the strict Level/Profile/Probe targets found ${runtimeResolvedKeyObjectRequestOwnerProfileBranches.length} direct branches.`,
      `Scanning the resolved-key object list processor and entry apply neighborhoods against the strict Level/Profile/Probe targets found ${runtimeResolvedKeyObjectEntryApplyProfileBranches.length} direct branches.`,
      `Scanning the typed-object dispatcher framed stream and timed/.vgr queue input source neighborhoods against the strict Level/Profile/Probe targets found ${typedObjectDispatcherInputSourceProfileBranches.length} direct branches.`,
      `Scanning the 0x188cc88 descriptor/payload resolver shim direct caller neighborhoods against the strict Level/Profile/Probe targets found ${descriptorPayloadResolverShimProfileBranches.length} direct branches.`,
      "After receiving the active Level, 0xc79ad4 expands additional Level fields +0x138/+0x150/+0x148/+0x140, iterates Level +0x160 through handler 0xc7e7b4, and conditionally iterates Level +0x190 through handler 0xc67444.",
      "The visuals loader receives the active Level as x1, stores it at owner +0x30, reads Level +0x170 lookup state, then walks Level +0x10 LevelVisuals references before calling 0x8cc27c.",
      "The LevelVisuals apply processor 0x8cc27c now has opcode-backed field routing: +0x8/+0x18/+0x10 source-table or selector lists route through 0x8cca64, +0x20/+0x30/+0x28 transform/shape lists route through 0x8ccd14, predicate 0x830e00 chooses the +0x18/+0x30 versus +0x10/+0x28 branch, +0x38 and +0x40 route through registry-index helpers 0x8dbac8/0x8dc410, +0x58 routes static lens-flare resources through 0xc72dbc/0xc72dc8 and 0x8cb108/0x8cb180, and +0x50 validates then dispatches the profile/probe payload to 0xe36f38.",
      "The registered cleanup/scan callback also reads owner +0x30 and Level +0x188, proving owner +0x30 is persistent active Level state shared by this module.",
    ],
    blockers: [
      "The generic Level runtime owner dispatch, callback registration, and generic callback dispatch are now recovered, but the runtime path that invokes registered callback 0xc79ad4 with the hero/model preview Level object is still unresolved.",
      "Static references to the Level setup descriptor/callback are now closed: 0x2ae61c8 is only loaded at registration, and 0xc79ad4 is only referenced as callback payload. The remaining active-preview edge is a runtime descriptor/payload key match that resolves to 0x2ae61c8, not a hidden direct caller to 0xc79ad4.",
      "The Level setup descriptor's runtime dispatch key is now known as the hash of type name Level, 0x858E20D4. The remaining active-preview search should target runtime resolver paths that match this Level descriptor key and return a Level payload, not arbitrary resource-key or string-key traffic.",
      "The known 0xc79b1c dispatch is inside 0xc79ad4 and uses the adjacent descriptor slot 0x2ae7ed8, so it must not be mistaken for the upstream invocation of 0xc79ad4 registered through descriptor slot 0x2ae61c8. The structured 0x188eba4 callsite context scan now confirms that 0 direct 0x188eba4 callsites use 0x2ae61c8.",
      "The descriptor/payload resolver shim 0x188cc88 is recovered, and its direct callers are now locally scanned and source-classified, but none of those direct caller neighborhoods branches into the strict Level/Profile/Probe target set or remains an unbounded active-preview candidate. The missing active preview selector is therefore still the concrete active-preview key/source outside these manifest/HUD/generic helper paths that resolves to the Level setup descriptor, not the generic resolver mechanics.",
      "The generic helper 0x188e338 direct callers are now classified too. Manifest fallbacks, object-builder A, the runtime pre-owner dispatch, and object-builder B replay/stream dispatch are negative or setup evidence; only the runtime resolved-key dispatch at 0x8befac remains an active-preview candidate. The next unresolved edge is the concrete cached key behind that path, not generic helper mechanics.",
      "The 0xc04b3c object-builder branch is now proven to be typed-object id 0x03f3/1011 and correlated with Level setup runtime index 0x2d44e98, but its concrete resource key/table entry depends on replay/stream payload capture. It must not be promoted into active hero/model preview evidence.",
      "The object-builder B key id is now bounded to typed-object 0x03f3 payload word0 -> constructor argument w1 -> object +0x1c -> 0xc72da8 lookup, but the concrete key values are not recovered because the current extracted roots do not include a local .vgr stream file and no confirmed frame payload capture has been imported. The iOS raw Data/RSC0/CFF0 prefix and strict deep frame scans are coverage evidence, not a substitute for a decoded/captured payload.",
      "The typed-object dispatcher input sources are now fully bounded as framed stream-buffer input and timed/.vgr queue input. That is negative/guardrail evidence for the model viewer: no local .vgr capture or separate non-stream preview call path is proven, so these records must not be treated as the active hero/model preview Level/Profile source.",
      "Type id 0x046f proves a stream-driven runtime resource-key switch, but its proven dispatcher inputs are the framed stream and timed/.vgr queue. It narrows the shape of the missing active Level/Profile key but does not prove the Electron viewer's active hero/model preview selection.",
      "The third global key setter caller at 0x82b6c0 is now bounded to typed-object type 0x03e9/1001 as an inline copied-key writer plus immediate resolver, but the proven feed is still the shared typed-object dispatcher and its input-source neighborhoods still have no local Level/Profile/Probe branch. Until a separate active-preview source record is identified, it is not active preview proof.",
      "The concrete key values behind all three direct 0xbebf7c setter callsites are not statically recoverable at the callsites. They come from typed-object payload strings or a runtime CharacterLobby record, so the remaining active-preview key must be recovered by a real runtime capture or a proven upstream payload/record decoder, not by assigning a static candidate.",
      "The runtime key upstream recovery audit keeps all four known input reservoirs diagnostic-only: framed stream needs a live frame capture, timed .vgr needs a decoded replay payload, local iOS raw Data has no usable resource-shaped key/hash hit, and CharacterLobby record/thunk evidence remains UI/state without Level/Profile branches.",
      "Typed-object replay/stream source ownership is now recovered, but it still has no decoded active preview payload and no strict Level/Profile branch. The frame/timed/alternate source vtables and global selector must remain guardrail evidence, not renderer/profile takeover evidence.",
      "The replay source selector caller set is now bounded to lifecycle/switch wrappers with local mode constants and zero strict Level/Profile branches. That closes the selector-caller path as active-preview-negative evidence unless a decoded payload or separate active preview source proves otherwise.",
      "The resolved-key object request owner registration, shared slot dispatcher, generic object-create path, and registry-index sources prove how 0x8bef18 is installed and how slot 0 can be invoked when the owner object is created/resolved. The current native frame loop proves slots 2-6 are dispatched, including slot 4 from this owner, but the concrete active hero/model preview resource key/class that causes the slot 0 path to select the preview Level/Profile is still unresolved.",
      "The resolved-key object-request path proves the cached key can request an object, query Level setup runtime index 0x2d44e98, and feed the matched object through context +0x140/+0x148 processors, but the matched object's concrete class/resource key and the upstream active preview call path that would invoke registered callback 0xc79ad4 are still unresolved.",
      "The resolved-key object entry apply path is now internally traced through 0xca3bd0 -> 0xc7a400/0xc7a2fc -> 0xca3564, but local scanning still shows no direct Level/Profile/Probe branch there. This makes it a concrete object/context application stage, not the active hero/model preview Level/Profile source yet.",
      "The character-lobby candidate proves a non-stream key switch in a presentation-like neighborhood, but it is not yet connected to Level +0x10, LevelVisuals +0x50, the scene/probe profile payload loader, or registered callback 0xc79ad4.",
      "The character-lobby key-switch record shape is now bounded as record +0x0 mode enum plus record +0x4 key string. Its local mode jump table feeds only 0xa7c934 lobby state selection, so this non-stream setter caller must remain presentation/model-state evidence until an upstream Level/Profile connection is proven.",
      "The character-lobby status-predicate path only proves that the lobby key switch checks whether the cached resolved key is valid before changing mode/state. Its local neighborhood still does not branch to Level/Profile/Probe code, so it must not be promoted into the active preview profile source.",
      "The character-lobby local-neighborhood scan currently has no strict Level/Profile/Probe branch, and the newly bounded state object layer also has no strict Level/Profile/Probe branch. Its draft-lobby label/sound references further classify this candidate as presentation/model-state UI rather than a proven active preview Level/Profile source.",
      "The newly recovered current key owner and child-index chain narrows the object graph below the resolved global key, but it still does not prove the concrete LevelVisuals +0x50 payload or active hero/model preview profile. It must remain diagnostic-only.",
      "The current owner state/position record registration and slot 4 update path prove another runtime record below the current-owner graph, but its attached object +0x828 and global index 0x3035264 still need an upstream selector before it can be used to drive renderer state.",
      "The current owner active-state bridge reaches Level setup index 0x2d44e98 and current child/secondary objects, but it still does not identify the concrete active preview resource key, LevelVisuals +0x50 payload, or callback invocation that selects the hero/model preview profile.",
      "The 0x3035264 -> 0x94ad7c/0x94aef8 -> 0x8cff24 branch is now classified by its literal HUD_Minimap label and build://%s minimap layout work. It must not be used as the active hero/model preview selector or as material/shader evidence.",
      "The 0x2b0f0b0 player-lock/HUD path is also classified as negative evidence by __PLAYER_LOCK__, __HUD__, Tutorial05_5v5_Client, and *VisionTotem* strings plus a zero strict Profile/Probe local scan. It explains resolved-key/index-query noise but must not be promoted to active hero/model preview profile selection.",
      "The additional 0x3034d00 owner-resolve index consumers are now bounded by opcode evidence and zero strict Profile/Probe local branches. They may query owner-resolve objects and derived counters/values, but they do not identify the active hero/model preview LevelVisuals profile payload.",
      "The resolved-key getter 0xbebf54 is broadly consumed, but the local-neighborhood scan does not currently show an immediate branch from those consumers into Level/Profile/Probe dispatch. This is negative evidence: the global key cache alone is not enough to identify the active preview Level/Profile chain.",
      "The post-accessor 0xbec044 caller set is now bounded to one active candidate plus Settings/preferredBuildPath negative evidence. This narrows the 0x8befac blocker to the concrete cached key value selected behind 0xbebf54/0xbec044, not an unknown extra post-accessor caller.",
      "Resolved-key consumers that also call 0x188e540 are now bounded by their index slot. Only the 0x8bef98/0x8befec path reaches Level setup 0x2d44e98; the other bounded callsites query player-lock/HUD 0x2b0f0b0 or owner-resolve 0x3034d00 and must not be promoted to hero/model preview profile selection.",
      "The global resolver 0xbebf9c caller set is now bounded to manifest/cache refresh, typed-object .vgr/input setup, typed-object 0x03e9 inline key writing, and typed-object 0x046f runtime key selection. These explain cached-key refresh sources, but none is proven to be the active hero/model preview Level/Profile selector.",
      "The LevelVisuals apply processor field routing is now opcode-backed, but the exact schema field names and active hero/model preview LevelVisuals record are still unresolved. This must remain report-only evidence until the source record/profile selection is proven.",
      "The active hero/model preview LevelVisuals profile selection is still unresolved.",
      "This evidence must not be used as a renderer takeover gate until the active preview Level/Profile source is proven.",
    ],
    interpretation:
      "This narrows the missing runtime chain from generic LevelVisuals loading to the specific upstream descriptor/payload key and object-builder path that triggers registered callback 0xc79ad4, and adds opcode-backed LevelVisuals apply-processor field routing for offsets +0x8/+0x10/+0x18/+0x20/+0x28/+0x30/+0x38/+0x40/+0x50/+0x58. The current binary proves the owner layout, module registration, callback registration, descriptor/payload resolution, callback dispatch mechanics, active-Level argument forwarding, typed-object construction, payload word0 -> object-builder B resource-key-id storage, typed-object dispatcher input sources fully classified as framed stream-buffer and timed/.vgr queue, type 0x046f runtime resource-key switching, type 0x03e9 inline runtime-key writing, current key owner global lifecycle at 0x3034cf8, child index 0x3034d10, secondary index 0x2d44e78, current owner state/position record registration at 0x8badcc -> 0x8cfb7c with global index 0x3035264, the guarded lazy copy into the same index slot at 0x79f3a0, and slot 4 update callback 0x8cfbec, a current owner active-state/position bridge that queries Level setup index 0x2d44e98, a HUD_Minimap consumer that reads 0x3035264 and attaches through 0x8cff24 but is classified as HUD/minimap negative evidence, a 0x2b0f0b0 player-lock/HUD index path that explains more resolved-key/index-query noise but is also negative evidence, and additional 0x3034d00 owner-resolve index consumers that have no strict local Profile/Probe branch. It also proves the resolved-key object request owner registration, resolved-key object-request path through 0x188e338 and Level setup index query 0x188e540, matched-object context +0x140/+0x148 processing, context list/object lookup and entry apply mechanics under 0xca3bd0/0xca3564, a non-stream character-lobby key-switch candidate, and owner +0x30 state, but it still does not prove which Level/Profile the hero/model preview chooses.",
  };
}

function exportCurrentNativeLevelRuntimeOwnerAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildManifest({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "category",
    "sourceAddress",
    "relationship",
    "targetAddress",
    "detail",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLevelRuntimeOwnerAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildManifest,
  exportCurrentNativeLevelRuntimeOwnerAudit,
};
