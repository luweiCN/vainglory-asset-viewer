#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64, scanTextReferences } = require("./current_native_anchor_audit");
const { findDirectBranchCallers, findU64References } = require("./current_native_light_probe_chain_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-position-sampler-owner-audit.json";
const defaultJsonOut = "extracted/reports/current_native_position_sampler_owner_audit.json";
const defaultTsvOut = "extracted/reports/current_native_position_sampler_owner_audit.tsv";

const addresses = {
  sceneProbePositionSampleUpload: 0xe36efc,
  queueAppend: 0x18a15c8,
  rendererInitCaller: 0xe01d28,
  sceneProbeServiceGlobalInitCall: 0xe01cdc,
  renderCommandFactoryInit: 0x1890584,
  renderCommandAOwnerConstructor: 0x1891f8c,
  renderCommandAOwnerVtableBase: 0x2ab5188,
  renderCommandAOwnerBuilderSlot: 0x2ab5198,
  renderCommandAQueuedCommandConstructor: 0x1891bfc,
  renderCommandAOwnerSetup: 0x1891a70,
  renderCommandABuilder: 0x1892120,
  renderCommandASampleUpload: 0x1891c84,
  renderCommandADraw: 0x1891ce0,
  renderCommandAQueuedCommandVtableBase: 0x2ab51d0,
  renderCommandBOwnerConstructor: 0x1893628,
  renderCommandBOwnerVtableBase: 0x2ab5230,
  renderCommandBOwnerBuilderSlot: 0x2ab5240,
  renderCommandBBuilder: 0x189366c,
  renderCommandBSampleUpload: 0x18934c0,
  renderCommandBDraw: 0x189351c,
  renderCommandBQueuedCommandVtableBase: 0x2ab5278,
  globalRenderFactorySlot: 0x311ae00,
  globalRenderCommandBSlot: 0x311ae08,
  globalRenderCommandASlot: 0x311ae10,
  globalRenderCommandWorkQueueSlot: 0x311ae18,
  globalHelperRegisterActiveDispatcher: 0x1890948,
  globalHelperDispatch: 0x1890958,
  globalHelperDispatchThunk: 0x18906b0,
  globalHelperDispatchThunkTail: 0x18906c8,
  rendererDispatcherObjectConstructor: 0xe02c80,
  rendererDispatcherObjectPrimaryVtable: 0x272a990,
  rendererDispatcherObjectDispatchSlot: 0x272a9a0,
  rendererDispatcherObjectDispatch: 0xe02c94,
  resourceDispatcherThreadedBridge: 0xe28660,
  rendererContextRegistryLookup: 0xd7f00c,
  rendererContextRegistryObjectConstructor: 0xe03330,
  rendererContextRegistryObjectPrimaryVtable: 0x272a9c8,
  rendererContextRegistryRuntimeContextBuildSlot: 0x272a9d8,
  rendererContextRegistryRuntimeContextBuild: 0xe033dc,
  rendererContextRegistryRuntimeContextStore: 0xe0340c,
  rendererContextRegistryRuntimeContextAccessor: 0xe03474,
  resourceDispatcherContextConstructor: 0xe28418,
  resourceDispatcherContextPrimaryVtable: 0x272ed90,
  resourceDispatcherContextThreadedDispatchSlot: 0x272eda8,
  resourceDispatcherContextThreadedDispatch: 0xe28674,
  resourceHandlerShaderDataConstructor: 0xe02188,
  resourceHandlerShaderDataPrimaryVtable: 0x272a748,
  resourceHandlerShaderDataName: 0xe0219c,
  resourceHandlerShaderDataProcess: 0xe021a8,
  resourceHandlerTexDataConstructor: 0xe02418,
  resourceHandlerTexDataPrimaryVtable: 0x272a7e0,
  resourceHandlerTexDataName: 0xe0242c,
  resourceHandlerTexDataProcess: 0xe02438,
  resourceHandlerAnimDataConstructor: 0xe028ec,
  resourceHandlerAnimDataPrimaryVtable: 0x272a8a8,
  resourceHandlerAnimDataName: 0xe02900,
  resourceHandlerAnimDataProcess: 0xe0290c,
  resourceHandlerMeshDataConstructor: 0xe02aa8,
  resourceHandlerMeshDataPrimaryVtable: 0x272a930,
  resourceHandlerMeshDataName: 0xe02abc,
  resourceHandlerMeshDataProcess: 0xe02ac8,
  meshDataProcessorResourceObjectBuildCallsite: 0xe02bb0,
  meshDataResourceObjectBuilder: 0x18918e4,
  meshDataRuntimeObjectPrimaryVtable: 0x2ab5148,
  meshDataRuntimeObjectSetup: 0x1891a70,
  meshDataRuntimeSetupBridgeA: 0x1890e90,
  meshDataRuntimeSetupBridgeB: 0x1890e98,
  meshDataRuntimePayloadBuilder: 0x18942f8,
  renderCommandAParamRuntimeVcallSlot: 0x18922ec,
  renderCommandAParamRuntimeVcall: 0x18922f0,
  renderCommandAX4EntryMove: 0x1892144,
  renderCommandAX4ProviderPredecrementLoad: 0x1892148,
  renderCommandAX4ProviderAuxVslotLoad: 0x1892154,
  renderCommandAX4ProviderAuxVcall: 0x189215c,
  renderCommandBParamRuntimeVcallSlot: 0x1893864,
  renderCommandBParamRuntimeVcall: 0x1893868,
  renderCommandBX4EntryMove: 0x189369c,
  renderCommandBX4ProviderPredecrementLoad: 0x18936ac,
  renderCommandBX4ProviderAuxVslotLoad: 0x18936b0,
  renderCommandBX4ProviderAuxVcall: 0x18936b8,
  compositeTaskSingleConstructor: 0x18a1170,
  compositeTaskBatchConstructor: 0x18a11e4,
  compositeTaskPrimaryVtable: 0x2ab5590,
  compositeTaskDispatchSlot: 0x2ab55a8,
  compositeTaskDispatch: 0x18a13fc,
  compositeTaskListPrimaryVtable: 0x2ab5630,
  meshDataPayloadSerializerPrimaryVtable: 0x2ab52a8,
  sceneEntityEntryArrayGlobalSlot: 0x311a960,
  sceneEntityManagerConstructorCallsite: 0x188e008,
  sceneEntityManagerGlobalStore: 0x188e014,
  sceneEntityManagerDestructorLoad: 0x188e150,
  sceneEntityManagerDestructorDeleteCall: 0x188e15c,
  sceneEntityManagerDestructorClear: 0x188e168,
  sceneEntityManagerAccessor: 0x188e7e0,
  sceneEntityManagerConstructor: 0x188eeb4,
  sceneEntityManagerAddRecord: 0x188eee0,
  sceneEntityManagerRemoveRecord: 0x188ef88,
  sceneEntityManagerDispatchRecord: 0x188f020,
  sceneEntityRecordEntryOwnerBAccessor: 0x18906ec,
  sceneEntityRecordEntryOwnerAAccessor: 0x18906f8,
  sceneEntityRecordEntryListInit: 0x1890704,
  sceneEntityRecordEntryListDestroy: 0x1890710,
  sceneEntityRecordEntryListUnlink: 0x1890828,
  sceneEntityRecordEntryOwnerBLoadCallsite: 0xd7f988,
  sceneEntityRecordEntryFlagStore: 0xd7f998,
  sceneEntityRecordEntryOwnerAndCallbackStore: 0xd7f9a8,
  sceneEntityRecordEntryPrimaryVtableStore: 0xd7f9b4,
  sceneEntityRecordEntrySubVtableStore: 0xd7f9b8,
  sceneEntityRecordEntryListInitCallsite: 0xd7f9bc,
  sceneEntityRecordEntryGlobalHelperDispatchSlot: 0xd7fc64,
  sceneEntityRecordEntryGlobalHelperDispatchPayload: 0xd7fc68,
  sceneEntityRecordEntryGlobalHelperDispatchTail: 0xd7fc70,
  sceneEntityRecordEntryOwnerSwitchOwnerACall: 0xd7fc88,
  sceneEntityRecordEntryOwnerSwitchOwnerBCall: 0xd7fc90,
  sceneEntityRecordEntryOwnerSwitchStore: 0xd7fc94,
  sceneEntityRecordEntryChangeCheckCall: 0xd7fdf4,
  sceneEntityRecordEntryRecordDispatchPayloadAccess: 0xd7fe3c,
  sceneEntityRecordEntryRecordDispatchAccessorCall: 0xd7ff04,
  sceneEntityRecordEntryRecordDispatchCall: 0xd7ff14,
  sceneEntityRecordEntryTransformProviderReturn: 0xd7ff44,
  sceneEntityRecordEntryConditionalUpdatePrimary: 0xd80100,
  sceneEntityRecordEntryConditionalUpdatePrimaryBranch: 0xd80108,
  sceneEntityRecordEntryConditionalUpdateCallback: 0xd80110,
  sceneEntityRecordEntryConditionalUpdateCallbackAdjust: 0xd80118,
  sceneEntityRecordEntryConditionalUpdateCallbackBranch: 0xd8011c,
  sceneEntityRecordAddCallerAEntryPointer: 0xd7faa4,
  sceneEntityRecordAddCallerAAddRecordCall: 0xd7fab0,
  sceneEntityRecordAddCallerBEntryPointer: 0x8d3a20,
  sceneEntityRecordAddCallerBAddRecordCall: 0x8d3a2c,
  sceneEntityRecordEntryLayoutBRegisterWrapperTail: 0x8d3118,
  sceneEntityRecordEntryLayoutBRegister: 0x8d398c,
  sceneEntityRecordEntryLayoutBTransformStore0: 0x8d3a08,
  sceneEntityRecordEntryLayoutBTransformStore1: 0x8d3a0c,
  sceneEntityRecordEntryLayoutBTransformStore2: 0x8d3a10,
  sceneEntityRecordEntryLayoutBPayloadPointerStore: 0x8d3a14,
  sceneEntityRecordEntryLayoutBFlagsStore: 0x8d3a18,
  sceneEntityRecordEntryLayoutBManagerAccessorCall: 0x8d3a1c,
  sceneEntityRecordEntryLayoutBRecordIndexStore: 0x8d3a30,
  sceneEntityRecordEntryLayoutBFollowupCallsite: 0x8d3188,
  sceneEntityRecordEntryLayoutBFollowup: 0x8d3a80,
  sceneEntityRecordEntryLayoutBFollowupBitfieldLoad: 0x8d3aa8,
  sceneEntityRecordEntryLayoutBParamTargetLoadA: 0x8d3ad4,
  sceneEntityRecordEntryLayoutBParamWriteCallA: 0x8d3ae0,
  sceneEntityRecordEntryLayoutBParamWriteCallB: 0x8d3b40,
  sceneEntityRecordEntryLayoutBParamWriteCallC: 0x8d3b68,
  sceneEntityRecordEntryLayoutBParamWriteCallD: 0x8d3b90,
  sceneEntityRecordEntryLayoutBParamWriteCallE: 0x8d3bd0,
  sceneEntityRecordEntryLayoutBParamWriteCallF: 0x8d3bf8,
  sceneEntityRecordEntryLayoutBStateDispatchCallsite: 0x8d3198,
  sceneEntityRecordEntryLayoutBStateDispatch: 0x8d3c24,
  sceneEntityRecordEntryLayoutBStateModeLoad: 0x8d3c58,
  sceneEntityRecordEntryLayoutBStateObjectLoad: 0x8d3c60,
  sceneEntityRecordEntryLayoutBStateVersionLoad: 0x8d3c68,
  sceneEntityRecordEntryLayoutBStateVersionCompare: 0x8d3c70,
  sceneEntityRecordEntryLayoutBStateStaleClear: 0x8d3ccc,
  sceneEntityRecordEntryLayoutBStateMode3ApplyCall: 0x8d3d60,
  sceneEntityRecordEntryLayoutBStateMode2ConvertCall: 0x8d3d88,
  sceneEntityRecordEntryLayoutBStateMode1ConvertCall: 0x8d3dac,
  sceneEntityRecordEntryLayoutBTransformApplyCallA: 0x8d3db8,
  sceneEntityRecordEntryLayoutBTransformApplyCallB: 0x8d40f4,
  sceneEntityRecordEntryLayoutBFlaggedAngleUpdateCall: 0x8d3dd4,
  sceneEntityRecordEntryLayoutBMatrixComposeCallA: 0x8d40d8,
  sceneEntityRecordEntryLayoutBMatrixComposeCallB: 0x8d40e8,
  sceneEntityRecordEntryLayoutBOptionalVisibilityCall: 0x8d4108,
  sceneEntityRecordEntryLayoutBFinalManagerAccessorCall: 0x8d410c,
  sceneEntityRecordEntryLayoutBParamPayloadTargetLoad: 0x8d4110,
  sceneEntityRecordEntryLayoutBRecordIndexLoad: 0x8d4114,
  sceneEntityRecordEntryLayoutBParamPayloadBuildCall: 0x8d4120,
  sceneEntityRecordEntryLayoutBFinalDispatchCall: 0x8d4134,
  sceneEntityRecordEntryLayoutBTransformApply: 0x8d45d4,
  sceneEntityRecordEntryLayoutBStateMode3Apply: 0x8d49a8,
  sceneEntityRecordEntryLayoutBFlaggedAngleUpdate: 0x8d4a8c,
  sceneEntityRecordEntryLayoutBOptionalVisibilityUpdate: 0x8d4c94,
  runtimeParamPayloadBuilder: 0xe3a510,
  runtimeMaterialParamWriter: 0xe39830,
  sceneEntityRecordEntryPrimaryVtableBase: 0x27266c0,
  sceneEntityRecordEntrySubVtableBase: 0x2726710,
  sceneEntityRecordEntryCallbackTableBase: 0x2726740,
  sceneEntityRuntimeParamAccessor: 0x189d63c,
  sceneEntityRuntimeParamGlobalBase: 0x311af50,
  sceneEntityRuntimeParamInitBaseAdd: 0x189d460,
  sceneEntityRuntimeParamInitSlotPairStore: 0x189d468,
  sceneEntityRuntimeParamInitSlot2Store: 0x189d484,
  sceneEntityRuntimeParamInitSlot3Store: 0x189d51c,
  sceneEntityRuntimeParamInitSlot4Store: 0x189d534,
  sceneEntityRuntimeParamDestroySlot4Load: 0x189d558,
  sceneEntityRuntimeParamDestroySlot3Load: 0x189d574,
  sceneEntityRuntimeParamDestroySlot2Load: 0x189d590,
  sceneEntityRuntimeParamDestroyBaseAdd: 0x189d5b0,
  sceneEntityRuntimeParamDestroyArrayLoad: 0x189d5b4,
  sceneEntityRuntimeParamSlot0Constructor: 0x189f7ec,
  sceneEntityRuntimeParamSlot0VtableBase: 0x2ab54a0,
  sceneEntityRuntimeParamSlot0VtableWrite: 0x189f818,
  sceneEntityRuntimeParamSlot0RenderObjectBuild: 0x189f850,
  sceneEntityRuntimeParamSlot0RenderObjectConstructor: 0x189f8f8,
  sceneEntityRuntimeParamSlot0CallbackDispatch: 0x189f984,
  sceneEntityRuntimeParamReturnedObjectVtableBase: 0x2ab54f8,
  sceneEntityRuntimeParamReturnedObjectVtableWrite: 0x189f914,
  renderOwnerSourceMappingLookup: 0x1891818,
  renderOwnerSourceMappingCountLoad: 0x1891818,
  renderOwnerSourceMappingEntryArrayLoad: 0x1891820,
  renderOwnerSourceMappingEntryPointerLoad: 0x1891828,
  renderOwnerSourceMappingEntryCompare: 0x189182c,
  renderOwnerSourceMappingSourceArrayLoad: 0x1891848,
  renderOwnerSourceMappingSourceReturnLoad: 0x189184c,
  renderOwnerSourceMappingBuild: 0x18916c8,
  renderOwnerSourceMappingBuildEntrySourceLoad: 0x18916f4,
  renderOwnerSourceMappingSmallObjectAlloc: 0x1891710,
  renderOwnerSourceMappingSmallObjectClear: 0x1891718,
  renderOwnerSourceMappingSmallObjectSourceStoreCall: 0x1891730,
  renderOwnerSourceMappingSmallObjectEntryStore: 0x1891740,
  renderOwnerSourceMappingSourceArrayAppend: 0x1891744,
  renderOwnerSourceMappingEntryArrayAppend: 0x1891750,
  renderOwnerSourceMappingNextEntryLoad: 0x1891758,
  renderOwnerSourceMappingSourceVectorAppendHelper: 0xe3c52c,
  renderOwnerSourceMappingSourceVectorCountLoad: 0xe3c58c,
  renderOwnerSourceMappingSourceVectorCountIncrement: 0xe3c590,
  renderOwnerSourceMappingSourceVectorCountStore: 0xe3c594,
  renderOwnerSourceMappingSourceVectorArrayLoad: 0xe3c598,
  renderOwnerSourceMappingSourceVectorPayloadLoad: 0xe3c59c,
  renderOwnerSourceMappingSourceVectorSlotAddress: 0xe3c5a0,
  renderOwnerSourceMappingSourceVectorPayloadStore: 0xe3c5a4,
  renderOwnerSourceMappingEntryVectorAppendHelper: 0x1891790,
  renderOwnerSourceMappingEntryVectorCountLoad: 0x18917f0,
  renderOwnerSourceMappingEntryVectorCountIncrement: 0x18917f4,
  renderOwnerSourceMappingEntryVectorCountStore: 0x18917f8,
  renderOwnerSourceMappingEntryVectorArrayLoad: 0x18917fc,
  renderOwnerSourceMappingEntryVectorPayloadLoad: 0x1891800,
  renderOwnerSourceMappingEntryVectorSlotAddress: 0x1891804,
  renderOwnerSourceMappingEntryVectorPayloadStore: 0x1891808,
  renderOwnerSourceMappingCurrentEntrySourceHolderLoad: 0x1891728,
  renderOwnerSourceMappingCurrentEntrySourcePointerLoad: 0x189172c,
  sourceProgramTableEntryWriter: 0x189bcf8,
  sourceProgramTableEntryWriterTail: 0x189bde4,
  sourceProgramTableCloneFinalize: 0x189be5c,
  sceneEntitySourceTableMountWrapper: 0xd8003c,
  sceneEntitySourceTableMountTail: 0xd80040,
  sceneEntitySourceTableMountCloneCallA: 0x8cab08,
  sceneEntitySourceTableMountCallA: 0x8cab14,
  sceneEntitySourceTableMountCloneCallB: 0xbacad8,
  sceneEntitySourceTableMountCallB: 0xbacae8,
  dynamicSourceProgramTableProducer: 0xbac9d4,
  dynamicSourceProgramTableTempInitCall: 0xbaca0c,
  dynamicSourceProgramTableListHeadLoad: 0xbaca10,
  dynamicSourceProgramTableSourceListLoad: 0xbaca28,
  dynamicSourceProgramTableNestedHeadLoad: 0xbaca2c,
  dynamicSourceProgramTableResourceIdLoad: 0xbaca3c,
  dynamicSourceProgramTableResourceIdScratchStore: 0xbaca40,
  dynamicSourceProgramTableNestedNextLoad: 0xbaca44,
  dynamicSourceProgramTableResourceCountMask: 0xbaca50,
  dynamicSourceProgramTableResourceCountMaxCheck: 0xbaca58,
  dynamicSourceProgramTableMode1: 0xbaca6c,
  dynamicSourceProgramTableMode3: 0xbaca80,
  dynamicSourceProgramTableMode4: 0xbaca94,
  dynamicSourceProgramTableMode2: 0xbacaa8,
  dynamicSourceProgramTableEntryWriterCall: 0xbacac0,
  dynamicSourceProgramTableNextListLoad: 0xbacac4,
  dynamicSourceProgramTableCloneCall: 0xbacad8,
  dynamicSourceProgramTableDestinationStore: 0xbacae0,
  dynamicSourceProgramTableMountCall: 0xbacae8,
  dynamicSourceProgramTableDirectCallerSceneObjectLoadA: 0x8abfa0,
  dynamicSourceProgramTableDirectCallerResourceListLoadA: 0x8abfa4,
  dynamicSourceProgramTableDirectCallerSceneObjectLoadB: 0x8abfc0,
  dynamicSourceProgramTableDirectCallerResourceListLoadB: 0x8abfc4,
  dynamicSourceProgramTableDirectCallerDestination: 0x8abfc8,
  dynamicSourceProgramTableDirectCallerCall: 0x8abfcc,
  dynamicSourceProgramTableSelectorListLoad: 0x8d551c,
  dynamicSourceProgramTableSelectorArgPreserve: 0x8d5520,
  dynamicSourceProgramTableSelectorNodePayloadLoad: 0x8d5530,
  dynamicSourceProgramTableSelectorNodeClassLoad: 0x8d5534,
  dynamicSourceProgramTableSelectorNextNodeLoad: 0x8d5540,
  dynamicSourceProgramTableSelectorDestination: 0x8d5548,
  dynamicSourceProgramTableSelectorSelectedNodeMove: 0x8d554c,
  dynamicSourceProgramTableSelectorTailCall: 0x8d5550,
  dynamicSourceProgramTableUpstreamFunction: 0x8abe6c,
  dynamicSourceProgramTableUpstreamArgResourceMove: 0x8abea8,
  dynamicSourceProgramTableUpstreamOwnerStore: 0x8abeb8,
  dynamicSourceProgramTableUpstreamDefaultArrayLoad: 0x8abebc,
  dynamicSourceProgramTableUpstreamDefaultNodeLoad: 0x8abecc,
  dynamicSourceProgramTableUpstreamPrimarySlotLoad: 0x8abed0,
  dynamicSourceProgramTableUpstreamPrimaryValidateCall: 0x8abedc,
  dynamicSourceProgramTableUpstreamPrimaryCandidateMove: 0x8abee0,
  dynamicSourceProgramTableUpstreamPrimaryFallback: 0x8abee8,
  dynamicSourceProgramTableUpstreamSecondarySlotLoad: 0x8abeec,
  dynamicSourceProgramTableUpstreamSecondaryValidateCall: 0x8abef4,
  dynamicSourceProgramTableUpstreamSecondaryFallback: 0x8abefc,
  dynamicSourceProgramTableUpstreamPrimaryResourceLoad: 0x8abf00,
  dynamicSourceProgramTableUpstreamPrimaryResourceValidateCall: 0x8abf04,
  dynamicSourceProgramTableUpstreamSecondaryResourceLoad: 0x8abf0c,
  dynamicSourceProgramTableUpstreamSecondaryResourceValidateCall: 0x8abf10,
  dynamicSourceProgramTableUpstreamNoResourceExit: 0x8abf14,
  dynamicSourceProgramTableUpstreamSceneObjectCreateCall: 0x8abf24,
  dynamicSourceProgramTableUpstreamSceneObjectStore: 0x8abf28,
  dynamicSourceProgramTableUpstreamPrimaryAttachResourceLoad: 0x8abf78,
  dynamicSourceProgramTableUpstreamPrimaryAttachCall: 0x8abf84,
  dynamicSourceProgramTableUpstreamSecondaryAttachResourceLoad: 0x8abfb0,
  dynamicSourceProgramTableUpstreamSecondaryAttachCall: 0x8abfbc,
  dynamicSourceProgramTableUpstreamTypeByteLoad: 0x8abfd4,
  dynamicSourceProgramTableUpstreamTypeByteStore: 0x8abfe0,
  dynamicSourceProgramTableUpstreamTransformUpdateCall: 0x8ac00c,
  dynamicSourceProgramTableSelectorCallerFunction: 0x8cca64,
  dynamicSourceProgramTableSelectorCallerConfigLoad: 0x8ccaa4,
  dynamicSourceProgramTableSelectorCallerConfigValidateCall: 0x8ccaac,
  dynamicSourceProgramTableSelectorCallerValidBranch: 0x8ccab0,
  dynamicSourceProgramTableSelectorCallerParentIndexLoad: 0x8ccab8,
  dynamicSourceProgramTableSelectorCallerParentCreateCall: 0x8ccac0,
  dynamicSourceProgramTableSelectorCallerChildIndexLoad: 0x8ccac8,
  dynamicSourceProgramTableSelectorCallerChildCreateCall: 0x8ccad0,
  dynamicSourceProgramTableSelectorCallerChildAttachPayloadLoad: 0x8ccad8,
  dynamicSourceProgramTableSelectorCallerChildAttachCall: 0x8ccae4,
  dynamicSourceProgramTableSelectorCallerSelectorArgLoad: 0x8ccae8,
  dynamicSourceProgramTableSelectorCallerSelectorObjectMove: 0x8ccaec,
  dynamicSourceProgramTableSelectorCallerSelectorCall: 0x8ccaf0,
  dynamicSourceProgramTableSelectorCallerPostIndexLoad: 0x8ccaf8,
  dynamicSourceProgramTableSelectorCallerPostChildCreateCall: 0x8ccb00,
  dynamicSourceProgramTableSelectorCallerPostConfigLoad: 0x8ccb04,
  dynamicSourceProgramTableSelectorCallerPostListArg: 0x8ccb08,
  dynamicSourceProgramTableSelectorCallerPostApplyCall: 0x8ccb0c,
  dynamicSourceProgramTableSelectorChildLazyInitFunction: 0x79e688,
  dynamicSourceProgramTableSelectorChildLazyInitFlagLoad: 0x79e68c,
  dynamicSourceProgramTableSelectorChildLazyInitTypeRecordLoad: 0x79e698,
  dynamicSourceProgramTableSelectorChildLazyInitFlagStore: 0x79e6a4,
  dynamicSourceProgramTableSelectorChildLazyInitGlobalStore: 0x79e6ac,
  dynamicSourceProgramTablePostChildLazyInitFunction: 0x79e6b4,
  dynamicSourceProgramTablePostChildLazyInitFlagLoad: 0x79e6b8,
  dynamicSourceProgramTablePostChildLazyInitTypeRecordLoad: 0x79e6c4,
  dynamicSourceProgramTablePostChildLazyInitFlagStore: 0x79e6d0,
  dynamicSourceProgramTablePostChildLazyInitGlobalStore: 0x79e6d8,
  dynamicSourceProgramTableParentLazyInitFunction: 0x79f268,
  dynamicSourceProgramTableParentLazyInitFlagLoad: 0x79f26c,
  dynamicSourceProgramTableParentLazyInitTypeRecordLoad: 0x79f278,
  dynamicSourceProgramTableParentLazyInitFlagStore: 0x79f284,
  dynamicSourceProgramTableParentLazyInitGlobalStore: 0x79f28c,
  dynamicSourceProgramTablePostChildTypeRegister: 0x8b4154,
  dynamicSourceProgramTablePostChildTypeRecordCountLoad: 0x8b415c,
  dynamicSourceProgramTablePostChildTypeCallbackPairStore: 0x8b4180,
  dynamicSourceProgramTablePostChildTypeFlagLiteral: 0x8b4188,
  dynamicSourceProgramTablePostChildTypeSizeLiteral: 0x8b4190,
  dynamicSourceProgramTablePostChildTypeRecordStore: 0x8b41b4,
  dynamicSourceProgramTablePostChildTypeGlobalStore: 0x8b41bc,
  dynamicSourceProgramTablePostChildSetupFunction: 0x8b4790,
  dynamicSourceProgramTablePostChildSetupInitVslotLoad: 0x8b47c0,
  dynamicSourceProgramTablePostChildSetupInitVcall: 0x8b47c4,
  dynamicSourceProgramTablePostChildSetupPayloadCloneCall: 0x8b47cc,
  dynamicSourceProgramTablePostChildSetupPayloadStoreA: 0x8b47d0,
  dynamicSourceProgramTablePostChildSetupPayloadStoreB: 0x8b47d4,
  dynamicSourceProgramTablePostChildSetupPrimaryTransformCall: 0x8b47ec,
  dynamicSourceProgramTableParentTypeRegister: 0x8d5434,
  dynamicSourceProgramTableParentTypeRecordCountLoad: 0x8d543c,
  dynamicSourceProgramTableParentTypeCallbackPairStore: 0x8d5460,
  dynamicSourceProgramTableParentTypeRecordStore: 0x8d546c,
  dynamicSourceProgramTableParentTypeGlobalStore: 0x8d548c,
  dynamicSourceProgramTableSelectorChildTypeRegister: 0xd7fc20,
  dynamicSourceProgramTableSelectorChildTypeCallbackPairStore: 0xd7fc30,
  dynamicSourceProgramTableSelectorChildTypeSizeLiteral: 0xd7fc38,
  dynamicSourceProgramTableSelectorChildTypeRecordStore: 0xd7fc3c,
  dynamicSourceProgramTableSelectorChildTypeGlobalStore: 0xd7fc5c,
  sceneEntityLayoutBSourceTableMountState0SourceLoad: 0x8d2ca4,
  sceneEntityLayoutBSourceTableMountState0Call: 0x8d2ca8,
  sceneEntityLayoutBSourceTableMountState1SourceLoad: 0x8d2ce8,
  sceneEntityLayoutBSourceTableMountState1Call: 0x8d2cec,
  sceneEntityLayoutBSourceTableMountState2SourceLoad: 0x8dae90,
  sceneEntityLayoutBSourceTableMountState2Call: 0x8dae94,
  sceneEntityRuntimeParamReturnedObjectSourceTableLoad: 0x189f91c,
  sceneEntityRuntimeParamReturnedObjectSourceTableIndexedAddress: 0x189f92c,
  sceneEntityRuntimeParamReturnedObjectSourceEntryLoad: 0x189f930,
  sceneEntityRuntimeParamReturnedObjectFlagLoad: 0x189f940,
  sceneEntityRuntimeParamReturnedObjectPointerLowBits: 0x189f944,
  sceneEntityRuntimeParamReturnedObjectModeNibble: 0x189f948,
  sceneEntityRuntimeParamReturnedObjectModeInsert: 0x189f950,
  sceneEntityRuntimeParamReturnedObjectFlagShift: 0x189f954,
  sceneEntityRuntimeParamReturnedObjectFlagTest: 0x189f958,
  sceneEntityRuntimeParamReturnedObjectFlagInsert: 0x189f95c,
  sceneEntityRuntimeParamReturnedObjectCategoryBitSelect: 0x189f960,
  sceneEntityRuntimeParamReturnedObjectSortKeyOr: 0x189f964,
  sceneEntityRuntimeParamReturnedObjectSortKeyToggle: 0x189f968,
  sceneEntityRuntimeParamReturnedObjectSortKeyStore: 0x189f96c,
  sceneEntityRuntimeParamReturnedObjectValueAccessor: 0x189fa40,
  sceneEntityRuntimeParamReturnedObjectProgramApply: 0x189f990,
  sceneEntityRuntimeParamReturnedObjectProgramApplySourceObjectLoad: 0x189f9a0,
  sceneEntityRuntimeParamReturnedObjectProgramApplySourceIndexLoad: 0x189f9a4,
  sceneEntityRuntimeParamReturnedObjectProgramApplySourceTableLoad: 0x189f9ac,
  sceneEntityRuntimeParamReturnedObjectProgramApplySourceEntryLoad: 0x189f9b4,
  sceneEntityRuntimeParamReturnedObjectProgramPointerLoad: 0x189f9c8,
  sceneEntityRuntimeParamReturnedObjectProgramIdLoad: 0x189f9e0,
  sceneEntityRuntimeParamReturnedObjectGlUseProgramCall: 0x189f9e4,
  sceneEntityRuntimeParamReturnedObjectProgramParamLoad: 0x189f9e8,
  sceneEntityRuntimeParamReturnedObjectProgramParamFallbackLoad: 0x189f9ec,
  sceneEntityRuntimeParamReturnedObjectProgramParamApplyCall: 0x189fa00,
  renderCommandAParamRuntimeResultVslotLoad: 0x189234c,
  renderCommandAParamRuntimeResultVcall: 0x1892350,
  renderCommandAParamRuntimeResultStore: 0x1892354,
  renderCommandBParamRuntimeResultVslotLoad: 0x18938c8,
  renderCommandBParamRuntimeResultVcall: 0x18938cc,
  renderCommandBParamRuntimeResultStore: 0x18938d4,
  renderCommandQueueSortAndReappend: 0x18a1698,
  renderCommandQueueSortCountLoad: 0x18a16c0,
  renderCommandQueueSortHeadLoad: 0x18a16d8,
  renderCommandQueueSortKeyLoad: 0x18a16e4,
  renderCommandQueueSortPairStore: 0x18a16e8,
  renderCommandQueueSortNextLoad: 0x18a16ec,
  renderCommandQueueSortCall: 0x18a1700,
  renderCommandQueueSortReappendCall: 0x18a1718,
  renderCommandQueueSortPartition: 0x18a1750,
  renderCommandQueueSortPivotKeyLoad: 0x18a1798,
  renderCommandQueueSortLeftKeyLoad: 0x18a17b0,
  renderCommandQueueSortLeftKeyCompare: 0x18a17b8,
  renderCommandQueueSortRightKeyLoad: 0x18a17c4,
  renderCommandQueueSortRightKeyCompare: 0x18a17cc,
  drawAllSceneEntitiesRuntimeParamIndexZero: 0x820f20,
  drawAllSceneEntitiesRuntimeParamAccessorCall: 0x820f24,
  drawAllSceneEntitiesRuntimeParamStoreTemp: 0x820f2c,
  drawAllSceneEntitiesRuntimeParamArg: 0x820f6c,
  drawAllParticleEffectsRuntimeParamIndexZero: 0x820fe4,
  drawAllParticleEffectsRuntimeParamAccessorCall: 0x820fe8,
  drawAllParticleEffectsRuntimeParamStoreTemp: 0x820ff0,
  drawAllParticleEffectsRuntimeParamArg: 0x82102c,
  sceneEntityEntryArrayForwarder: 0x188e784,
  sceneEntityEntryArrayForwarderAlt: 0x188e7a4,
  sceneEntityEntryArrayBuilder: 0x188f03c,
  sceneEntityEntryArrayBuilderAlt: 0x188f144,
  meshDataResourceName: 0x1af8d04,
  shaderDataResourceName: 0x1af8ce8,
  texDataResourceName: 0x1af8cf3,
  animDataResourceName: 0x1af8cfb,
};

const instructionEvidence = [
  {
    address: 0xe01d28,
    role: "renderer-init-render-command-factory-call",
    expectedOpcodeHex: "942a3a17",
    evidence: "renderer/global initialization calls 0x1890584 after the scene/probe service global init path",
  },
  {
    address: 0x18905cc,
    role: "global-render-command-b-owner-constructor-call",
    expectedOpcodeHex: "94000c17",
    evidence: "constructs the render command B owner during the global renderer factory init path",
  },
  {
    address: 0x18905d8,
    role: "global-render-command-b-owner-store",
    expectedOpcodeHex: "f9070513",
    evidence: "stores the constructed render command B owner into global slot 0x311ae08",
  },
  {
    address: 0x18905f0,
    role: "global-render-command-a-owner-constructor-call",
    expectedOpcodeHex: "94000667",
    evidence: "constructs the render command A owner during the global renderer factory init path",
  },
  {
    address: 0x18905f8,
    role: "global-render-command-a-owner-store",
    expectedOpcodeHex: "f9070a93",
    evidence: "stores the constructed render command A owner into global slot 0x311ae10",
  },
  {
    address: 0x1891fc8,
    role: "render-command-a-owner-vtable-write",
    expectedOpcodeHex: "f90002c8",
    evidence: "writes owner vtable 0x2ab5188 to the render command A owner; builder is owner vtable +0x10",
  },
  {
    address: 0x1893654,
    role: "render-command-b-owner-vtable-write",
    expectedOpcodeHex: "f90002a8",
    evidence: "writes owner vtable 0x2ab5230 to the render command B owner; builder is owner vtable +0x10",
  },
  {
    address: 0x1891ca4,
    role: "render-command-a-sample-position-xz-load",
    expectedOpcodeHex: "f9402808",
    evidence: "loads x8 from render command A object +0x50 before packing the position for 0xe36efc",
  },
  {
    address: 0x1891cac,
    role: "render-command-a-sample-position-y-or-z-load",
    expectedOpcodeHex: "b9405808",
    evidence: "loads w8 from render command A object +0x58 before packing the position for 0xe36efc",
  },
  {
    address: 0x1891cb8,
    role: "render-command-a-position-sample-upload-call",
    expectedOpcodeHex: "97d69491",
    evidence: "calls current scene-probe position sample/upload entry 0xe36efc",
  },
  {
    address: 0x18934e0,
    role: "render-command-b-sample-position-xz-load",
    expectedOpcodeHex: "f9402808",
    evidence: "loads x8 from render command B object +0x50 before packing the position for 0xe36efc",
  },
  {
    address: 0x18934e8,
    role: "render-command-b-sample-position-y-or-z-load",
    expectedOpcodeHex: "b9405808",
    evidence: "loads w8 from render command B object +0x58 before packing the position for 0xe36efc",
  },
  {
    address: 0x18934f4,
    role: "render-command-b-position-sample-upload-call",
    expectedOpcodeHex: "97d68e82",
    evidence: "calls current scene-probe position sample/upload entry 0xe36efc",
  },
  {
    address: 0x189216c,
    role: "render-command-a-transform-provider-vcall-slot",
    expectedOpcodeHex: "f9400d08",
    evidence: "loads virtual slot +0x18 from the x4-derived transform provider",
  },
  {
    address: 0x1892170,
    role: "render-command-a-transform-provider-vcall",
    expectedOpcodeHex: "d63f0100",
    evidence: "calls the transform provider virtual +0x18; return value becomes x22",
  },
  {
    address: 0x1892358,
    role: "render-command-a-vtable-write",
    expectedOpcodeHex: "f9000277",
    evidence: "writes render command A vtable 0x2ab51d0 to the queued command object",
  },
  {
    address: 0x1892368,
    role: "render-command-a-position-column-copy",
    expectedOpcodeHex: "3d801660",
    evidence: "copies q0 from transform source +0x30 into command +0x50, the field later sampled by 0xe36efc",
  },
  {
    address: 0x18923a0,
    role: "render-command-a-queue-append-call",
    expectedOpcodeHex: "94003c8a",
    evidence: "appends the populated command object to the render queue through 0x18a15c8",
  },
  {
    address: 0x18936c8,
    role: "render-command-b-transform-provider-vcall-slot",
    expectedOpcodeHex: "f9400d08",
    evidence: "loads virtual slot +0x18 from the x4-derived transform provider",
  },
  {
    address: 0x18936cc,
    role: "render-command-b-transform-provider-vcall",
    expectedOpcodeHex: "d63f0100",
    evidence: "calls the transform provider virtual +0x18; return value becomes x22",
  },
  {
    address: 0x18938dc,
    role: "render-command-b-vtable-write",
    expectedOpcodeHex: "f9000388",
    evidence: "writes render command B vtable 0x2ab5278 to the queued command object",
  },
  {
    address: 0x18938e8,
    role: "render-command-b-position-column-copy",
    expectedOpcodeHex: "3d801780",
    evidence: "copies q0 from transform source +0x30 into command +0x50, the field later sampled by 0xe36efc",
  },
  {
    address: 0x189390c,
    role: "render-command-b-queue-append-call",
    expectedOpcodeHex: "9400372f",
    evidence: "appends the populated command object to the render queue through 0x18a15c8",
  },
  {
    address: 0x18905cc,
    role: "global-render-command-b-constructor-call",
    expectedOpcodeHex: "94000c17",
    evidence: "constructs the render command B owner during a global factory/init path",
  },
  {
    address: 0x18905d8,
    role: "global-render-command-b-store",
    expectedOpcodeHex: "f9070513",
    evidence: "stores the constructed render command B owner into global slot 0x311ae08",
  },
  {
    address: 0x18905f8,
    role: "global-render-command-a-store",
    expectedOpcodeHex: "f9070a93",
    evidence: "stores the constructed render command A owner into global slot 0x311ae10",
  },
  {
    address: 0xe01efc,
    role: "global-helper-active-dispatcher-register-call",
    expectedOpcodeHex: "942a3a93",
    evidence:
      "renderer subsystem initialization registers the e02c80 dispatcher object into the global helper through 0x1890948",
  },
  {
    address: 0x1890948,
    role: "global-helper-active-dispatcher-store",
    expectedOpcodeHex: "f9001001",
    evidence: "stores the active dispatcher object pointer into global helper +0x20",
  },
  {
    address: 0x18906c8,
    role: "global-helper-dispatch-thunk-tailcall",
    expectedOpcodeHex: "140000a4",
    evidence:
      "tail-calls 0x1890958 after loading the global helper, preserving the model/resource arguments for runtime dispatch",
  },
  {
    address: 0xe02c8c,
    role: "renderer-dispatcher-object-constructor-store",
    expectedOpcodeHex: "a9000808",
    evidence: "constructs the e02c80 dispatcher object with primary vtable 0x272a990 and renderer context pointer at +0x8",
  },
  {
    address: 0xe02c94,
    role: "renderer-dispatcher-context-load",
    expectedOpcodeHex: "f9400400",
    evidence: "loads the renderer/resource context from the e02c80 dispatcher object +0x8 before forwarding",
  },
  {
    address: 0xe02cb0,
    role: "renderer-dispatcher-threaded-bridge-tailcall",
    expectedOpcodeHex: "1400966c",
    evidence:
      "the e02c80 vtable +0x10 implementation tail-calls 0xe28660 with the resource/model arguments",
  },
  {
    address: 0xe28660,
    role: "resource-dispatcher-context-vtable-load",
    expectedOpcodeHex: "f9400008",
    evidence: "0xe28660 begins by loading the renderer/resource context vtable from x0",
  },
  {
    address: 0xe2866c,
    role: "resource-dispatcher-context-vslot-18-load",
    expectedOpcodeHex: "f9400d06",
    evidence: "0xe28660 loads the context vtable +0x18 slot before branching into the unresolved runtime dispatcher",
  },
  {
    address: 0xe28670,
    role: "resource-dispatcher-context-vslot-18-branch",
    expectedOpcodeHex: "d61f00c0",
    evidence:
      "0xe28660 branches through the context vtable +0x18 slot; the current context vtable evidence resolves this slot to 0xe28674",
  },
  {
    address: 0xe01e3c,
    role: "renderer-context-registry-key-one-lookup",
    expectedOpcodeHex: "97fdf474",
    evidence: "renderer subsystem init calls d7f00c(1) to fetch the key=1 registry object before constructing e02c80",
  },
  {
    address: 0xe01e44,
    role: "renderer-context-registry-key-one-accessor-call",
    expectedOpcodeHex: "9400058c",
    evidence:
      "immediately calls e03474 on the key=1 registry object; the returned object is passed as the renderer/resource context to e02c80",
  },
  {
    address: 0xe03354,
    role: "renderer-context-registry-object-key-one-init",
    expectedOpcodeHex: "97fdef41",
    evidence: "key=1 registry object constructor calls d7f058 with w1=1",
  },
  {
    address: 0xe0336c,
    role: "renderer-context-registry-object-vtable-write",
    expectedOpcodeHex: "f9000288",
    evidence: "key=1 registry object writes primary vtable 0x272a9c8",
  },
  {
    address: 0xe03374,
    role: "renderer-context-registry-object-register",
    expectedOpcodeHex: "97fdef11",
    evidence: "key=1 registry object is registered into the d7f00c registry through d7efb8",
  },
  {
    address: 0xe03408,
    role: "renderer-resource-context-constructor-call",
    expectedOpcodeHex: "94009404",
    evidence:
      "key=1 registry runtime-context builder allocates a 0x20 object and calls e28418 to construct the renderer/resource context",
  },
  {
    address: 0xe0340c,
    role: "renderer-context-registry-runtime-context-store",
    expectedOpcodeHex: "f9000e74",
    evidence: "stores the e28418 renderer/resource context object into key=1 registry object +0x18",
  },
  {
    address: 0xe03474,
    role: "renderer-context-registry-runtime-context-accessor",
    expectedOpcodeHex: "f9400c00",
    evidence: "returns key=1 registry object +0x18, the context pointer later stored in e02c80 object +0x8",
  },
  {
    address: 0xe28438,
    role: "resource-dispatcher-context-vtable-write",
    expectedOpcodeHex: "f9000008",
    evidence: "e28418 writes primary vtable 0x272ed90 to the renderer/resource context object",
  },
  {
    address: 0xe28450,
    role: "resource-dispatcher-context-backing-store",
    expectedOpcodeHex: "f9000e74",
    evidence: "e28418 stores the large e2908c backing runtime state at context object +0x18",
  },
  {
    address: 0xe286a0,
    role: "resource-dispatcher-handler-lookup",
    expectedOpcodeHex: "9400001d",
    evidence: "e28674 looks up a resource handler by the resource name passed in x1, such as meshData",
  },
  {
    address: 0xe286c0,
    role: "resource-dispatcher-request-payload-store",
    expectedOpcodeHex: "940000b0",
    evidence: "e28674 writes handler and payload arguments into the request object before queue/execute dispatch",
  },
  {
    address: 0xe286ec,
    role: "resource-dispatcher-threaded-queue-path",
    expectedOpcodeHex: "940002ef",
    evidence: "e28674 queues through e292a8 when the threaded flag from e28660 is set",
  },
  {
    address: 0xe286f4,
    role: "resource-dispatcher-immediate-path",
    expectedOpcodeHex: "940002c9",
    evidence: "e28674 executes through e29218 when the non-threaded flag from e2864c is used",
  },
  {
    address: 0xe01f24,
    role: "resource-handler-animdata-constructor-call",
    expectedOpcodeHex: "94000272",
    evidence: "renderer resource setup constructs the animData handler before registering it on the e28418 context",
  },
  {
    address: 0xe01f40,
    role: "resource-handler-meshdata-constructor-call",
    expectedOpcodeHex: "940002da",
    evidence: "renderer resource setup constructs the meshData handler before registering it on the e28418 context",
  },
  {
    address: 0xe01f5c,
    role: "resource-handler-shaderdata-constructor-call",
    expectedOpcodeHex: "9400008b",
    evidence: "renderer resource setup constructs the shaderData handler before registering it on the e28418 context",
  },
  {
    address: 0xe01f78,
    role: "resource-handler-texdata-constructor-call",
    expectedOpcodeHex: "94000128",
    evidence: "renderer resource setup constructs the texData handler before registering it on the e28418 context",
  },
  {
    address: 0xe01f88,
    role: "resource-handler-animdata-registration-vslot-load",
    expectedOpcodeHex: "f9400908",
    evidence: "loads the e28418 context vtable +0x10 slot before registering the animData handler object",
  },
  {
    address: 0xe01f8c,
    role: "resource-handler-animdata-registration-vcall",
    expectedOpcodeHex: "d63f0100",
    evidence: "calls the e28418 context vtable +0x10 append path for the animData handler object",
  },
  {
    address: 0xe01f9c,
    role: "resource-handler-meshdata-registration-vslot-load",
    expectedOpcodeHex: "f9400908",
    evidence: "loads the e28418 context vtable +0x10 slot before registering the meshData handler object",
  },
  {
    address: 0xe01fa0,
    role: "resource-handler-meshdata-registration-vcall",
    expectedOpcodeHex: "d63f0100",
    evidence: "calls the e28418 context vtable +0x10 append path for the meshData handler object",
  },
  {
    address: 0xe01fb0,
    role: "resource-handler-shaderdata-registration-vslot-load",
    expectedOpcodeHex: "f9400908",
    evidence: "loads the e28418 context vtable +0x10 slot before registering the shaderData handler object",
  },
  {
    address: 0xe01fb4,
    role: "resource-handler-shaderdata-registration-vcall",
    expectedOpcodeHex: "d63f0100",
    evidence: "calls the e28418 context vtable +0x10 append path for the shaderData handler object",
  },
  {
    address: 0xe01fc4,
    role: "resource-handler-texdata-registration-vslot-load",
    expectedOpcodeHex: "f9400908",
    evidence: "loads the e28418 context vtable +0x10 slot before registering the texData handler object",
  },
  {
    address: 0xe01fc8,
    role: "resource-handler-texdata-registration-vcall",
    expectedOpcodeHex: "d63f0100",
    evidence: "calls the e28418 context vtable +0x10 append path for the texData handler object",
  },
  {
    address: 0xe02194,
    role: "resource-handler-shaderdata-vtable-and-owner-store",
    expectedOpcodeHex: "a9000408",
    evidence: "shaderData handler constructor stores primary vtable 0x272a748 and its owner/resource-factory pointer",
  },
  {
    address: 0xe02424,
    role: "resource-handler-texdata-vtable-and-owner-store",
    expectedOpcodeHex: "a9000408",
    evidence: "texData handler constructor stores primary vtable 0x272a7e0 and its owner/resource-factory pointer",
  },
  {
    address: 0xe028f8,
    role: "resource-handler-animdata-vtable-and-owner-store",
    expectedOpcodeHex: "a9000408",
    evidence: "animData handler constructor stores primary vtable 0x272a8a8 and its owner/resource-factory pointer",
  },
  {
    address: 0xe02ab4,
    role: "resource-handler-meshdata-vtable-and-owner-store",
    expectedOpcodeHex: "a9000408",
    evidence: "meshData handler constructor stores primary vtable 0x272a930 and its owner/resource-factory pointer",
  },
  {
    address: 0xe02abc,
    role: "resource-handler-meshdata-name-page-load",
    expectedOpcodeHex: "d00067a0",
    evidence: "meshData handler name function loads the page for the meshData resource string",
  },
  {
    address: 0xe02ac0,
    role: "resource-handler-meshdata-name-return",
    expectedOpcodeHex: "91341000",
    evidence: "meshData handler name function returns resource string 0x1af8d04",
  },
  {
    address: 0xe02bb0,
    role: "resource-handler-meshdata-resource-object-builder-call",
    expectedOpcodeHex: "942a3b4d",
    evidence:
      "meshData handler process function hashes the request resource name and calls 0x18918e4 to build or fetch the mesh resource object",
  },
  {
    address: 0xe02bf8,
    role: "resource-handler-meshdata-request-result-store",
    expectedOpcodeHex: "94009790",
    evidence: "meshData handler process function stores the built/fetched mesh resource object back onto the request object",
  },
  {
    address: 0x1891944,
    role: "meshdata-runtime-object-vtable-write",
    expectedOpcodeHex: "f9000268",
    evidence: "0x18918e4 writes primary vtable 0x2ab5148 to the meshData runtime object it allocates",
  },
  {
    address: 0x1891948,
    role: "meshdata-runtime-object-request-path-store",
    expectedOpcodeHex: "f8010f57",
    evidence: "0x18918e4 stores the request path/name pointer into the runtime object at +0x10",
  },
  {
    address: 0x189194c,
    role: "meshdata-runtime-object-owner-store",
    expectedOpcodeHex: "f9000e76",
    evidence: "0x18918e4 stores the handler owner/resource-factory pointer into the runtime object at +0x18",
  },
  {
    address: 0x1891950,
    role: "meshdata-runtime-object-hash-store",
    expectedOpcodeHex: "b9002278",
    evidence: "0x18918e4 stores the hashed meshData request key into the runtime object at +0x20",
  },
  {
    address: 0x1891af8,
    role: "meshdata-runtime-setup-payload-bridge-a-call",
    expectedOpcodeHex: "97fffce6",
    evidence: "meshData runtime setup calls 0x1890e90 to populate one payload block through the object +0x18 dispatch path",
  },
  {
    address: 0x1891b04,
    role: "meshdata-runtime-setup-payload-bridge-b-call",
    expectedOpcodeHex: "97fffce5",
    evidence: "meshData runtime setup calls 0x1890e98 to populate the second payload block through a vtable +0x18 dispatch path",
  },
  {
    address: 0x1890e90,
    role: "meshdata-runtime-bridge-a-load-plus18-object",
    expectedOpcodeHex: "f9400c00",
    evidence: "bridge 0x1890e90 loads object +0x18 before tail-branching to the shared payload builder",
  },
  {
    address: 0x1890e94,
    role: "meshdata-runtime-bridge-a-tail-payload-builder",
    expectedOpcodeHex: "14000d19",
    evidence: "bridge 0x1890e90 tail-branches to 0x18942f8 with the meshData payload arguments",
  },
  {
    address: 0x1890e98,
    role: "meshdata-runtime-bridge-b-owner-pair-load",
    expectedOpcodeHex: "a9420c08",
    evidence: "bridge 0x1890e98 loads object +0x20/+0x28 before dispatching through the nested vtable",
  },
  {
    address: 0x1890ea4,
    role: "meshdata-runtime-bridge-b-vslot-18-load",
    expectedOpcodeHex: "f9400d24",
    evidence: "bridge 0x1890e98 loads nested vtable +0x18 for the second meshData payload path",
  },
  {
    address: 0x1890ea8,
    role: "meshdata-runtime-bridge-b-vslot-18-branch",
    expectedOpcodeHex: "d61f0080",
    evidence: "bridge 0x1890e98 branches through the nested vtable +0x18 payload path",
  },
  {
    address: 0x1894338,
    role: "meshdata-runtime-payload-builder-fetch-layout",
    expectedOpcodeHex: "97fffebe",
    evidence: "payload builder 0x18942f8 derives layout/state from object +0x30 before copying runtime payload blocks",
  },
  {
    address: 0x1894358,
    role: "meshdata-runtime-payload-builder-apply",
    expectedOpcodeHex: "94004a5f",
    evidence: "payload builder 0x18942f8 applies the built payload through 0x18a6cd4",
  },
  {
    address: 0x1894388,
    role: "meshdata-runtime-payload-builder-copy-b",
    expectedOpcodeHex: "97bbfdea",
    evidence: "payload builder 0x18942f8 copies the second payload block to the caller-provided output buffer",
  },
  {
    address: 0x18922ec,
    role: "render-command-a-param-runtime-vslot-10-load",
    expectedOpcodeHex: "f9400908",
    evidence: "render-command A builder loads the x2 runtime parameter object's vtable +0x10 before creating the draw/runtime object",
  },
  {
    address: 0x18922f0,
    role: "render-command-a-param-runtime-vslot-10-call",
    expectedOpcodeHex: "d63f0100",
    evidence:
      "render-command A builder calls the x2 runtime parameter object's vtable +0x10; the return value is used to create and enqueue the render command",
  },
  {
    address: 0x1892144,
    role: "render-command-a-x4-entry-move",
    expectedOpcodeHex: "aa0403f8",
    evidence: "render-command A builder preserves the composite-dispatch x4 entry pointer in x24",
  },
  {
    address: 0x1892148,
    role: "render-command-a-x4-provider-predecrement-load",
    expectedOpcodeHex: "f85f8f08",
    evidence: "render-command A builder derives the transform-provider subobject by pre-decrementing x4 by 8",
  },
  {
    address: 0x1892154,
    role: "render-command-a-x4-provider-aux-vslot-10-load",
    expectedOpcodeHex: "f9400908",
    evidence: "render-command A builder loads the x4-derived provider vtable +0x10 auxiliary slot",
  },
  {
    address: 0x189215c,
    role: "render-command-a-x4-provider-aux-vslot-10-call",
    expectedOpcodeHex: "d63f0100",
    evidence: "render-command A builder calls the x4-derived provider vtable +0x10 before resolving the transform source",
  },
  {
    address: 0x1893864,
    role: "render-command-b-param-runtime-vslot-10-load",
    expectedOpcodeHex: "f9400908",
    evidence: "render-command B builder loads the x2 runtime parameter object's vtable +0x10 before creating the draw/runtime object",
  },
  {
    address: 0x1893868,
    role: "render-command-b-param-runtime-vslot-10-call",
    expectedOpcodeHex: "d63f0100",
    evidence:
      "render-command B builder calls the x2 runtime parameter object's vtable +0x10; the return value is used to create and enqueue the render command",
  },
  {
    address: 0x189369c,
    role: "render-command-b-x4-entry-move",
    expectedOpcodeHex: "aa0403f3",
    evidence: "render-command B builder preserves the composite-dispatch x4 entry pointer in x19",
  },
  {
    address: 0x18936ac,
    role: "render-command-b-x4-provider-predecrement-load",
    expectedOpcodeHex: "f85f8e68",
    evidence: "render-command B builder derives the transform-provider subobject by pre-decrementing x4 by 8",
  },
  {
    address: 0x18936b0,
    role: "render-command-b-x4-provider-aux-vslot-10-load",
    expectedOpcodeHex: "f9400908",
    evidence: "render-command B builder loads the x4-derived provider vtable +0x10 auxiliary slot",
  },
  {
    address: 0x18936b8,
    role: "render-command-b-x4-provider-aux-vslot-10-call",
    expectedOpcodeHex: "d63f0100",
    evidence: "render-command B builder calls the x4-derived provider vtable +0x10 before resolving the transform source",
  },
  {
    address: 0x18a11a4,
    role: "composite-task-single-vtable-page-load",
    expectedOpcodeHex: "900090a8",
    evidence:
      "single composite-task constructor prepares the page for vtable 0x2ab5590 before storing the primary vtable",
  },
  {
    address: 0x18a11bc,
    role: "composite-task-single-vtable-store",
    expectedOpcodeHex: "f90002e8",
    evidence:
      "single composite-task constructor stores primary vtable 0x2ab5590 on the task object",
  },
  {
    address: 0x18a11b4,
    role: "composite-task-single-inline-entry-store",
    expectedOpcodeHex: "a904d6f6",
    evidence:
      "single composite-task constructor stores its label/inline entry arguments at task +0x48/+0x50; dispatch later reads the inline entry from +0x50",
  },
  {
    address: 0x18a11b8,
    role: "composite-task-single-runtime-param-store",
    expectedOpcodeHex: "f9002ef4",
    evidence:
      "single composite-task constructor stores the runtime-parameter object at task +0x58",
  },
  {
    address: 0x18a11cc,
    role: "composite-task-single-flags-store",
    expectedOpcodeHex: "b9008ae8",
    evidence:
      "single composite-task constructor stores count/flags without setting the external-array bit, so dispatch uses the inline task +0x50 entry",
  },
  {
    address: 0x18a121c,
    role: "composite-task-batch-vtable-page-load",
    expectedOpcodeHex: "900090a8",
    evidence:
      "batch composite-task constructor prepares the page for vtable 0x2ab5590 before storing the primary vtable",
  },
  {
    address: 0x18a1234,
    role: "composite-task-batch-vtable-store",
    expectedOpcodeHex: "f9000308",
    evidence:
      "batch composite-task constructor stores primary vtable 0x2ab5590 on the task object",
  },
  {
    address: 0x18a122c,
    role: "composite-task-batch-entry-array-store",
    expectedOpcodeHex: "a904db17",
    evidence:
      "batch composite-task constructor stores its label and entry-array pointer at task +0x48/+0x50; dispatch later dereferences +0x50 when bit 30 is set",
  },
  {
    address: 0x18a1230,
    role: "composite-task-batch-runtime-param-store",
    expectedOpcodeHex: "f9002f14",
    evidence:
      "batch composite-task constructor stores the runtime-parameter object at task +0x58",
  },
  {
    address: 0x18a120c,
    role: "composite-task-batch-runtime-param-arg-save",
    expectedOpcodeHex: "aa0403f4",
    evidence:
      "batch composite-task constructor preserves caller x4 in x20 before storing it at task +0x58 as the runtime-parameter object",
  },
  {
    address: 0x18a1244,
    role: "composite-task-batch-external-array-flag",
    expectedOpcodeHex: "32020108",
    evidence:
      "batch composite-task constructor sets the external-array flag bit before storing task count/flags",
  },
  {
    address: 0x18a1248,
    role: "composite-task-batch-flags-store",
    expectedOpcodeHex: "b9008b08",
    evidence:
      "batch composite-task constructor stores the entry count plus external-array flag at task +0x88",
  },
  {
    address: 0x18a1420,
    role: "composite-task-dispatch-entry-storage-base",
    expectedOpcodeHex: "91014017",
    evidence:
      "composite-task dispatch starts with task +0x50 as the entry storage location",
  },
  {
    address: 0x18a1428,
    role: "composite-task-dispatch-external-array-load",
    expectedOpcodeHex: "f94002f7",
    evidence:
      "when the external-array bit is set, composite-task dispatch dereferences task +0x50 to get the entry array",
  },
  {
    address: 0x18a142c,
    role: "composite-task-dispatch-entry-count-mask",
    expectedOpcodeHex: "12007509",
    evidence:
      "composite-task dispatch masks task +0x88 to recover the entry count",
  },
  {
    address: 0x18a1440,
    role: "composite-task-targeted-entry-load",
    expectedOpcodeHex: "f8787ae4",
    evidence:
      "composite-task dispatch targeted path loads an entry object from the task list before matching entry +0x8",
  },
  {
    address: 0x18a1444,
    role: "composite-task-targeted-entry-owner-load",
    expectedOpcodeHex: "f9400489",
    evidence:
      "composite-task dispatch targeted path loads entry +0x8, the object later compared with the requested target",
  },
  {
    address: 0x18a1454,
    role: "composite-task-targeted-runtime-param-load",
    expectedOpcodeHex: "f9402e82",
    evidence:
      "composite-task dispatch targeted path loads x2 from dispatcher object +0x58 before invoking entry vtable +0x10",
  },
  {
    address: 0x18a1460,
    role: "composite-task-targeted-vslot-10-load",
    expectedOpcodeHex: "f9400908",
    evidence:
      "composite-task dispatch targeted path loads the matched entry object's vtable +0x10",
  },
  {
    address: 0x18a146c,
    role: "composite-task-targeted-vslot-10-call",
    expectedOpcodeHex: "d63f0100",
    evidence:
      "composite-task dispatch targeted path calls the matched entry object's vtable +0x10 with x2 from +0x58 and x4 as the entry",
  },
  {
    address: 0x18a1494,
    role: "composite-task-all-entry-load",
    expectedOpcodeHex: "f8767ae4",
    evidence:
      "composite-task dispatch all path iterates every entry object from the task list",
  },
  {
    address: 0x18a1498,
    role: "composite-task-all-runtime-param-load",
    expectedOpcodeHex: "f9402e82",
    evidence:
      "composite-task dispatch all path loads x2 from dispatcher object +0x58 before invoking entry vtable +0x10",
  },
  {
    address: 0x18a14a4,
    role: "composite-task-all-entry-owner-load",
    expectedOpcodeHex: "f9400480",
    evidence:
      "composite-task dispatch all path loads x0 from entry +0x8 before calling that object's vtable +0x10",
  },
  {
    address: 0x18a14b0,
    role: "composite-task-all-vslot-10-load",
    expectedOpcodeHex: "f9400908",
    evidence:
      "composite-task dispatch all path loads each entry object's vtable +0x10",
  },
  {
    address: 0x18a14b4,
    role: "composite-task-all-vslot-10-call",
    expectedOpcodeHex: "d63f0100",
    evidence:
      "composite-task dispatch all path calls each entry object's vtable +0x10 with x2 from +0x58 and x4 as the entry",
  },
  {
    address: 0x18a14f8,
    role: "composite-task-runtime-param-dispatch-load",
    expectedOpcodeHex: "f9402c08",
    evidence:
      "composite-task helper loads the runtime-parameter object from task +0x58 before dispatching through its vtable",
  },
  {
    address: 0x18a1508,
    role: "composite-task-runtime-param-vslot-18-load",
    expectedOpcodeHex: "f9400d22",
    evidence:
      "composite-task helper loads runtime-parameter vtable +0x18, a separate callback from the entry vtable +0x10 dispatch",
  },
  {
    address: 0x18a150c,
    role: "composite-task-runtime-param-vslot-18-branch",
    expectedOpcodeHex: "d61f0040",
    evidence:
      "composite-task helper branches through runtime-parameter vtable +0x18 with the task list pointer",
  },
  {
    address: 0x1894c40,
    role: "meshdata-payload-serializer-vtable-page-load",
    expectedOpcodeHex: "b0009109",
    evidence:
      "meshData payload builder constructs a serializer object whose primary vtable is 0x2ab52a8",
  },
  {
    address: 0x1894c58,
    role: "meshdata-payload-serializer-vtable-and-owner-store",
    expectedOpcodeHex: "a9000509",
    evidence:
      "meshData payload serializer constructor stores vtable 0x2ab52a8 plus its owner/context pointer",
  },
  {
    address: 0x18a2804,
    role: "composite-task-base-flag-load",
    expectedOpcodeHex: "b9404409",
    evidence:
      "base task constructor begins by reading its flag word before writing the base vtable and child task pointers",
  },
  {
    address: 0x18a281c,
    role: "composite-task-base-child-task-store",
    expectedOpcodeHex: "a9018801",
    evidence:
      "base task constructor stores the two child/cleanup task pointers at task +0x18/+0x20; these are separate from the +0x50 dispatch entries",
  },
  {
    address: 0x18a1314,
    role: "composite-task-clone-runtime-param-copy",
    expectedOpcodeHex: "f9402e68",
    evidence:
      "composite-task clone copies task +0x58 runtime-parameter object into the cloned task",
  },
  {
    address: 0x18a13c4,
    role: "composite-task-clone-entry-array-source-load",
    expectedOpcodeHex: "f9402a6a",
    evidence:
      "composite-task clone copies the source task +0x50 entry array when the external-array flag is present",
  },
  {
    address: 0x18a13e4,
    role: "composite-task-clone-entry-array-store",
    expectedOpcodeHex: "f9002aa8",
    evidence:
      "composite-task clone stores the cloned entry-array pointer back at cloned task +0x50",
  },
  {
    address: 0x188e784,
    role: "scene-entity-entry-array-global-page-load",
    expectedOpcodeHex: "9000c468",
    evidence:
      "scene entity entry-array forwarder prepares the page for global manager slot 0x311a960",
  },
  {
    address: 0x188e788,
    role: "scene-entity-entry-array-global-load",
    expectedOpcodeHex: "f944b108",
    evidence:
      "scene entity entry-array forwarder loads the global scene/entity manager from 0x311a960",
  },
  {
    address: 0x188e7a0,
    role: "scene-entity-entry-array-builder-tailcall",
    expectedOpcodeHex: "14000227",
    evidence:
      "scene entity entry-array forwarder tail-calls 0x188f03c with the global manager and output entry-array pointer",
  },
  {
    address: 0x188e008,
    role: "scene-entity-manager-constructor-call",
    expectedOpcodeHex: "940003ab",
    evidence:
      "scene/entity subsystem initialization calls 0x188eeb4 with the newly allocated 0x8020-byte manager object",
  },
  {
    address: 0x188e014,
    role: "scene-entity-manager-global-store",
    expectedOpcodeHex: "f904b115",
    evidence: "stores the initialized scene/entity manager object into global slot 0x311a960",
  },
  {
    address: 0x188e150,
    role: "scene-entity-manager-destructor-load",
    expectedOpcodeHex: "f944b2a0",
    evidence: "loads global slot 0x311a960 during scene/entity subsystem shutdown",
  },
  {
    address: 0x188e15c,
    role: "scene-entity-manager-destructor-delete",
    expectedOpcodeHex: "97bc08f5",
    evidence:
      "deletes the 0x311a960 manager allocation directly; this manager itself is a record-pool struct, not a vtable object",
  },
  {
    address: 0x188e168,
    role: "scene-entity-manager-global-clear",
    expectedOpcodeHex: "f904b2bf",
    evidence: "clears global slot 0x311a960 after deleting the scene/entity manager allocation",
  },
  {
    address: 0x188e7e0,
    role: "scene-entity-manager-accessor-page-load",
    expectedOpcodeHex: "9000c468",
    evidence: "public accessor prepares the page for global scene/entity manager slot 0x311a960",
  },
  {
    address: 0x188e7e4,
    role: "scene-entity-manager-accessor-load",
    expectedOpcodeHex: "f944b100",
    evidence: "public accessor returns the global scene/entity manager pointer from 0x311a960",
  },
  {
    address: 0x188eeb8,
    role: "scene-entity-manager-constructor-backing-store",
    expectedOpcodeHex: "f8010501",
    evidence:
      "0x188eeb4 stores the backing indexed scene object at manager +0x0 before initializing fixed-size records",
  },
  {
    address: 0x188eec0,
    role: "scene-entity-manager-constructor-free-list-link",
    expectedOpcodeHex: "78010509",
    evidence:
      "0x188eeb4 initializes the 0x800 record free list by writing each next index into the record head",
  },
  {
    address: 0x188eed8,
    role: "scene-entity-manager-constructor-free-list-metadata",
    expectedOpcodeHex: "f8286809",
    evidence:
      "0x188eeb4 writes the record-pool metadata at manager +0x8010 after the 0x800 fixed records",
  },
  {
    address: 0x188eef8,
    role: "scene-entity-manager-add-free-head-load",
    expectedOpcodeHex: "7940012a",
    evidence: "0x188eee0 allocates a scene/entity record by reading the manager +0x8010 free-list head",
  },
  {
    address: 0x188ef60,
    role: "scene-entity-manager-add-backing-vslot-10-load",
    expectedOpcodeHex: "f9400929",
    evidence:
      "0x188eee0 calls the backing indexed scene object vtable +0x10 with the allocated record index",
  },
  {
    address: 0x188ef64,
    role: "scene-entity-manager-add-backing-vslot-10-call",
    expectedOpcodeHex: "d63f0120",
    evidence:
      "0x188eee0 branches through backing vtable +0x10 before storing the returned per-record id",
  },
  {
    address: 0x188ef70,
    role: "scene-entity-manager-add-entry-pointer-store",
    expectedOpcodeHex: "f90006d3",
    evidence: "0x188eee0 stores the caller-provided scene/entity entry pointer into record +0x8",
  },
  {
    address: 0x188efb0,
    role: "scene-entity-manager-remove-backing-vslot-18-load",
    expectedOpcodeHex: "f9400d08",
    evidence:
      "0x188ef88 removes a scene/entity record by calling the backing indexed scene object vtable +0x18",
  },
  {
    address: 0x188efb4,
    role: "scene-entity-manager-remove-backing-vslot-18-call",
    expectedOpcodeHex: "d63f0100",
    evidence:
      "0x188ef88 calls backing vtable +0x18 with the record's stored id before returning the record to the free list",
  },
  {
    address: 0x188f028,
    role: "scene-entity-manager-dispatch-record-id-load",
    expectedOpcodeHex: "79402541",
    evidence:
      "0x188f020 maps a record index to the stored record id at manager +0x10 + index*16 +0x2",
  },
  {
    address: 0x188f034,
    role: "scene-entity-manager-dispatch-backing-vslot-20-load",
    expectedOpcodeHex: "f9401124",
    evidence: "0x188f020 loads backing indexed scene object vtable +0x20 for per-record dispatch",
  },
  {
    address: 0x188f038,
    role: "scene-entity-manager-dispatch-backing-vslot-20-branch",
    expectedOpcodeHex: "d61f0080",
    evidence:
      "0x188f020 branches through backing vtable +0x20 with the record id and caller-provided runtime payload",
  },
  {
    address: 0x188f07c,
    role: "scene-entity-entry-array-count-vslot-38-load",
    expectedOpcodeHex: "f9400008",
    evidence:
      "scene entity entry-array builder loads the manager object's vtable before calling the count/index capacity path",
  },
  {
    address: 0x188f080,
    role: "scene-entity-entry-array-count-vslot-38",
    expectedOpcodeHex: "f9401d08",
    evidence:
      "scene entity entry-array builder loads manager vtable +0x38 to determine temporary index capacity",
  },
  {
    address: 0x188f0bc,
    role: "scene-entity-entry-array-index-fill-vslot-28",
    expectedOpcodeHex: "f9401508",
    evidence:
      "scene entity entry-array builder loads manager vtable +0x28 to fill a temporary u16 index buffer",
  },
  {
    address: 0x188f0d8,
    role: "scene-entity-entry-array-u16-index-load",
    expectedOpcodeHex: "7840268a",
    evidence:
      "scene entity entry-array builder reads each u16 index from the temporary index buffer",
  },
  {
    address: 0x188f0e0,
    role: "scene-entity-entry-array-record-address",
    expectedOpcodeHex: "8b0a110a",
    evidence:
      "scene entity entry-array builder maps each index to manager +0x10 + index*16",
  },
  {
    address: 0x188f0e4,
    role: "scene-entity-entry-array-entry-load",
    expectedOpcodeHex: "f940054a",
    evidence:
      "scene entity entry-array builder loads the concrete entry pointer from each manager record +0x8",
  },
  {
    address: 0x188f0e8,
    role: "scene-entity-entry-array-output-store",
    expectedOpcodeHex: "f800866a",
    evidence:
      "scene entity entry-array builder writes each concrete entry pointer into the output x2 array used by the composite task",
  },
  {
    address: 0xd7f988,
    role: "scene-entity-record-entry-owner-b-accessor-call",
    expectedOpcodeHex: "942c4359",
    evidence:
      "scene/entity record entry setup calls 0x18906ec; that accessor returns global render-command owner B at 0x311ae08",
  },
  {
    address: 0xd7f998,
    role: "scene-entity-record-entry-flags-store",
    expectedOpcodeHex: "b9003268",
    evidence: "scene/entity record entry setup stores a flag/state word at entry +0x0 before owner/callback setup",
  },
  {
    address: 0xd7f9a8,
    role: "scene-entity-record-entry-owner-and-callback-store",
    expectedOpcodeHex: "a903a660",
    evidence:
      "scene/entity record entry setup stores the owner returned by 0x18906ec and the callback/table pointer derived from 0x2726740 at entry +0x8/+0x10",
  },
  {
    address: 0xd7f9b4,
    role: "scene-entity-record-entry-primary-vtable-store",
    expectedOpcodeHex: "f9000268",
    evidence: "surrounding scene/entity object writes primary vtable/table base 0x27266c0 before registering entry +0x30",
  },
  {
    address: 0xd7f9b8,
    role: "scene-entity-record-entry-sub-vtable-store",
    expectedOpcodeHex: "f900166a",
    evidence: "surrounding scene/entity object writes sub-vtable/table base 0x2726710 during entry setup",
  },
  {
    address: 0xd7f9bc,
    role: "scene-entity-record-entry-list-init-call",
    expectedOpcodeHex: "942c4352",
    evidence: "scene/entity record entry setup initializes the entry-side list holder through 0x1890704",
  },
  {
    address: 0xd7fc64,
    role: "scene-entity-record-entry-helper-dispatch-list",
    expectedOpcodeHex: "91016008",
    evidence: "entry primary table slot +0x20 prepares x0 = object +0x58 before entering the global helper dispatch thunk",
  },
  {
    address: 0xd7fc68,
    role: "scene-entity-record-entry-helper-dispatch-payload",
    expectedOpcodeHex: "91010002",
    evidence: "entry primary table slot +0x20 prepares x2 = object +0x40 as the helper-dispatch payload",
  },
  {
    address: 0xd7fc70,
    role: "scene-entity-record-entry-helper-dispatch-tail",
    expectedOpcodeHex: "142c4290",
    evidence:
      "entry primary table slot +0x20 tail-branches to 0x18906b0, the global helper dispatch thunk already tied to resource/render dispatch",
  },
  {
    address: 0xd7fc88,
    role: "scene-entity-record-entry-owner-switch-owner-a",
    expectedOpcodeHex: "942c429c",
    evidence: "entry owner-switch helper can load global render-command owner A through 0x18906f8",
  },
  {
    address: 0xd7fc90,
    role: "scene-entity-record-entry-owner-switch-owner-b",
    expectedOpcodeHex: "942c4297",
    evidence: "entry owner-switch helper can load global render-command owner B through 0x18906ec",
  },
  {
    address: 0xd7fc94,
    role: "scene-entity-record-entry-owner-switch-store",
    expectedOpcodeHex: "f9001e60",
    evidence: "entry owner-switch helper stores the selected global render-command owner at object +0x38",
  },
  {
    address: 0xd7fdf4,
    role: "scene-entity-record-entry-change-check-list-active",
    expectedOpcodeHex: "942c4256",
    evidence: "entry transform/state update path checks whether the entry-side list holder is active before dispatching",
  },
  {
    address: 0xd7fe3c,
    role: "scene-entity-record-entry-record-dispatch-payload-access",
    expectedOpcodeHex: "942c4250",
    evidence: "entry record-update path reads the entry-side payload object through 0x189077c before building a stack dispatch payload",
  },
  {
    address: 0xd7ff04,
    role: "scene-entity-record-entry-record-dispatch-manager-accessor",
    expectedOpcodeHex: "942c3a37",
    evidence: "entry record-update path obtains the global 0x311a960 manager through 0x188e7e0",
  },
  {
    address: 0xd7ff14,
    role: "scene-entity-record-entry-record-dispatch-call",
    expectedOpcodeHex: "942c3c43",
    evidence: "entry record-update path dispatches through 0x188f020 with the object +0xb0 record index and stack payload",
  },
  {
    address: 0xd7ff44,
    role: "scene-entity-record-entry-transform-provider-return",
    expectedOpcodeHex: "91012000",
    evidence:
      "scene/entity sub-vtable +0x18 returns x0 +0x48; when builder passes x4-8 = object +0x28, this returns object +0x70 as the transform source",
  },
  {
    address: 0xd80100,
    role: "scene-entity-record-entry-conditional-update-primary",
    expectedOpcodeHex: "7100043f",
    evidence: "primary table conditional-update slot checks w1 == 1 before entering the record-update body",
  },
  {
    address: 0xd80108,
    role: "scene-entity-record-entry-conditional-update-primary-branch",
    expectedOpcodeHex: "17ffff44",
    evidence: "primary table conditional-update slot branches to the record-update body at 0xd7fe18",
  },
  {
    address: 0xd80110,
    role: "scene-entity-record-entry-conditional-update-callback",
    expectedOpcodeHex: "7100043f",
    evidence: "callback table conditional-update thunk checks w1 == 1 before entering the record-update body",
  },
  {
    address: 0xd80118,
    role: "scene-entity-record-entry-conditional-update-callback-adjust",
    expectedOpcodeHex: "d1010000",
    evidence: "callback table conditional-update thunk converts the callback subobject pointer back to the owner object by subtracting 0x40",
  },
  {
    address: 0xd8011c,
    role: "scene-entity-record-entry-conditional-update-callback-branch",
    expectedOpcodeHex: "17ffff3f",
    evidence: "callback table conditional-update thunk branches to the record-update body at 0xd7fe18",
  },
  {
    address: 0xd7faa4,
    role: "scene-entity-record-add-caller-a-entry-pointer",
    expectedOpcodeHex: "9100c283",
    evidence: "add-record caller A passes x3 = object +0x30 as the scene/entity record entry pointer",
  },
  {
    address: 0xd7fab0,
    role: "scene-entity-record-add-caller-a-call",
    expectedOpcodeHex: "942c3d0c",
    evidence: "add-record caller A invokes 0x188eee0 after preparing x3 = object +0x30",
  },
  {
    address: 0x8d3a20,
    role: "scene-entity-record-add-caller-b-entry-pointer",
    expectedOpcodeHex: "9100c283",
    evidence: "add-record caller B also passes x3 = object +0x30 as the scene/entity record entry pointer",
  },
  {
    address: 0x8d3a2c,
    role: "scene-entity-record-add-caller-b-call",
    expectedOpcodeHex: "943eed2d",
    evidence: "add-record caller B invokes 0x188eee0 after preparing x3 = object +0x30",
  },
  {
    address: 0x8d3118,
    role: "scene-entity-record-layout-b-register-wrapper-tail",
    expectedOpcodeHex: "1400021d",
    evidence:
      "a wrapper path loads a table/default source and tail-branches into the second scene/entity register layout at 0x8d398c",
  },
  {
    address: 0x8d3110,
    role: "scene-entity-record-layout-b-register-wrapper-mode-load",
    expectedOpcodeHex: "b940ac02",
    evidence: "the layout B wrapper reads the add-record mode/flags from object +0xac before registration",
  },
  {
    address: 0x8d3114,
    role: "scene-entity-record-layout-b-register-wrapper-default-source-load",
    expectedOpcodeHex: "f9427821",
    evidence:
      "the layout B wrapper loads x1 from the 0x2ae54f0 table/default source; this is not a proven lightfield/profile payload",
  },
  {
    address: 0x8d3a08,
    role: "scene-entity-record-layout-b-transform-store-68",
    expectedOpcodeHex: "3c868001",
    evidence: "layout B stores its first default transform/vector block at object +0x68",
  },
  {
    address: 0x8d3a0c,
    role: "scene-entity-record-layout-b-transform-store-78",
    expectedOpcodeHex: "3c878000",
    evidence: "layout B stores its second default transform/vector block at object +0x78",
  },
  {
    address: 0x8d3a10,
    role: "scene-entity-record-layout-b-transform-store-88",
    expectedOpcodeHex: "3c888002",
    evidence: "layout B stores its third default transform/vector block at object +0x88",
  },
  {
    address: 0x8d3a14,
    role: "scene-entity-record-layout-b-payload-pointer-store",
    expectedOpcodeHex: "f9004c08",
    evidence: "layout B stores the caller-provided payload/table pointer at object +0x98",
  },
  {
    address: 0x8d3a18,
    role: "scene-entity-record-layout-b-flags-store",
    expectedOpcodeHex: "29142809",
    evidence: "layout B stores the caller-provided flag word plus default 1.0 word at object +0xa0",
  },
  {
    address: 0x8d3a1c,
    role: "scene-entity-record-layout-b-manager-accessor",
    expectedOpcodeHex: "943eeb71",
    evidence: "layout B obtains the same 0x311a960 scene/entity manager through 0x188e7e0 before add-record",
  },
  {
    address: 0x8d3a30,
    role: "scene-entity-record-layout-b-record-index-store",
    expectedOpcodeHex: "79016280",
    evidence: "layout B stores the 0x188eee0 returned record index at object +0xb0",
  },
  {
    address: 0x8d3188,
    role: "scene-entity-record-layout-b-followup-callsite",
    expectedOpcodeHex: "9400023e",
    evidence:
      "layout B update path calls 0x8d3a80 after checking the object +0x50 runtime target state",
  },
  {
    address: 0x8d3aa8,
    role: "scene-entity-record-layout-b-followup-bitfield-load",
    expectedOpcodeHex: "39444009",
    evidence: "layout B follow-up reads the high byte of the packed material/runtime parameter bitfield at object +0x110",
  },
  {
    address: 0x8d3ad4,
    role: "scene-entity-record-layout-b-param-target-load-a",
    expectedOpcodeHex: "f9402a60",
    evidence: "layout B follow-up loads the runtime/material parameter target object from object +0x50",
  },
  {
    address: 0x8d3ae0,
    role: "scene-entity-record-layout-b-param-write-call-a",
    expectedOpcodeHex: "94159754",
    evidence: "layout B writes one decoded runtime/material parameter through 0xe39830",
  },
  {
    address: 0x8d3b40,
    role: "scene-entity-record-layout-b-param-write-call-b",
    expectedOpcodeHex: "9415973c",
    evidence: "layout B writes a decoded color/vector runtime/material parameter through 0xe39830",
  },
  {
    address: 0x8d3b68,
    role: "scene-entity-record-layout-b-param-write-call-c",
    expectedOpcodeHex: "94159732",
    evidence: "layout B writes another decoded runtime/material parameter through 0xe39830",
  },
  {
    address: 0x8d3b90,
    role: "scene-entity-record-layout-b-param-write-call-d",
    expectedOpcodeHex: "94159728",
    evidence: "layout B writes another decoded runtime/material parameter through 0xe39830",
  },
  {
    address: 0x8d3bd0,
    role: "scene-entity-record-layout-b-param-write-call-e",
    expectedOpcodeHex: "94159718",
    evidence: "layout B writes another decoded runtime/material parameter through 0xe39830",
  },
  {
    address: 0x8d3bf8,
    role: "scene-entity-record-layout-b-param-write-call-f",
    expectedOpcodeHex: "9415970e",
    evidence: "layout B writes another decoded runtime/material parameter through 0xe39830",
  },
  {
    address: 0x8d3198,
    role: "scene-entity-record-layout-b-state-dispatch-tail",
    expectedOpcodeHex: "140002a3",
    evidence:
      "after layout B parameter refresh, the update path tail-branches to 0x8d3c24 for object +0x58 state-dependent handling",
  },
  {
    address: 0x8d3c58,
    role: "scene-entity-record-layout-b-state-mode-load",
    expectedOpcodeHex: "b940b808",
    evidence: "layout B state dispatch reads mode/state selector from object +0xb8",
  },
  {
    address: 0x8d3c60,
    role: "scene-entity-record-layout-b-state-object-load",
    expectedOpcodeHex: "f9402e60",
    evidence: "layout B state dispatch reads the linked state object from object +0x58",
  },
  {
    address: 0x8d3c70,
    role: "scene-entity-record-layout-b-state-version-compare",
    expectedOpcodeHex: "6b09011f",
    evidence:
      "layout B state dispatch compares object +0x60 with linked state object's +0x8 version before using the linked state",
  },
  {
    address: 0x8d3ccc,
    role: "scene-entity-record-layout-b-state-stale-clear",
    expectedOpcodeHex: "f9002e7f",
    evidence: "layout B clears object +0x58 when the linked state object's version no longer matches",
  },
  {
    address: 0x8d3d60,
    role: "scene-entity-record-layout-b-state-mode3-apply-call",
    expectedOpcodeHex: "94000312",
    evidence: "layout B mode 3 refreshes transform state through helper 0x8d49a8",
  },
  {
    address: 0x8d3d88,
    role: "scene-entity-record-layout-b-state-mode2-convert-call",
    expectedOpcodeHex: "940e21df",
    evidence: "layout B mode 2 converts linked-state data through 0xc5c504 before transform apply",
  },
  {
    address: 0x8d3dac,
    role: "scene-entity-record-layout-b-state-mode1-convert-call",
    expectedOpcodeHex: "940e2196",
    evidence: "layout B mode 1 converts linked-state data through 0xc5c404 before transform apply",
  },
  {
    address: 0x8d3db8,
    role: "scene-entity-record-layout-b-transform-apply-call-a",
    expectedOpcodeHex: "94000207",
    evidence: "layout B applies a prepared transform payload through 0x8d45d4",
  },
  {
    address: 0x8d3dd4,
    role: "scene-entity-record-layout-b-flagged-angle-update-call",
    expectedOpcodeHex: "9400032e",
    evidence: "layout B optional angle/rotation update calls 0x8d4a8c when bit 30 is set",
  },
  {
    address: 0x8d40d8,
    role: "scene-entity-record-layout-b-matrix-compose-call-a",
    expectedOpcodeHex: "97ff8662",
    evidence: "layout B composes an intermediate matrix/transform payload through 0x8b5a60",
  },
  {
    address: 0x8d40e8,
    role: "scene-entity-record-layout-b-matrix-compose-call-b",
    expectedOpcodeHex: "97ff865e",
    evidence: "layout B composes the final object +0x68 transform payload through 0x8b5a60",
  },
  {
    address: 0x8d40f4,
    role: "scene-entity-record-layout-b-transform-apply-call-b",
    expectedOpcodeHex: "94000138",
    evidence: "layout B applies the composed transform payload through 0x8d45d4",
  },
  {
    address: 0x8d4108,
    role: "scene-entity-record-layout-b-optional-visibility-call",
    expectedOpcodeHex: "940002e3",
    evidence: "layout B optionally calls 0x8d4c94 when object +0xc4 equals 1",
  },
  {
    address: 0x8d410c,
    role: "scene-entity-record-layout-b-final-manager-accessor",
    expectedOpcodeHex: "943ee9b5",
    evidence: "layout B obtains the global 0x311a960 scene/entity manager before final record dispatch",
  },
  {
    address: 0x8d4110,
    role: "scene-entity-record-layout-b-final-param-target-load",
    expectedOpcodeHex: "f9402a68",
    evidence: "layout B loads object +0x50 as the source target for final payload building",
  },
  {
    address: 0x8d4114,
    role: "scene-entity-record-layout-b-final-record-index-load",
    expectedOpcodeHex: "79416273",
    evidence: "layout B reloads the manager record index from object +0xb0 for final dispatch",
  },
  {
    address: 0x8d4120,
    role: "scene-entity-record-layout-b-param-payload-build-call",
    expectedOpcodeHex: "941598fc",
    evidence: "layout B builds a runtime payload from object +0x50 through 0xe3a510",
  },
  {
    address: 0x8d4134,
    role: "scene-entity-record-layout-b-final-record-dispatch-call",
    expectedOpcodeHex: "943eebbb",
    evidence: "layout B dispatches the built payload to scene/entity manager record through 0x188f020",
  },
  {
    address: 0x820f20,
    role: "draw-all-scene-entities-runtime-param-index-zero",
    expectedOpcodeHex: "2a1f03e0",
    evidence: "Draw all scene entities sets w0 = 0 before calling the runtime-parameter accessor 0x189d63c",
  },
  {
    address: 0x820f24,
    role: "draw-all-scene-entities-runtime-param-accessor-call",
    expectedOpcodeHex: "9441f1c6",
    evidence: "Draw all scene entities calls 0x189d63c(0), which returns global runtime-parameter table slot 0",
  },
  {
    address: 0x820f2c,
    role: "draw-all-scene-entities-runtime-param-store-temp",
    expectedOpcodeHex: "aa0003f7",
    evidence: "Draw all scene entities saves the returned runtime-parameter object in x23",
  },
  {
    address: 0x820f6c,
    role: "draw-all-scene-entities-runtime-param-constructor-arg",
    expectedOpcodeHex: "aa1703e4",
    evidence: "Draw all scene entities passes x23 as x4 to the composite-task batch constructor",
  },
  {
    address: 0x820fe4,
    role: "draw-all-particle-effects-runtime-param-index-zero",
    expectedOpcodeHex: "2a1f03e0",
    evidence: "Draw all particle effects uses the same runtime-parameter accessor index 0",
  },
  {
    address: 0x820fe8,
    role: "draw-all-particle-effects-runtime-param-accessor-call",
    expectedOpcodeHex: "9441f195",
    evidence: "Draw all particle effects calls 0x189d63c(0) before constructing its composite task",
  },
  {
    address: 0x820ff0,
    role: "draw-all-particle-effects-runtime-param-store-temp",
    expectedOpcodeHex: "aa0003f7",
    evidence: "Draw all particle effects saves the returned runtime-parameter object in x23",
  },
  {
    address: 0x82102c,
    role: "draw-all-particle-effects-runtime-param-constructor-arg",
    expectedOpcodeHex: "aa1703e4",
    evidence: "Draw all particle effects passes x23 as x4 to the composite-task batch constructor",
  },
  {
    address: 0x189d63c,
    role: "scene-entity-runtime-param-accessor-page-load",
    expectedOpcodeHex: "b000c3e8",
    evidence: "runtime-parameter accessor prepares the page for global table base 0x311af50",
  },
  {
    address: 0x189d640,
    role: "scene-entity-runtime-param-accessor-base-add",
    expectedOpcodeHex: "913d4108",
    evidence: "runtime-parameter accessor computes table base 0x311af50",
  },
  {
    address: 0x189d644,
    role: "scene-entity-runtime-param-accessor-indexed-load",
    expectedOpcodeHex: "f8605900",
    evidence: "runtime-parameter accessor returns table[index] using w0 as an unsigned 8-byte index",
  },
  {
    address: 0x189d648,
    role: "scene-entity-runtime-param-accessor-return",
    expectedOpcodeHex: "d65f03c0",
    evidence: "runtime-parameter accessor returns the selected table object",
  },
  {
    address: 0x189d460,
    role: "scene-entity-runtime-param-init-table-base",
    expectedOpcodeHex: "913d4108",
    evidence: "runtime-parameter init computes global table base 0x311af50",
  },
  {
    address: 0x189d468,
    role: "scene-entity-runtime-param-init-slot0-slot1-store",
    expectedOpcodeHex: "a9004d14",
    evidence: "runtime-parameter init stores the first two allocated objects into table slots 0 and 1",
  },
  {
    address: 0x189d484,
    role: "scene-entity-runtime-param-init-slot2-store",
    expectedOpcodeHex: "f907b293",
    evidence: "runtime-parameter init stores the third object into 0x311af60",
  },
  {
    address: 0x189d51c,
    role: "scene-entity-runtime-param-init-slot3-store",
    expectedOpcodeHex: "f907b513",
    evidence: "runtime-parameter init stores another object into 0x311af68",
  },
  {
    address: 0x189d534,
    role: "scene-entity-runtime-param-init-slot4-store",
    expectedOpcodeHex: "f907b913",
    evidence: "runtime-parameter init stores another object into 0x311af70",
  },
  {
    address: 0x189d5b0,
    role: "scene-entity-runtime-param-destroy-table-base",
    expectedOpcodeHex: "913d4294",
    evidence: "runtime-parameter shutdown computes table base 0x311af50 before destroying table slots 0 and 1",
  },
  {
    address: 0x189d5b4,
    role: "scene-entity-runtime-param-destroy-array-load",
    expectedOpcodeHex: "f8736a80",
    evidence: "runtime-parameter shutdown iterates the 0x311af50 table entries and calls each object's destructor callback",
  },
  {
    address: 0x189f818,
    role: "scene-entity-runtime-param-slot0-vtable-write",
    expectedOpcodeHex: "f9000288",
    evidence: "0x189f7ec constructs runtime-parameter table slot 0 and writes primary vtable 0x2ab54a0",
  },
  {
    address: 0x189f850,
    role: "scene-entity-runtime-param-slot0-render-object-build-entry",
    expectedOpcodeHex: "f81c0ff7",
    evidence: "slot 0 vtable +0x10 resolves to 0x189f850, the function called by render-command owner builders through x2",
  },
  {
    address: 0x189f8dc,
    role: "scene-entity-runtime-param-slot0-render-object-constructor-call",
    expectedOpcodeHex: "94000007",
    evidence: "slot 0 vtable +0x10 allocates/initializes a per-command runtime object through 0x189f8f8",
  },
  {
    address: 0x189f914,
    role: "scene-entity-runtime-param-returned-object-vtable-store",
    expectedOpcodeHex: "a9000408",
    evidence: "0x189f8f8 writes returned-object vtable 0x2ab54f8 plus the source table/list pointer",
  },
  {
    address: 0x1891818,
    role: "render-owner-source-mapping-count-load",
    expectedOpcodeHex: "b9401008",
    evidence: "0x1891818 loads owner +0x10 as the entry/source mapping count",
  },
  {
    address: 0x1891820,
    role: "render-owner-source-mapping-entry-array-load",
    expectedOpcodeHex: "f9400c09",
    evidence: "0x1891818 loads owner +0x18 as the entry-pointer array",
  },
  {
    address: 0x1891828,
    role: "render-owner-source-mapping-entry-pointer-load",
    expectedOpcodeHex: "f86a592b",
    evidence: "0x1891818 iterates owner +0x18 entries while searching for the current composite-task entry",
  },
  {
    address: 0x189182c,
    role: "render-owner-source-mapping-entry-compare",
    expectedOpcodeHex: "eb01017f",
    evidence: "0x1891818 compares each mapped entry pointer against the caller-provided entry",
  },
  {
    address: 0x1891848,
    role: "render-owner-source-mapping-source-array-load",
    expectedOpcodeHex: "f9400408",
    evidence: "0x1891818 loads owner +0x8 as the paired source-object array after finding an entry match",
  },
  {
    address: 0x189184c,
    role: "render-owner-source-mapping-source-return-load",
    expectedOpcodeHex: "f86a7900",
    evidence: "0x1891818 returns owner +0x8[index], paired with the matched owner +0x18[index] entry",
  },
  {
    address: 0x18916f4,
    role: "render-owner-source-mapping-build-entry-source-load",
    expectedOpcodeHex: "f9401428",
    evidence: "0x18916c8 starts mapping construction by loading the caller-provided entry's holder/list field at +0x28",
  },
  {
    address: 0x18916fc,
    role: "render-owner-source-mapping-build-holder-head-deref",
    expectedOpcodeHex: "f9400108",
    evidence: "0x18916c8 dereferences entry +0x28 to get the first chain node before building paired owner arrays",
  },
  {
    address: 0x1891704,
    role: "render-owner-source-mapping-build-empty-holder-guard",
    expectedOpcodeHex: "b4000308",
    evidence: "0x18916c8 exits when the entry-side holder has no current chain node",
  },
  {
    address: 0x1891710,
    role: "render-owner-source-mapping-small-object-alloc",
    expectedOpcodeHex: "97bc1094",
    evidence: "0x18916c8 allocates a 0x10-byte per-entry source object for the owner mapping",
  },
  {
    address: 0x1891718,
    role: "render-owner-source-mapping-small-object-clear",
    expectedOpcodeHex: "94002a01",
    evidence: "0x18916c8 clears the newly allocated per-entry source object",
  },
  {
    address: 0x1891728,
    role: "render-owner-source-mapping-current-entry-source-holder-load",
    expectedOpcodeHex: "f9400508",
    evidence: "0x18916c8 loads the current chain node +0x8 source holder before reading the source/program table pointer",
  },
  {
    address: 0x189172c,
    role: "render-owner-source-mapping-current-entry-source-pointer-load",
    expectedOpcodeHex: "f9400101",
    evidence: "0x18916c8 loads *(source holder +0) as the source/program table pointer stored at small source object +0",
  },
  {
    address: 0x1891730,
    role: "render-owner-source-mapping-small-object-source-store-call",
    expectedOpcodeHex: "94002a0c",
    evidence: "0x18916c8 stores the source pointer into the small object through 0x189bf60",
  },
  {
    address: 0x1891740,
    role: "render-owner-source-mapping-small-object-entry-store",
    expectedOpcodeHex: "f9000513",
    evidence: "0x18916c8 stores the runtime payload/context pointer at small object +0x8",
  },
  {
    address: 0x1891744,
    role: "render-owner-source-mapping-source-array-append",
    expectedOpcodeHex: "97d6ab7a",
    evidence: "0x18916c8 appends the small source object to the owner source-object array",
  },
  {
    address: 0x1891750,
    role: "render-owner-source-mapping-entry-array-append",
    expectedOpcodeHex: "94000010",
    evidence: "0x18916c8 appends the paired current entry pointer to owner +0x10/+0x18 mapping storage",
  },
  {
    address: 0x1891758,
    role: "render-owner-source-mapping-next-entry-load",
    expectedOpcodeHex: "f9402d08",
    evidence: "0x18916c8 advances through the chain-node +0x58 next pointer after appending the source/entry pair",
  },
  {
    address: 0x18907bc,
    role: "source-table-holder-rebuild-node-size",
    expectedOpcodeHex: "321b03e0",
    evidence: "0x18907a8 prepares a 0x20-byte allocation for rebuilding a holder-backed source mapping object",
  },
  {
    address: 0x18907c8,
    role: "source-table-holder-rebuild-old-head-load",
    expectedOpcodeHex: "f9400281",
    evidence: "0x18907a8 loads holder +0 as the previous chain head/root passed into 0x18915b4",
  },
  {
    address: 0x18907d4,
    role: "source-table-holder-rebuild-mapping-call",
    expectedOpcodeHex: "94000378",
    evidence: "0x18907a8 calls 0x18915b4 with the new holder object, previous root, and new source/program table",
  },
  {
    address: 0x18907d8,
    role: "source-table-holder-rebuild-store",
    expectedOpcodeHex: "f9000a95",
    evidence: "0x18907a8 stores the rebuilt 0x20-byte mapping object at holder +0x10",
  },
  {
    address: 0x18915dc,
    role: "source-table-holder-rebuild-root-map-call",
    expectedOpcodeHex: "9400003b",
    evidence: "0x18915b4 maps the root entry through 0x18916c8 using the new source/program table payload",
  },
  {
    address: 0x18915e0,
    role: "source-table-holder-rebuild-child-chain-load",
    expectedOpcodeHex: "f9401ab6",
    evidence: "0x18915b4 loads root +0x30 to map child entries with the same source/program table payload",
  },
  {
    address: 0x1891614,
    role: "source-table-holder-rebuild-sibling-chain-load",
    expectedOpcodeHex: "f9401eb5",
    evidence: "0x18915b4 advances through root +0x38 sibling entries and maps each through 0x18916c8",
  },
  {
    address: 0xd8003c,
    role: "scene-entity-source-table-mount-holder-address",
    expectedOpcodeHex: "91016000",
    evidence: "0xd8003c derives the scene/entity holder at object +0x58 before mounting a source/program table",
  },
  {
    address: 0xd80040,
    role: "scene-entity-source-table-mount-tail-call",
    expectedOpcodeHex: "142c41da",
    evidence: "0xd8003c tail-calls 0x18907a8, preserving caller x1 as the source/program table payload",
  },
  {
    address: 0x8cab08,
    role: "scene-entity-source-table-mount-clone-call-a",
    expectedOpcodeHex: "943f44d5",
    evidence: "0x8cab08 clones/finalizes a temporary source/program table through 0x189be5c before mounting it",
  },
  {
    address: 0x8cab14,
    role: "scene-entity-source-table-mount-call-a",
    expectedOpcodeHex: "9412d54a",
    evidence: "0x8cab14 mounts the 0x189be5c result onto the scene/entity source holder through 0xd8003c",
  },
  {
    address: 0xbacad8,
    role: "scene-entity-source-table-mount-clone-call-b",
    expectedOpcodeHex: "9433bce1",
    evidence: "0xbacad8 clones/finalizes a multi-entry temporary source/program table through 0x189be5c",
  },
  {
    address: 0xbacae8,
    role: "scene-entity-source-table-mount-call-b",
    expectedOpcodeHex: "94074d55",
    evidence: "0xbacae8 mounts the cloned multi-entry source/program table onto the holder through 0xd8003c",
  },
  {
    address: 0x8d2ca4,
    role: "scene-entity-layout-b-source-table-state0-load",
    expectedOpcodeHex: "f9402261",
    evidence: "layout-B state switch path loads source/program table candidate at object +0x40",
  },
  {
    address: 0x8d2ca8,
    role: "scene-entity-layout-b-source-table-state0-mount-call",
    expectedOpcodeHex: "9412b4e5",
    evidence: "layout-B state switch mounts object +0x40 through 0xd8003c",
  },
  {
    address: 0x8d2ce8,
    role: "scene-entity-layout-b-source-table-state1-load",
    expectedOpcodeHex: "f9402661",
    evidence: "layout-B state switch path loads source/program table candidate at object +0x48",
  },
  {
    address: 0x8d2cec,
    role: "scene-entity-layout-b-source-table-state1-mount-call",
    expectedOpcodeHex: "9412b4d4",
    evidence: "layout-B state switch mounts object +0x48 through 0xd8003c",
  },
  {
    address: 0x8dae90,
    role: "scene-entity-layout-b-source-table-state2-load",
    expectedOpcodeHex: "f9402a61",
    evidence: "layout-B state switch path loads source/program table candidate at object +0x50",
  },
  {
    address: 0x8dae94,
    role: "scene-entity-layout-b-source-table-state2-mount-call",
    expectedOpcodeHex: "9412946a",
    evidence: "layout-B state switch mounts object +0x50 through 0xd8003c",
  },
  {
    address: 0x189bde4,
    role: "source-program-table-entry-builder-wrapper",
    expectedOpcodeHex: "a9bc5ff8",
    evidence: "0x189bde4 wraps source/program table entry writes before tail-calling 0x189bcf8",
  },
  {
    address: 0x189bd18,
    role: "source-program-table-entry-header-store",
    expectedOpcodeHex: "b82a690b",
    evidence: "0x189bcf8 stores the packed source/program entry header into the table +0 array",
  },
  {
    address: 0x189bd7c,
    role: "source-program-table-entry-resource-store",
    expectedOpcodeHex: "b9000525",
    evidence: "0x189bcf8 stores the resolved resource/program id value at the first table entry +0x4",
  },
  {
    address: 0x189bd88,
    role: "source-program-table-entry-count-increment",
    expectedOpcodeHex: "79002149",
    evidence: "0x189bcf8 increments the low-half source/program entry count in table +0x10",
  },
  {
    address: 0x189bdcc,
    role: "source-program-table-entry-payload-pointer-store",
    expectedOpcodeHex: "f8286922",
    evidence: "0x189bcf8 stores the entry payload pointer into the table +0x8 payload array when the payload is pointer-backed",
  },
  {
    address: 0xbaca0c,
    role: "dynamic-source-program-table-temp-init-call",
    expectedOpcodeHex: "9433bc09",
    evidence: "0xbac9d4 initializes the temporary source/program table through 0x189ba30 before walking resource lists",
  },
  {
    address: 0xbaca10,
    role: "dynamic-source-program-table-list-head-load",
    expectedOpcodeHex: "f94002a8",
    evidence: "0xbac9d4 loads the top-level resource-list head from x21 before building table entries",
  },
  {
    address: 0xbaca28,
    role: "dynamic-source-program-table-source-list-load",
    expectedOpcodeHex: "f940050a",
    evidence: "each top-level list node contributes a nested source/resource list from node +0x8",
  },
  {
    address: 0xbaca2c,
    role: "dynamic-source-program-table-nested-head-load",
    expectedOpcodeHex: "f9400149",
    evidence: "0xbac9d4 loads the first nested source/resource node before extracting ids",
  },
  {
    address: 0xbaca3c,
    role: "dynamic-source-program-table-resource-id-load",
    expectedOpcodeHex: "b9400129",
    evidence: "0xbac9d4 reads a 32-bit resource/program id from each nested node",
  },
  {
    address: 0xbaca40,
    role: "dynamic-source-program-table-resource-id-scratch-store",
    expectedOpcodeHex: "b82b7b09",
    evidence: "the extracted ids are stored into the stack scratch array passed to 0x189bde4",
  },
  {
    address: 0xbaca44,
    role: "dynamic-source-program-table-nested-next-load",
    expectedOpcodeHex: "f86b7949",
    evidence: "0xbac9d4 advances through the nested pointer list until the null terminator",
  },
  {
    address: 0xbaca50,
    role: "dynamic-source-program-table-resource-count-mask",
    expectedOpcodeHex: "12007969",
    evidence: "0xbac9d4 bounds the nested id count before selecting the entry build mode",
  },
  {
    address: 0xbaca58,
    role: "dynamic-source-program-table-resource-count-max-check",
    expectedOpcodeHex: "71000d3f",
    evidence: "only 1..4 extracted ids are accepted by the native dynamic table producer",
  },
  {
    address: 0xbaca6c,
    role: "dynamic-source-program-table-mode-1",
    expectedOpcodeHex: "f9400105",
    evidence: "one extracted id selects 0x189bde4 mode 1 with x5 loaded from the top-level node +0",
  },
  {
    address: 0xbaca80,
    role: "dynamic-source-program-table-mode-3",
    expectedOpcodeHex: "f9400105",
    evidence: "three extracted ids select 0x189bde4 mode 3 with x5 loaded from the top-level node +0",
  },
  {
    address: 0xbaca94,
    role: "dynamic-source-program-table-mode-4",
    expectedOpcodeHex: "f9400105",
    evidence: "four extracted ids select 0x189bde4 mode 4 with x5 loaded from the top-level node +0",
  },
  {
    address: 0xbacaa8,
    role: "dynamic-source-program-table-mode-2",
    expectedOpcodeHex: "f9400105",
    evidence: "two extracted ids select 0x189bde4 mode 2 with x5 loaded from the top-level node +0",
  },
  {
    address: 0xbacac0,
    role: "dynamic-source-program-table-entry-writer-call",
    expectedOpcodeHex: "9433bcc9",
    evidence: "0xbac9d4 calls 0x189bde4 once per accepted top-level list node to append a source/program table entry",
  },
  {
    address: 0xbacac4,
    role: "dynamic-source-program-table-next-list-load",
    expectedOpcodeHex: "f8408ea8",
    evidence: "0xbac9d4 advances the top-level list through x21 +0x8 and repeats entry construction",
  },
  {
    address: 0xbacad8,
    role: "dynamic-source-program-table-clone-call",
    expectedOpcodeHex: "9433bce1",
    evidence: "after at least one entry, 0xbac9d4 finalizes/clones the temporary table through 0x189be5c",
  },
  {
    address: 0xbacae0,
    role: "dynamic-source-program-table-destination-store",
    expectedOpcodeHex: "f9000280",
    evidence: "0xbac9d4 stores the cloned source/program table into the caller-provided destination pointer",
  },
  {
    address: 0xbacae8,
    role: "dynamic-source-program-table-mount-call",
    expectedOpcodeHex: "94074d55",
    evidence: "0xbac9d4 immediately mounts the cloned dynamic table through 0xd8003c",
  },
  {
    address: 0x8abfa0,
    role: "dynamic-source-program-table-direct-caller-scene-object-load-a",
    expectedOpcodeHex: "f9402660",
    evidence: "one direct caller passes scene/entity object [x19 +0x48] as x0 to 0xbac9d4",
  },
  {
    address: 0x8abfa4,
    role: "dynamic-source-program-table-direct-caller-resource-list-load-a",
    expectedOpcodeHex: "f94016e2",
    evidence: "the same caller can pass resource list [x23 +0x28] as x2 to 0xbac9d4",
  },
  {
    address: 0x8abfc0,
    role: "dynamic-source-program-table-direct-caller-scene-object-load-b",
    expectedOpcodeHex: "f9402660",
    evidence: "the alternate branch also passes scene/entity object [x19 +0x48] as x0 to 0xbac9d4",
  },
  {
    address: 0x8abfc4,
    role: "dynamic-source-program-table-direct-caller-resource-list-load-b",
    expectedOpcodeHex: "f9401702",
    evidence: "the alternate branch can pass resource list [x24 +0x28] as x2 to 0xbac9d4",
  },
  {
    address: 0x8abfc8,
    role: "dynamic-source-program-table-direct-caller-destination",
    expectedOpcodeHex: "91014261",
    evidence: "the direct caller passes x19 +0x50 as the destination for the cloned dynamic source/program table",
  },
  {
    address: 0x8abfcc,
    role: "dynamic-source-program-table-direct-caller-call",
    expectedOpcodeHex: "940c0282",
    evidence: "the direct caller enters 0xbac9d4 with scene/entity object, destination pointer, and selected resource list",
  },
  {
    address: 0x8d551c,
    role: "dynamic-source-program-table-selector-list-load",
    expectedOpcodeHex: "f9400c08",
    evidence: "the selector wrapper loads object +0x18 as a chain of candidate nodes before tail-calling 0xbac9d4",
  },
  {
    address: 0x8d5520,
    role: "dynamic-source-program-table-selector-arg-preserve",
    expectedOpcodeHex: "aa0103e2",
    evidence: "the selector wrapper preserves its original x1 as x2 for the later 0xbac9d4 resource-list argument",
  },
  {
    address: 0x8d5530,
    role: "dynamic-source-program-table-selector-node-payload-load",
    expectedOpcodeHex: "f940050a",
    evidence: "the selector wrapper reads candidate node +0x8 before checking the node class/id field",
  },
  {
    address: 0x8d5534,
    role: "dynamic-source-program-table-selector-node-class-load",
    expectedOpcodeHex: "b940a54a",
    evidence: "the selector wrapper compares candidate payload +0xa4 against the current global class/id value",
  },
  {
    address: 0x8d5540,
    role: "dynamic-source-program-table-selector-next-node-load",
    expectedOpcodeHex: "f9401108",
    evidence: "the selector wrapper walks candidate nodes through node +0x20 when the class/id does not match",
  },
  {
    address: 0x8d5548,
    role: "dynamic-source-program-table-selector-destination",
    expectedOpcodeHex: "9100a001",
    evidence: "the selector wrapper passes object +0x28 as the cloned-table destination pointer",
  },
  {
    address: 0x8d554c,
    role: "dynamic-source-program-table-selector-selected-node-move",
    expectedOpcodeHex: "aa0803e0",
    evidence: "the selector wrapper passes the matched candidate node, or null, as x0 to 0xbac9d4",
  },
  {
    address: 0x8d5550,
    role: "dynamic-source-program-table-selector-tail-call",
    expectedOpcodeHex: "140b5d21",
    evidence: "the selector wrapper tail-calls 0xbac9d4 after selecting the candidate node and destination pointer",
  },
  {
    address: 0x8abea8,
    role: "dynamic-source-program-table-upstream-arg-resource-move",
    expectedOpcodeHex: "aa0203f8",
    evidence: "0x8abe6c preserves input x2 as the caller-provided resource-slot base before selecting source/program table inputs",
  },
  {
    address: 0x8abeb8,
    role: "dynamic-source-program-table-upstream-owner-store",
    expectedOpcodeHex: "f9001c01",
    evidence: "0x8abe6c stores input x1 at object +0x38, proving this is an owner/config object path rather than a viewer-side heuristic",
  },
  {
    address: 0x8abebc,
    role: "dynamic-source-program-table-upstream-default-array-load",
    expectedOpcodeHex: "f940ec28",
    evidence: "0x8abe6c loads an owner/config array from x1 +0x1d8 before selecting fallback resource slots",
  },
  {
    address: 0x8abecc,
    role: "dynamic-source-program-table-upstream-default-node-load",
    expectedOpcodeHex: "f87c791a",
    evidence: "0x8abe6c indexes the x1 +0x1d8 array by the current global type/class index to get a default resource node",
  },
  {
    address: 0x8abed0,
    role: "dynamic-source-program-table-upstream-primary-slot-load",
    expectedOpcodeHex: "f8408f00",
    evidence: "0x8abe6c pre-indexes the caller resource-slot base to x2 +0x8 and loads the primary candidate resource pointer",
  },
  {
    address: 0x8abedc,
    role: "dynamic-source-program-table-upstream-primary-validate-call",
    expectedOpcodeHex: "94130601",
    evidence: "the primary candidate resource pointer is validated through 0xd6d6e0 before use",
  },
  {
    address: 0x8abee0,
    role: "dynamic-source-program-table-upstream-primary-candidate-move",
    expectedOpcodeHex: "aa1803f7",
    evidence: "when valid, x23 is set to the caller-provided primary resource slot",
  },
  {
    address: 0x8abee8,
    role: "dynamic-source-program-table-upstream-primary-fallback",
    expectedOpcodeHex: "aa1903f7",
    evidence: "when the primary slot is absent/invalid, x23 falls back to the default resource node +0x8",
  },
  {
    address: 0x8abeec,
    role: "dynamic-source-program-table-upstream-secondary-slot-load",
    expectedOpcodeHex: "f9400aa0",
    evidence: "0x8abe6c also checks the caller resource-slot secondary pointer at x2 +0x10",
  },
  {
    address: 0x8abef4,
    role: "dynamic-source-program-table-upstream-secondary-validate-call",
    expectedOpcodeHex: "941305fb",
    evidence: "the secondary candidate resource pointer is validated through 0xd6d6e0 before use",
  },
  {
    address: 0x8abefc,
    role: "dynamic-source-program-table-upstream-secondary-fallback",
    expectedOpcodeHex: "aa1903f8",
    evidence: "when the secondary slot is absent/invalid, x24 falls back to the same default resource node +0x8",
  },
  {
    address: 0x8abf00,
    role: "dynamic-source-program-table-upstream-primary-resource-load",
    expectedOpcodeHex: "f94002e0",
    evidence: "0x8abe6c validates the selected x23 slot's resource pointer before creating the scene/entity object",
  },
  {
    address: 0x8abf04,
    role: "dynamic-source-program-table-upstream-primary-resource-validate-call",
    expectedOpcodeHex: "941305f7",
    evidence: "0x8abe6c validates the selected primary resource pointer through 0xd6d6e0",
  },
  {
    address: 0x8abf0c,
    role: "dynamic-source-program-table-upstream-secondary-resource-load",
    expectedOpcodeHex: "f9400700",
    evidence: "if the primary selected pointer is invalid, 0x8abe6c tries the selected secondary slot's resource pointer",
  },
  {
    address: 0x8abf10,
    role: "dynamic-source-program-table-upstream-secondary-resource-validate-call",
    expectedOpcodeHex: "941305f4",
    evidence: "0x8abe6c validates the selected secondary resource pointer through 0xd6d6e0",
  },
  {
    address: 0x8abf14,
    role: "dynamic-source-program-table-upstream-no-resource-exit",
    expectedOpcodeHex: "34003320",
    evidence: "when neither selected resource pointer validates, 0x8abe6c exits before table production",
  },
  {
    address: 0x8abf24,
    role: "dynamic-source-program-table-upstream-scene-object-create-call",
    expectedOpcodeHex: "943f7e65",
    evidence: "after selecting valid resource input, 0x8abe6c creates/resolves a scene/entity object through 0x188b8b8",
  },
  {
    address: 0x8abf28,
    role: "dynamic-source-program-table-upstream-scene-object-store",
    expectedOpcodeHex: "f9002660",
    evidence: "0x8abe6c stores the created/resolved scene/entity object at object +0x48, later passed to 0xbac9d4",
  },
  {
    address: 0x8abf78,
    role: "dynamic-source-program-table-upstream-primary-attach-resource-load",
    expectedOpcodeHex: "f94002e1",
    evidence: "one branch attaches the selected primary resource pointer to the scene/entity object through vtable +0x20",
  },
  {
    address: 0x8abf84,
    role: "dynamic-source-program-table-upstream-primary-attach-call",
    expectedOpcodeHex: "d63f0120",
    evidence: "primary resource attachment calls the scene/entity object vtable +0x20",
  },
  {
    address: 0x8abfb0,
    role: "dynamic-source-program-table-upstream-secondary-attach-resource-load",
    expectedOpcodeHex: "f9400701",
    evidence: "the alternate branch attaches the selected secondary resource pointer to the scene/entity object through vtable +0x20",
  },
  {
    address: 0x8abfbc,
    role: "dynamic-source-program-table-upstream-secondary-attach-call",
    expectedOpcodeHex: "d63f0120",
    evidence: "secondary resource attachment calls the scene/entity object vtable +0x20",
  },
  {
    address: 0x8abfd4,
    role: "dynamic-source-program-table-upstream-type-byte-load",
    expectedOpcodeHex: "3940c2e9",
    evidence: "after table production, 0x8abe6c copies the selected primary slot type byte from x23 +0x30",
  },
  {
    address: 0x8abfe0,
    role: "dynamic-source-program-table-upstream-type-byte-store",
    expectedOpcodeHex: "3900cd09",
    evidence: "the selected primary slot type byte is stored onto the created scene/entity object at +0x33",
  },
  {
    address: 0x8ac00c,
    role: "dynamic-source-program-table-upstream-transform-update-call",
    expectedOpcodeHex: "94134f2c",
    evidence: "after source/program table mount, 0x8abe6c calls 0xd7fcbc to initialize/update scene/entity transform state",
  },
  {
    address: 0x8ccaa4,
    role: "dynamic-source-program-table-selector-caller-config-load",
    expectedOpcodeHex: "f9401c28",
    evidence: "0x8cca64 loads caller config/resource pointer x19 +0x38 before deciding whether to invoke the selector path",
  },
  {
    address: 0x8ccaac,
    role: "dynamic-source-program-table-selector-caller-config-validate-call",
    expectedOpcodeHex: "9412830d",
    evidence: "0x8cca64 validates x19 +0x38 through 0xd6d6e0 before invoking the selector path",
  },
  {
    address: 0x8ccab0,
    role: "dynamic-source-program-table-selector-caller-valid-branch",
    expectedOpcodeHex: "34000320",
    evidence: "when x19 +0x38 fails validation, 0x8cca64 skips the 0x8d551c selector path",
  },
  {
    address: 0x8ccab8,
    role: "dynamic-source-program-table-selector-caller-parent-index-load",
    expectedOpcodeHex: "b940c901",
    evidence: "for the selector path, 0x8cca64 loads the parent registry/type index from global 0x30350c8",
  },
  {
    address: 0x8ccac0,
    role: "dynamic-source-program-table-selector-caller-parent-create-call",
    expectedOpcodeHex: "943efb7e",
    evidence: "0x8cca64 creates/resolves the selector parent object through 0x188b8b8",
  },
  {
    address: 0x8ccac8,
    role: "dynamic-source-program-table-selector-caller-child-index-load",
    expectedOpcodeHex: "b949e501",
    evidence: "0x8cca64 loads the child registry/type index from global 0x30349e4 for the selector child object",
  },
  {
    address: 0x8ccad0,
    role: "dynamic-source-program-table-selector-caller-child-create-call",
    expectedOpcodeHex: "943efb7a",
    evidence: "0x8cca64 creates/resolves the selector child object through 0x188b8b8 before attaching payload and invoking 0x8d551c",
  },
  {
    address: 0x8ccad8,
    role: "dynamic-source-program-table-selector-caller-child-attach-payload-load",
    expectedOpcodeHex: "f9401a61",
    evidence: "0x8cca64 loads x19 +0x30 as payload/resource data for the selector child object vtable +0x20 attach call",
  },
  {
    address: 0x8ccae4,
    role: "dynamic-source-program-table-selector-caller-child-attach-call",
    expectedOpcodeHex: "d63f0100",
    evidence: "the selector child object receives x19 +0x30 through its vtable +0x20 before 0x8d551c is invoked",
  },
  {
    address: 0x8ccae8,
    role: "dynamic-source-program-table-selector-caller-selector-arg-load",
    expectedOpcodeHex: "f9403661",
    evidence: "0x8cca64 loads x19 +0x68 as the resource/list argument passed to 0x8d551c",
  },
  {
    address: 0x8ccaec,
    role: "dynamic-source-program-table-selector-caller-selector-object-move",
    expectedOpcodeHex: "aa1603e0",
    evidence: "0x8cca64 passes the selector parent object as x0 to 0x8d551c",
  },
  {
    address: 0x8ccaf0,
    role: "dynamic-source-program-table-selector-caller-selector-call",
    expectedOpcodeHex: "9400228b",
    evidence: "0x8cca64 invokes 0x8d551c with the selector parent object and x19 +0x68 resource/list argument",
  },
  {
    address: 0x8ccaf8,
    role: "dynamic-source-program-table-selector-caller-post-index-load",
    expectedOpcodeHex: "b949f101",
    evidence: "after the selector call, 0x8cca64 loads global 0x30349f0 to create/resolve an additional child object",
  },
  {
    address: 0x8ccb00,
    role: "dynamic-source-program-table-selector-caller-post-child-create-call",
    expectedOpcodeHex: "943efb6e",
    evidence: "after the selector call, 0x8cca64 creates/resolves a second child object through 0x188b8b8",
  },
  {
    address: 0x8ccb04,
    role: "dynamic-source-program-table-selector-caller-post-config-load",
    expectedOpcodeHex: "f9401e61",
    evidence: "0x8cca64 passes x19 +0x38 to the post-selector setup helper after creating the second child object",
  },
  {
    address: 0x8ccb08,
    role: "dynamic-source-program-table-selector-caller-post-list-arg",
    expectedOpcodeHex: "91010262",
    evidence: "0x8cca64 passes x19 +0x40 as the second post-selector setup argument",
  },
  {
    address: 0x8ccb0c,
    role: "dynamic-source-program-table-selector-caller-post-apply-call",
    expectedOpcodeHex: "97ff9f21",
    evidence: "0x8cca64 calls 0x8b4790 for post-selector setup using x19 +0x38 and x19 +0x40",
  },
  {
    address: 0x79e68c,
    role: "dynamic-source-program-table-selector-child-lazy-init-flag-load",
    expectedOpcodeHex: "3967a109",
    evidence: "lazy initializer for global 0x30349e4 reads the adjacent initialized flag at 0x30349e8",
  },
  {
    address: 0x79e698,
    role: "dynamic-source-program-table-selector-child-lazy-init-type-record-load",
    expectedOpcodeHex: "f9461929",
    evidence: "lazy initializer for global 0x30349e4 loads the shared type-record pointer from 0x2adec30",
  },
  {
    address: 0x79e6a4,
    role: "dynamic-source-program-table-selector-child-lazy-init-flag-store",
    expectedOpcodeHex: "f904f50b",
    evidence: "lazy initializer for global 0x30349e4 stores the initialized flag before copying the type index",
  },
  {
    address: 0x79e6ac,
    role: "dynamic-source-program-table-selector-child-lazy-init-global-store",
    expectedOpcodeHex: "b909e549",
    evidence: "lazy initializer for global 0x30349e4 copies the type-record index word into that global",
  },
  {
    address: 0x79e6b8,
    role: "dynamic-source-program-table-post-child-lazy-init-flag-load",
    expectedOpcodeHex: "3967e109",
    evidence: "lazy initializer for global 0x30349f0 reads the adjacent initialized flag at 0x30349f8",
  },
  {
    address: 0x79e6c4,
    role: "dynamic-source-program-table-post-child-lazy-init-type-record-load",
    expectedOpcodeHex: "f9461929",
    evidence: "lazy initializer for global 0x30349f0 loads the shared type-record pointer from 0x2adec30",
  },
  {
    address: 0x79e6d0,
    role: "dynamic-source-program-table-post-child-lazy-init-flag-store",
    expectedOpcodeHex: "f904fd0b",
    evidence: "lazy initializer for global 0x30349f0 stores the initialized flag before copying the type index",
  },
  {
    address: 0x79e6d8,
    role: "dynamic-source-program-table-post-child-lazy-init-global-store",
    expectedOpcodeHex: "b909f149",
    evidence: "lazy initializer for global 0x30349f0 copies the type-record index word into that global",
  },
  {
    address: 0x79f26c,
    role: "dynamic-source-program-table-parent-lazy-init-flag-load",
    expectedOpcodeHex: "39434109",
    evidence: "lazy initializer for global 0x30350c8 reads the adjacent initialized flag at 0x30350d0",
  },
  {
    address: 0x79f278,
    role: "dynamic-source-program-table-parent-lazy-init-type-record-load",
    expectedOpcodeHex: "f9461929",
    evidence: "lazy initializer for global 0x30350c8 loads the shared type-record pointer from 0x2adec30",
  },
  {
    address: 0x79f284,
    role: "dynamic-source-program-table-parent-lazy-init-flag-store",
    expectedOpcodeHex: "f900690b",
    evidence: "lazy initializer for global 0x30350c8 stores the initialized flag before copying the type index",
  },
  {
    address: 0x79f28c,
    role: "dynamic-source-program-table-parent-lazy-init-global-store",
    expectedOpcodeHex: "b900c949",
    evidence: "lazy initializer for global 0x30350c8 copies the type-record index word into that global",
  },
  {
    address: 0x8d543c,
    role: "dynamic-source-program-table-parent-type-record-count-load",
    expectedOpcodeHex: "b8686809",
    evidence: "parent selector type registration reads the current type-record count before allocating a 0x2e8 stride record",
  },
  {
    address: 0x8d5460,
    role: "dynamic-source-program-table-parent-type-callback-pair-store",
    expectedOpcodeHex: "a90b2d48",
    evidence: "parent selector type registration stores its two callback/function pointers into the type record at +0xb0",
  },
  {
    address: 0x8d546c,
    role: "dynamic-source-program-table-parent-type-record-store",
    expectedOpcodeHex: "2914ad49",
    evidence: "parent selector type registration stores [type index, 0x30] into the shared type-record fields at +0xa4",
  },
  {
    address: 0x8d548c,
    role: "dynamic-source-program-table-parent-type-global-store",
    expectedOpcodeHex: "b900c909",
    evidence: "parent selector type registration stores the recovered type index into global 0x30350c8",
  },
  {
    address: 0xd7fc30,
    role: "dynamic-source-program-table-selector-child-type-callback-pair-store",
    expectedOpcodeHex: "a90b2d48",
    evidence: "selector child type registration stores its two callback/function pointers into the type record at +0xb0",
  },
  {
    address: 0xd7fc38,
    role: "dynamic-source-program-table-selector-child-type-size-literal",
    expectedOpcodeHex: "5280170b",
    evidence: "selector child type registration uses literal 0xb8 as the type-record size/flags word",
  },
  {
    address: 0xd7fc3c,
    role: "dynamic-source-program-table-selector-child-type-record-store",
    expectedOpcodeHex: "2914ad49",
    evidence: "selector child type registration stores [type index, 0xb8] into the shared type-record fields at +0xa4",
  },
  {
    address: 0xd7fc5c,
    role: "dynamic-source-program-table-selector-child-type-global-store",
    expectedOpcodeHex: "b909e509",
    evidence: "selector child type registration stores the recovered type index into global 0x30349e4",
  },
  {
    address: 0x8b415c,
    role: "dynamic-source-program-table-post-child-type-record-count-load",
    expectedOpcodeHex: "b8686809",
    evidence: "post-selector child type registration reads the current type-record count before allocating a 0x2e8 stride record",
  },
  {
    address: 0x8b4180,
    role: "dynamic-source-program-table-post-child-type-callback-pair-store",
    expectedOpcodeHex: "a90b214b",
    evidence: "post-selector child type registration stores its two callback/function pointers into the type record at +0xb0",
  },
  {
    address: 0x8b4188,
    role: "dynamic-source-program-table-post-child-type-flag-literal",
    expectedOpcodeHex: "52801f4b",
    evidence: "post-selector child type registration uses literal 0xfa in the type-record control field",
  },
  {
    address: 0x8b4190,
    role: "dynamic-source-program-table-post-child-type-size-literal",
    expectedOpcodeHex: "5283a30c",
    evidence: "post-selector child type registration stores literal 0x1d18 as the type-record size/stride word",
  },
  {
    address: 0x8b41b4,
    role: "dynamic-source-program-table-post-child-type-record-store",
    expectedOpcodeHex: "2914b149",
    evidence: "post-selector child type registration stores [type index, 0x1d18] into the shared type-record fields at +0xa4",
  },
  {
    address: 0x8b41bc,
    role: "dynamic-source-program-table-post-child-type-global-store",
    expectedOpcodeHex: "b909f109",
    evidence: "post-selector child type registration stores the recovered type index into global 0x30349f0",
  },
  {
    address: 0x8b47c0,
    role: "dynamic-source-program-table-post-child-setup-init-vslot-load",
    expectedOpcodeHex: "f9400908",
    evidence: "0x8b4790 loads the post-selector child object's vtable +0x10 before initializing its runtime slots",
  },
  {
    address: 0x8b47c4,
    role: "dynamic-source-program-table-post-child-setup-init-vcall",
    expectedOpcodeHex: "d63f0100",
    evidence: "0x8b4790 calls the post-selector child object's vtable +0x10 before applying resource/config data",
  },
  {
    address: 0x8b47cc,
    role: "dynamic-source-program-table-post-child-setup-payload-clone-call",
    expectedOpcodeHex: "943f9a63",
    evidence: "0x8b4790 clones/builds payload data from x19 +0x38 through 0x189b158",
  },
  {
    address: 0x8b47d0,
    role: "dynamic-source-program-table-post-child-setup-payload-store-a",
    expectedOpcodeHex: "f90df660",
    evidence: "0x8b4790 stores the cloned payload into post-selector child object +0x1be8",
  },
  {
    address: 0x8b47d4,
    role: "dynamic-source-program-table-post-child-setup-payload-store-b",
    expectedOpcodeHex: "f9001660",
    evidence: "0x8b4790 also stores the cloned payload into post-selector child object +0x28",
  },
  {
    address: 0x8b47ec,
    role: "dynamic-source-program-table-post-child-setup-primary-transform-call",
    expectedOpcodeHex: "94000025",
    evidence: "0x8b4790 applies the primary x19 +0x40 transform/config block through 0x8b4880",
  },
  {
    address: 0xe3c58c,
    role: "render-owner-source-mapping-source-vector-count-load",
    expectedOpcodeHex: "b9400269",
    evidence: "source-vector append helper reads its vector count before appending owner +0x8 source objects",
  },
  {
    address: 0xe3c590,
    role: "render-owner-source-mapping-source-vector-count-increment",
    expectedOpcodeHex: "11000528",
    evidence: "source-vector append helper increments the vector count by one",
  },
  {
    address: 0xe3c594,
    role: "render-owner-source-mapping-source-vector-count-store",
    expectedOpcodeHex: "b9000268",
    evidence: "source-vector append helper stores the incremented vector count",
  },
  {
    address: 0xe3c598,
    role: "render-owner-source-mapping-source-vector-array-load",
    expectedOpcodeHex: "f9400669",
    evidence: "source-vector append helper loads the backing array pointer from the vector object",
  },
  {
    address: 0xe3c59c,
    role: "render-owner-source-mapping-source-vector-payload-load",
    expectedOpcodeHex: "f940028a",
    evidence: "source-vector append helper loads the 8-byte payload pointer supplied by the caller",
  },
  {
    address: 0xe3c5a0,
    role: "render-owner-source-mapping-source-vector-slot-address",
    expectedOpcodeHex: "8b284d28",
    evidence: "source-vector append helper computes the destination slot from the previous count",
  },
  {
    address: 0xe3c5a4,
    role: "render-owner-source-mapping-source-vector-payload-store",
    expectedOpcodeHex: "f81f810a",
    evidence: "source-vector append helper stores the payload pointer into the backing array slot",
  },
  {
    address: 0x18917f0,
    role: "render-owner-source-mapping-entry-vector-count-load",
    expectedOpcodeHex: "b9400269",
    evidence: "entry-vector append helper reads its vector count before appending owner +0x18 entry pointers",
  },
  {
    address: 0x18917f4,
    role: "render-owner-source-mapping-entry-vector-count-increment",
    expectedOpcodeHex: "11000528",
    evidence: "entry-vector append helper increments the vector count by one",
  },
  {
    address: 0x18917f8,
    role: "render-owner-source-mapping-entry-vector-count-store",
    expectedOpcodeHex: "b9000268",
    evidence: "entry-vector append helper stores the incremented vector count",
  },
  {
    address: 0x18917fc,
    role: "render-owner-source-mapping-entry-vector-array-load",
    expectedOpcodeHex: "f9400669",
    evidence: "entry-vector append helper loads the backing array pointer from the vector object",
  },
  {
    address: 0x1891800,
    role: "render-owner-source-mapping-entry-vector-payload-load",
    expectedOpcodeHex: "f940028a",
    evidence: "entry-vector append helper loads the 8-byte entry pointer supplied by the caller",
  },
  {
    address: 0x1891804,
    role: "render-owner-source-mapping-entry-vector-slot-address",
    expectedOpcodeHex: "8b284d28",
    evidence: "entry-vector append helper computes the destination slot from the previous count",
  },
  {
    address: 0x1891808,
    role: "render-owner-source-mapping-entry-vector-payload-store",
    expectedOpcodeHex: "f81f810a",
    evidence: "entry-vector append helper stores the entry pointer into the backing array slot",
  },
  {
    address: 0x1891758,
    role: "render-owner-source-mapping-next-entry-load",
    expectedOpcodeHex: "f9402d08",
    evidence: "0x18916c8 advances through the current entry +0x58 chain while building mapping pairs",
  },
  {
    address: 0x189f91c,
    role: "scene-entity-runtime-param-source-table-load",
    expectedOpcodeHex: "f9400028",
    evidence: "returned-object constructor loads small source object +0 as the source/program table base",
  },
  {
    address: 0x189f92c,
    role: "scene-entity-runtime-param-source-table-indexed-address",
    expectedOpcodeHex: "8b340d08",
    evidence: "returned-object constructor indexes the source/program table by the runtime source index byte",
  },
  {
    address: 0x189f930,
    role: "scene-entity-runtime-param-sort-key-source-entry-load",
    expectedOpcodeHex: "f9400516",
    evidence: "returned-object constructor loads the selected source entry pointer used to build the queue sort key",
  },
  {
    address: 0x189f940,
    role: "scene-entity-runtime-param-sort-key-source-flag-load",
    expectedOpcodeHex: "f9400ac8",
    evidence: "returned-object constructor reads source entry +0x10 flags for sort-key flag bits",
  },
  {
    address: 0x189f944,
    role: "scene-entity-runtime-param-sort-key-pointer-low-bits",
    expectedOpcodeHex: "92407ec9",
    evidence: "sort-key construction starts with the low 32 bits of the selected source entry pointer",
  },
  {
    address: 0x189f948,
    role: "scene-entity-runtime-param-sort-key-mode-nibble",
    expectedOpcodeHex: "12000eaa",
    evidence: "sort-key construction masks the runtime mode/slot argument to a low nibble",
  },
  {
    address: 0x189f950,
    role: "scene-entity-runtime-param-sort-key-mode-insert",
    expectedOpcodeHex: "b3600d49",
    evidence: "sort-key construction inserts the runtime mode nibble into bits 32..35",
  },
  {
    address: 0x189f954,
    role: "scene-entity-runtime-param-sort-key-flag-shift",
    expectedOpcodeHex: "d346fd0a",
    evidence: "sort-key construction shifts source entry flags for the next sort-key bit",
  },
  {
    address: 0x189f958,
    role: "scene-entity-runtime-param-sort-key-flag-test",
    expectedOpcodeHex: "f26c0d1f",
    evidence: "sort-key construction tests source entry flag mask 0xf00000",
  },
  {
    address: 0x189f95c,
    role: "scene-entity-runtime-param-sort-key-flag-insert",
    expectedOpcodeHex: "b35c0149",
    evidence: "sort-key construction inserts a flag-derived bit into the high sort-key region",
  },
  {
    address: 0x189f960,
    role: "scene-entity-runtime-param-sort-key-category-bit-select",
    expectedOpcodeHex: "9a8b03e8",
    evidence: "sort-key construction conditionally selects category bit 0x2000000000 from source entry flags",
  },
  {
    address: 0x189f964,
    role: "scene-entity-runtime-param-sort-key-or",
    expectedOpcodeHex: "aa080128",
    evidence: "sort-key construction ORs pointer, mode, flag, and category components",
  },
  {
    address: 0x189f968,
    role: "scene-entity-runtime-param-sort-key-toggle",
    expectedOpcodeHex: "d25c0108",
    evidence: "sort-key construction toggles high bit 0x1000000000 before storing the key",
  },
  {
    address: 0x189f96c,
    role: "scene-entity-runtime-param-sort-key-store",
    expectedOpcodeHex: "f9000a68",
    evidence: "returned-object constructor stores the computed queue sort key at returned object +0x10",
  },
  {
    address: 0x189fa40,
    role: "scene-entity-runtime-param-sort-key-accessor",
    expectedOpcodeHex: "f9400800",
    evidence: "returned-object vtable +0x10 accessor returns the stored queue sort key from returned object +0x10",
  },
  {
    address: 0x189f9a0,
    role: "scene-entity-runtime-param-program-apply-source-object-load",
    expectedOpcodeHex: "f9400434",
    evidence: "returned-object program-apply path reloads the small source object from returned object +0x8",
  },
  {
    address: 0x189f9a4,
    role: "scene-entity-runtime-param-program-apply-source-index-load",
    expectedOpcodeHex: "39406028",
    evidence: "returned-object program-apply path reloads the selected source index byte from returned object +0x18",
  },
  {
    address: 0x189f9ac,
    role: "scene-entity-runtime-param-program-apply-source-table-load",
    expectedOpcodeHex: "f9400289",
    evidence: "returned-object program-apply path loads the same small source object +0 table",
  },
  {
    address: 0x189f9b4,
    role: "scene-entity-runtime-param-program-apply-source-entry-load",
    expectedOpcodeHex: "f9400515",
    evidence: "returned-object program-apply path selects source table entry[index] +0x8",
  },
  {
    address: 0x189f9c8,
    role: "scene-entity-runtime-param-program-pointer-load",
    expectedOpcodeHex: "f94002a8",
    evidence: "program-apply path loads source entry +0 as the GL program wrapper pointer",
  },
  {
    address: 0x189f9e0,
    role: "scene-entity-runtime-param-program-id-load",
    expectedOpcodeHex: "b9400100",
    evidence: "program-apply path loads the GL program id from the program wrapper before glUseProgram",
  },
  {
    address: 0x189f9e4,
    role: "scene-entity-runtime-param-gl-use-program-call",
    expectedOpcodeHex: "97bbbebf",
    evidence: "program-apply path calls glUseProgram with the recovered source entry program id",
  },
  {
    address: 0x189f9e8,
    role: "scene-entity-runtime-param-program-param-load",
    expectedOpcodeHex: "f94006a0",
    evidence: "program-apply path loads source entry +0x8 as the program parameter payload",
  },
  {
    address: 0x189f9ec,
    role: "scene-entity-runtime-param-program-param-fallback-load",
    expectedOpcodeHex: "f9400681",
    evidence: "program-apply path loads small source object +0x8 as a fallback/current parameter payload",
  },
  {
    address: 0x189fa00,
    role: "scene-entity-runtime-param-program-param-apply-call",
    expectedOpcodeHex: "97fff425",
    evidence: "program-apply path applies the selected/fallback parameter payload through 0x189ca94",
  },
  {
    address: 0x189f984,
    role: "scene-entity-runtime-param-slot0-vslot-18-dispatch",
    expectedOpcodeHex: "f9400008",
    evidence: "slot 0 vtable +0x18 resolves to a dispatcher that forwards through vtable +0x28",
  },
  {
    address: 0x189234c,
    role: "render-command-a-runtime-param-result-vslot-load",
    expectedOpcodeHex: "f9400908",
    evidence: "render-command A builder calls the object returned by x2 vtable +0x10 through its own vtable +0x10",
  },
  {
    address: 0x1892350,
    role: "render-command-a-runtime-param-result-vcall",
    expectedOpcodeHex: "d63f0100",
    evidence: "render-command A builder invokes the returned object's vtable +0x10 accessor",
  },
  {
    address: 0x1892354,
    role: "render-command-a-runtime-param-result-store",
    expectedOpcodeHex: "f9000e60",
    evidence: "render-command A builder stores the returned object's vtable +0x10 result at queued command +0x18",
  },
  {
    address: 0x18938c8,
    role: "render-command-b-runtime-param-result-vslot-load",
    expectedOpcodeHex: "f9400908",
    evidence: "render-command B builder calls the object returned by x2 vtable +0x10 through its own vtable +0x10",
  },
  {
    address: 0x18938cc,
    role: "render-command-b-runtime-param-result-vcall",
    expectedOpcodeHex: "d63f0100",
    evidence: "render-command B builder invokes the returned object's vtable +0x10 accessor",
  },
  {
    address: 0x18938d4,
    role: "render-command-b-runtime-param-result-store",
    expectedOpcodeHex: "f9000f80",
    evidence: "render-command B builder stores the returned object's vtable +0x10 result at queued command +0x18",
  },
  {
    address: 0x18a16c0,
    role: "render-command-queue-sort-count-load",
    expectedOpcodeHex: "b9402016",
    evidence: "render queue sort/reappend path loads the queued command count before building sortable pairs",
  },
  {
    address: 0x18a16d8,
    role: "render-command-queue-sort-head-load",
    expectedOpcodeHex: "f8410ee8",
    evidence: "render queue sort/reappend path starts iterating the linked command list from queue +0x10",
  },
  {
    address: 0x18a16e4,
    role: "render-command-queue-sort-key-load",
    expectedOpcodeHex: "f9400d0a",
    evidence: "render queue sort/reappend path loads each command's +0x18 value as the sort key",
  },
  {
    address: 0x18a16e8,
    role: "render-command-queue-sort-pair-store",
    expectedOpcodeHex: "a881212a",
    evidence: "render queue sort/reappend path stores pair [command +0x18 key, command pointer]",
  },
  {
    address: 0x18a16ec,
    role: "render-command-queue-sort-next-load",
    expectedOpcodeHex: "f9400908",
    evidence: "render queue sort/reappend path walks the command list through command +0x10",
  },
  {
    address: 0x18a1700,
    role: "render-command-queue-sort-call",
    expectedOpcodeHex: "94000014",
    evidence: "render queue sort/reappend path sorts the temporary [key, command] pair array",
  },
  {
    address: 0x18a1718,
    role: "render-command-queue-sort-reappend-call",
    expectedOpcodeHex: "97ffffac",
    evidence: "render queue sort/reappend path re-appends commands after sorting by command +0x18",
  },
  {
    address: 0x18a1798,
    role: "render-command-queue-sort-pivot-key-load",
    expectedOpcodeHex: "f8686a88",
    evidence: "sort partition uses the first qword of each pair as the pivot key",
  },
  {
    address: 0x18a17b0,
    role: "render-command-queue-sort-left-key-load",
    expectedOpcodeHex: "f8410d6c",
    evidence: "sort partition reads left-side pair keys from the first qword of each pair",
  },
  {
    address: 0x18a17b8,
    role: "render-command-queue-sort-left-key-compare",
    expectedOpcodeHex: "eb08019f",
    evidence: "sort partition compares left-side pair key against the pivot key",
  },
  {
    address: 0x18a17c4,
    role: "render-command-queue-sort-right-key-load",
    expectedOpcodeHex: "f85f0d8d",
    evidence: "sort partition reads right-side pair keys from the first qword of each pair",
  },
  {
    address: 0x18a17cc,
    role: "render-command-queue-sort-right-key-compare",
    expectedOpcodeHex: "eb0801bf",
    evidence: "sort partition compares right-side pair key against the pivot key",
  },
  {
    address: 0x18906ec,
    role: "scene-entity-record-entry-owner-b-accessor-page-load",
    expectedOpcodeHex: "d000c448",
    evidence: "global helper accessor 0x18906ec prepares the page for global render-command owner B slot 0x311ae08",
  },
  {
    address: 0x18906f8,
    role: "scene-entity-record-entry-owner-a-accessor-page-load",
    expectedOpcodeHex: "d000c448",
    evidence: "global helper accessor 0x18906f8 prepares the page for global render-command owner A slot 0x311ae10",
  },
  {
    address: 0x1890704,
    role: "scene-entity-record-entry-list-holder-init",
    expectedOpcodeHex: "a9007c1f",
    evidence: "entry-side list holder initializer clears its first two pointer slots",
  },
  {
    address: 0x1890710,
    role: "scene-entity-record-entry-list-holder-destroy-tail",
    expectedOpcodeHex: "14000001",
    evidence: "entry-side list holder destroy path immediately tail-branches into the shared list cleanup body",
  },
  {
    address: 0x1890828,
    role: "scene-entity-record-entry-list-unlink-load",
    expectedOpcodeHex: "f9400008",
    evidence: "entry-side list unlink helper loads the owning list state before unlinking a node",
  },
];

const transformCopyEvidence = [
  {
    command: "render-command-a",
    builderAddress: 0x1892120,
    ownerVtableAddress: addresses.renderCommandAOwnerVtableBase,
    ownerBuilderSlotAddress: addresses.renderCommandAOwnerBuilderSlot,
    queuedCommandVtableAddress: addresses.renderCommandAQueuedCommandVtableBase,
    sourceRegister: "x22",
    destinationRegister: "x19",
    transformProviderEvidence:
      "x22 is the return value of the object passed in as x4-8 through virtual slot +0x18 at 0x189216c/0x1892170.",
    queueAppendAddress: 0x18923a0,
    copies: [
      { sourceOffset: "0x0", destinationOffset: "0x20", loadAddress: 0x189237c, storeAddress: 0x1892390 },
      { sourceOffset: "0x10", destinationOffset: "0x30", loadAddress: 0x1892374, storeAddress: 0x1892378 },
      { sourceOffset: "0x20", destinationOffset: "0x40", loadAddress: 0x189236c, storeAddress: 0x1892370 },
      { sourceOffset: "0x30", destinationOffset: "0x50", loadAddress: 0x189235c, storeAddress: 0x1892368 },
    ],
  },
  {
    command: "render-command-b",
    builderAddress: 0x189366c,
    ownerVtableAddress: addresses.renderCommandBOwnerVtableBase,
    ownerBuilderSlotAddress: addresses.renderCommandBOwnerBuilderSlot,
    queuedCommandVtableAddress: addresses.renderCommandBQueuedCommandVtableBase,
    sourceRegister: "x22",
    destinationRegister: "x28",
    transformProviderEvidence:
      "x22 is the return value of the object passed in as x4-8 through virtual slot +0x18 at 0x18936c8/0x18936cc.",
    queueAppendAddress: 0x189390c,
    copies: [
      { sourceOffset: "0x0", destinationOffset: "0x20", loadAddress: 0x18938fc, storeAddress: 0x1893908 },
      { sourceOffset: "0x10", destinationOffset: "0x30", loadAddress: 0x18938f4, storeAddress: 0x18938f8 },
      { sourceOffset: "0x20", destinationOffset: "0x40", loadAddress: 0x18938ec, storeAddress: 0x18938f0 },
      { sourceOffset: "0x30", destinationOffset: "0x50", loadAddress: 0x18938e0, storeAddress: 0x18938e8 },
    ],
  },
];

const resourceHandlerEvidence = [
  {
    resourceName: "animData",
    constructorAddress: addresses.resourceHandlerAnimDataConstructor,
    primaryVtableAddress: addresses.resourceHandlerAnimDataPrimaryVtable,
    nameFunctionAddress: addresses.resourceHandlerAnimDataName,
    processFunctionAddress: addresses.resourceHandlerAnimDataProcess,
    resourceNameAddress: addresses.animDataResourceName,
    setupConstructorCallAddress: 0xe01f24,
    setupRegistrationCallAddress: 0xe01f8c,
    processSlotRelativeOffset: "0x20",
    notes: "animData has a non-resource-process placeholder at primary vtable +0x18, while the concrete process function sits at +0x20.",
  },
  {
    resourceName: "meshData",
    constructorAddress: addresses.resourceHandlerMeshDataConstructor,
    primaryVtableAddress: addresses.resourceHandlerMeshDataPrimaryVtable,
    nameFunctionAddress: addresses.resourceHandlerMeshDataName,
    processFunctionAddress: addresses.resourceHandlerMeshDataProcess,
    resourceNameAddress: addresses.meshDataResourceName,
    setupConstructorCallAddress: 0xe01f40,
    setupRegistrationCallAddress: 0xe01fa0,
    processSlotRelativeOffset: "0x18",
    downstreamBuilderCallsite: addresses.meshDataProcessorResourceObjectBuildCallsite,
    downstreamBuilder: addresses.meshDataResourceObjectBuilder,
    notes:
      "meshData process hashes the request path/name, uses the handler's owner/resource-factory pointer, calls 0x18918e4, then stores the result back on the request.",
  },
  {
    resourceName: "shaderData",
    constructorAddress: addresses.resourceHandlerShaderDataConstructor,
    primaryVtableAddress: addresses.resourceHandlerShaderDataPrimaryVtable,
    nameFunctionAddress: addresses.resourceHandlerShaderDataName,
    processFunctionAddress: addresses.resourceHandlerShaderDataProcess,
    resourceNameAddress: addresses.shaderDataResourceName,
    setupConstructorCallAddress: 0xe01f5c,
    setupRegistrationCallAddress: 0xe01fb4,
    processSlotRelativeOffset: "0x18",
    notes: "shaderData follows the standard handler layout with resource name at primary vtable +0x10 and process at +0x18.",
  },
  {
    resourceName: "texData",
    constructorAddress: addresses.resourceHandlerTexDataConstructor,
    primaryVtableAddress: addresses.resourceHandlerTexDataPrimaryVtable,
    nameFunctionAddress: addresses.resourceHandlerTexDataName,
    processFunctionAddress: addresses.resourceHandlerTexDataProcess,
    resourceNameAddress: addresses.texDataResourceName,
    setupConstructorCallAddress: 0xe01f78,
    setupRegistrationCallAddress: 0xe01fc8,
    processSlotRelativeOffset: "0x18",
    notes: "texData follows the standard handler layout with resource name at primary vtable +0x10 and process at +0x18.",
  },
];

const compositeTaskConstructorCallsiteEvidence = [
  {
    constructor: "single",
    callsiteAddress: 0x9fa15c,
    label: "Kindred menu mesh: mesh",
    entrySource:
      "x2 is x23, derived from the menu mesh owner object at +0x300 plus 0x8 before constructing the inline single-entry task",
    classification: "menu-mesh-task",
  },
  {
    constructor: "batch",
    callsiteAddress: 0x820f74,
    label: "Draw all scene entities",
    entrySource:
      "x2 is a stack entry array at sp+0x128, count is w22, and the task is later appended through 0x18a2418",
    classification: "scene-entity-task",
  },
  {
    constructor: "batch",
    callsiteAddress: 0x821038,
    label: "Draw all particle effects",
    entrySource:
      "x2 is the same stack entry array at sp+0x128 after it is rebuilt, count is w22, and the task is appended through 0x18a2418",
    classification: "particle-effects-task",
  },
  {
    constructor: "batch",
    callsiteAddress: 0x9fa29c,
    label: "Kindred menu mesh: particlefx",
    entrySource:
      "x2 is the previously constructed stack task at sp+0xb0, so this batches the menu mesh task into the particlefx task",
    classification: "menu-mesh-task",
  },
  {
    constructor: "batch",
    callsiteAddress: 0x9fbca4,
    label: "Kindred Menu Particle FX",
    entrySource:
      "x2 is x21, an entry array/count pair supplied by the enclosing menu particle function",
    classification: "menu-particle-task",
  },
  {
    constructor: "batch",
    callsiteAddress: 0xe146c4,
    label: "Composite task (ScreenNode)",
    entrySource:
      "x2 is a stack entry array at sp+0x10, count comes from the preceding ScreenNode collection build",
    classification: "screen-node-task",
  },
  {
    constructor: "batch",
    callsiteAddress: 0xe190d8,
    label: "Composite task (ViewNode)",
    entrySource:
      "x2 is x23, count is w24, and the entries come from the surrounding ViewNode traversal",
    classification: "view-node-task",
  },
  {
    constructor: "batch",
    callsiteAddress: 0xe19180,
    label: "Composite task (ViewNode)",
    entrySource:
      "x2 is a stack entry array at the current stack pointer, count is w23, built by the surrounding ViewNode path",
    classification: "view-node-task",
  },
  {
    constructor: "batch",
    callsiteAddress: 0xe196d4,
    label: "Composite task (ViewRTNode)",
    entrySource:
      "x2 is the ViewRTNode stack entry array, count is w23, built by the surrounding ViewRTNode path",
    classification: "view-rt-node-task",
  },
  {
    constructor: "batch",
    callsiteAddress: 0x18856e4,
    label: "Shadow task - ShadowGeneratorDirPCF",
    entrySource:
      "x2 is x21, count is w20, and the task is appended to a shadow-generator task list",
    classification: "shadow-task",
  },
  {
    constructor: "batch",
    callsiteAddress: 0x1885950,
    label: "Shadow task - ShadowGeneratorSpotPCF",
    entrySource:
      "x2 is x21, count is w20, and the task is appended to a shadow-generator task list",
    classification: "shadow-task",
  },
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hex(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const sign = value < 0 ? "-0x" : "0x";
  return `${sign}${Math.abs(value).toString(16)}`;
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

function readInstructionHex(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf.loads, virtualAddress, 4);
  if (fileOffset < 0) return "";
  return buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0");
}

function readPointer(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf.loads, virtualAddress, 8);
  if (fileOffset < 0) return null;
  return Number(buffer.readBigUInt64LE(fileOffset));
}

function pointerNeighborhood(buffer, elf, baseAddress, beforeBytes = 0x20, afterBytes = 0x80) {
  const rows = [];
  for (let address = baseAddress - beforeBytes; address < baseAddress + afterBytes; address += 8) {
    const value = readPointer(buffer, elf, address);
    if (value == null) continue;
    rows.push({
      slotAddress: address,
      slotAddressHex: hex(address),
      relativeOffset: address - baseAddress,
      relativeOffsetHex: hex(address - baseAddress),
      value,
      valueHex: hex(value),
      valueSection: sectionForVirtualAddress(elf.sections, value)?.name || "",
    });
  }
  return rows;
}

function instructionRecord(buffer, elf, evidence) {
  const opcodeHex = readInstructionHex(buffer, elf, evidence.address);
  return {
    ...evidence,
    addressHex: hex(evidence.address),
    opcodeHex,
    opcodeMatchesExpected: opcodeHex === evidence.expectedOpcodeHex,
    section: sectionForVirtualAddress(elf.sections, evidence.address)?.name || "",
  };
}

function relationshipRecord(buffer, elf, name, virtualAddress) {
  return {
    name,
    virtualAddress,
    virtualAddressHex: hex(virtualAddress),
    section: sectionForVirtualAddress(elf.sections, virtualAddress)?.name || "",
    directCallers: findDirectBranchCallers(buffer, elf, virtualAddress).map((caller) => ({
      callerAddress: caller.callerAddress,
      callerAddressHex: caller.callerAddressHex,
      mode: caller.mode,
      instructionHex: caller.instructionHex,
    })),
    dataReferences: findU64References(buffer, elf, virtualAddress).map((reference) => ({
      virtualAddress: reference.virtualAddress,
      virtualAddressHex: reference.virtualAddressHex,
      section: reference.section,
      fileOffsetHex: reference.fileOffsetHex,
    })),
  };
}

function copyRecord(buffer, elf, copy) {
  return {
    ...copy,
    loadAddressHex: hex(copy.loadAddress),
    storeAddressHex: hex(copy.storeAddress),
    loadOpcodeHex: readInstructionHex(buffer, elf, copy.loadAddress),
    storeOpcodeHex: readInstructionHex(buffer, elf, copy.storeAddress),
  };
}

function buildCommandEvidence(buffer, elf, row) {
  return {
    ...row,
    builderAddressHex: hex(row.builderAddress),
    ownerVtableAddressHex: hex(row.ownerVtableAddress),
    ownerBuilderSlotAddressHex: hex(row.ownerBuilderSlotAddress),
    queuedCommandVtableAddressHex: hex(row.queuedCommandVtableAddress),
    queueAppendAddressHex: hex(row.queueAppendAddress),
    copies: row.copies.map((copy) => copyRecord(buffer, elf, copy)),
    positionFieldConclusion:
      "The sampled +0x50/+0x58 fields are the tail of a 4x4 transform copied from the transform provider. This makes 0xe36efc a per-render-command model/world position sampler, not a standalone material constant.",
  };
}

function buildOwnerVtableEvidence(buffer, elf) {
  return [
    {
      command: "render-command-a",
      ownerConstructorAddress: addresses.renderCommandAOwnerConstructor,
      ownerConstructorAddressHex: hex(addresses.renderCommandAOwnerConstructor),
      ownerVtableAddress: addresses.renderCommandAOwnerVtableBase,
      ownerVtableAddressHex: hex(addresses.renderCommandAOwnerVtableBase),
      builderSlotAddress: addresses.renderCommandAOwnerBuilderSlot,
      builderSlotAddressHex: hex(addresses.renderCommandAOwnerBuilderSlot),
      builderFunctionAddress: readPointer(buffer, elf, addresses.renderCommandAOwnerBuilderSlot),
      builderFunctionAddressHex: hex(readPointer(buffer, elf, addresses.renderCommandAOwnerBuilderSlot)),
      queuedCommandVtableAddress: addresses.renderCommandAQueuedCommandVtableBase,
      queuedCommandVtableAddressHex: hex(addresses.renderCommandAQueuedCommandVtableBase),
      vtableWriteAddress: hex(0x1891fc8),
      vtableNeighborhood: pointerNeighborhood(buffer, elf, addresses.renderCommandAOwnerVtableBase),
      evidence:
        "0x1891f8c constructs the owner, writes vtable 0x2ab5188 at 0x1891fc8, and the builder function sits at owner vtable +0x10 -> 0x1892120.",
    },
    {
      command: "render-command-b",
      ownerConstructorAddress: addresses.renderCommandBOwnerConstructor,
      ownerConstructorAddressHex: hex(addresses.renderCommandBOwnerConstructor),
      ownerVtableAddress: addresses.renderCommandBOwnerVtableBase,
      ownerVtableAddressHex: hex(addresses.renderCommandBOwnerVtableBase),
      builderSlotAddress: addresses.renderCommandBOwnerBuilderSlot,
      builderSlotAddressHex: hex(addresses.renderCommandBOwnerBuilderSlot),
      builderFunctionAddress: readPointer(buffer, elf, addresses.renderCommandBOwnerBuilderSlot),
      builderFunctionAddressHex: hex(readPointer(buffer, elf, addresses.renderCommandBOwnerBuilderSlot)),
      queuedCommandVtableAddress: addresses.renderCommandBQueuedCommandVtableBase,
      queuedCommandVtableAddressHex: hex(addresses.renderCommandBQueuedCommandVtableBase),
      vtableWriteAddress: hex(0x1893654),
      vtableNeighborhood: pointerNeighborhood(buffer, elf, addresses.renderCommandBOwnerVtableBase),
      evidence:
        "0x1893628 constructs the owner, writes vtable 0x2ab5230 at 0x1893654, and the builder function sits at owner vtable +0x10 -> 0x189366c.",
    },
  ];
}

function buildTextReferenceEvidence(buffer, elf, targetRows) {
  return scanTextReferences(
    buffer,
    elf,
    targetRows.map((row) => ({
      name: row.name,
      kind: row.kind || "target-address",
      virtualAddress: row.virtualAddress,
      section: sectionForVirtualAddress(elf.sections, row.virtualAddress)?.name || "",
    })),
  ).map((reference) => ({
    targetName: reference.targetName,
    targetAddress: reference.targetAddress,
    targetAddressHex: hex(reference.targetAddress),
    xrefAddress: reference.xrefAddress,
    xrefAddressHex: hex(reference.xrefAddress),
    mode: reference.mode,
    baseAddress: reference.baseAddress,
    baseAddressHex: hex(reference.baseAddress),
    baseInstructionHex: reference.baseInstructionHex,
    useInstructionHex: reference.useInstructionHex,
    baseRegister: reference.baseRegister,
    useRegister: reference.useRegister,
  }));
}

function buildHelperDispatcherEvidence(buffer, elf) {
  const dispatcherFunction = readPointer(buffer, elf, addresses.rendererDispatcherObjectDispatchSlot);
  return {
    globalHelperRegisterFunction: addresses.globalHelperRegisterActiveDispatcher,
    globalHelperRegisterFunctionHex: hex(addresses.globalHelperRegisterActiveDispatcher),
    globalHelperDispatchFunction: addresses.globalHelperDispatch,
    globalHelperDispatchFunctionHex: hex(addresses.globalHelperDispatch),
    dispatchThunkFunction: addresses.globalHelperDispatchThunk,
    dispatchThunkFunctionHex: hex(addresses.globalHelperDispatchThunk),
    dispatcherObjectConstructor: addresses.rendererDispatcherObjectConstructor,
    dispatcherObjectConstructorHex: hex(addresses.rendererDispatcherObjectConstructor),
    dispatcherObjectPrimaryVtable: addresses.rendererDispatcherObjectPrimaryVtable,
    dispatcherObjectPrimaryVtableHex: hex(addresses.rendererDispatcherObjectPrimaryVtable),
    dispatcherObjectDispatchSlot: addresses.rendererDispatcherObjectDispatchSlot,
    dispatcherObjectDispatchSlotHex: hex(addresses.rendererDispatcherObjectDispatchSlot),
    dispatcherObjectDispatchFunction: dispatcherFunction,
    dispatcherObjectDispatchFunctionHex: hex(dispatcherFunction),
    threadedBridgeFunction: addresses.resourceDispatcherThreadedBridge,
    threadedBridgeFunctionHex: hex(addresses.resourceDispatcherThreadedBridge),
    vtableNeighborhood: pointerNeighborhood(buffer, elf, addresses.rendererDispatcherObjectPrimaryVtable - 0x10, 0x0, 0x70),
    evidence: [
      "0xe01efc calls 0x1890948 after constructing the e02c80 dispatcher object, which stores that object into global helper +0x20.",
      "0x18906b0 loads the global helper and tail-calls 0x1890958; 0x1890958 dispatches through the active object at helper +0x20 vtable +0x10.",
      "The e02c80 object constructor stores primary vtable 0x272a990 and the renderer/resource context at object +0x8.",
      "The e02c80 primary vtable +0x10 slot is 0xe02c94, which loads object +0x8 and tail-calls 0xe28660.",
      "0xe28660 then branches through the renderer/resource context vtable +0x18. The context evidence resolves that vtable slot to the shared e28674 resource dispatcher.",
    ],
    unresolved:
      "the concrete resource-handler path from e28674's meshData request object into the owner A/B builder functions",
  };
}

function buildResourceContextDispatchEvidence(buffer, elf) {
  const registryBuildFunction = readPointer(buffer, elf, addresses.rendererContextRegistryRuntimeContextBuildSlot);
  const contextDispatchFunction = readPointer(buffer, elf, addresses.resourceDispatcherContextThreadedDispatchSlot);
  return {
    registryLookupFunction: addresses.rendererContextRegistryLookup,
    registryLookupFunctionHex: hex(addresses.rendererContextRegistryLookup),
    registryObjectConstructor: addresses.rendererContextRegistryObjectConstructor,
    registryObjectConstructorHex: hex(addresses.rendererContextRegistryObjectConstructor),
    registryObjectPrimaryVtable: addresses.rendererContextRegistryObjectPrimaryVtable,
    registryObjectPrimaryVtableHex: hex(addresses.rendererContextRegistryObjectPrimaryVtable),
    registryRuntimeContextBuildSlot: addresses.rendererContextRegistryRuntimeContextBuildSlot,
    registryRuntimeContextBuildSlotHex: hex(addresses.rendererContextRegistryRuntimeContextBuildSlot),
    registryRuntimeContextBuildFunction: registryBuildFunction,
    registryRuntimeContextBuildFunctionHex: hex(registryBuildFunction),
    registryRuntimeContextAccessor: addresses.rendererContextRegistryRuntimeContextAccessor,
    registryRuntimeContextAccessorHex: hex(addresses.rendererContextRegistryRuntimeContextAccessor),
    contextConstructor: addresses.resourceDispatcherContextConstructor,
    contextConstructorHex: hex(addresses.resourceDispatcherContextConstructor),
    contextPrimaryVtable: addresses.resourceDispatcherContextPrimaryVtable,
    contextPrimaryVtableHex: hex(addresses.resourceDispatcherContextPrimaryVtable),
    contextThreadedDispatchSlot: addresses.resourceDispatcherContextThreadedDispatchSlot,
    contextThreadedDispatchSlotHex: hex(addresses.resourceDispatcherContextThreadedDispatchSlot),
    contextThreadedDispatchFunction: contextDispatchFunction,
    contextThreadedDispatchFunctionHex: hex(contextDispatchFunction),
    meshDataResourceName: addresses.meshDataResourceName,
    meshDataResourceNameHex: hex(addresses.meshDataResourceName),
    registryObjectVtableNeighborhood: pointerNeighborhood(
      buffer,
      elf,
      addresses.rendererContextRegistryObjectPrimaryVtable - 0x10,
      0x0,
      0x90,
    ),
    contextVtableNeighborhood: pointerNeighborhood(
      buffer,
      elf,
      addresses.resourceDispatcherContextPrimaryVtable - 0x10,
      0x0,
      0x90,
    ),
    evidence: [
      "0xe01e3c calls d7f00c(1), stores the key=1 registry object at renderer subsystem +0x18, and 0xe01e44 immediately calls e03474 on that object.",
      "The key=1 registry object constructor e03330 calls d7f058 with w1=1, writes primary vtable 0x272a9c8, and registers itself through d7efb8.",
      "The key=1 registry object's vtable +0x10 slot points to e033dc. That builder allocates a 0x20 context object, calls e28418, and stores the result at registry object +0x18.",
      "e03474 returns registry object +0x18, which is the renderer/resource context stored in the e02c80 dispatcher object +0x8.",
      "e28418 writes primary context vtable 0x272ed90. The primary vtable +0x18 slot at 0x272eda8 points to e28674, so e28660's indirect branch is now resolved.",
      "e02c94 passes resource name meshData at 0x1af8d04 through e28660 into e28674; e28674 looks up a handler, builds a request object, and chooses queued e292a8 or immediate e29218 execution.",
    ],
    unresolved:
      "the handler object returned by e28714 for meshData and the downstream request execution path that passes a transform-provider object as x4 into owner builders 0x1892120/0x189366c",
  };
}

function buildResourceHandlerRegistrationEvidence(buffer, elf) {
  return {
    setupFunctionAddress: 0xe01f10,
    setupFunctionAddressHex: hex(0xe01f10),
    contextRegistrationSlot: 0x272eda0,
    contextRegistrationSlotHex: hex(0x272eda0),
    contextRegistrationFunction: readPointer(buffer, elf, 0x272eda0),
    contextRegistrationFunctionHex: hex(readPointer(buffer, elf, 0x272eda0)),
    handlerCount: resourceHandlerEvidence.length,
    handlers: resourceHandlerEvidence.map((handler) => {
      const nameSlotAddress = handler.primaryVtableAddress + 0x10;
      const processSlotAddress = handler.primaryVtableAddress + Number(handler.processSlotRelativeOffset);
      return {
        ...handler,
        constructorAddressHex: hex(handler.constructorAddress),
        primaryVtableAddressHex: hex(handler.primaryVtableAddress),
        nameFunctionAddressHex: hex(handler.nameFunctionAddress),
        processFunctionAddressHex: hex(handler.processFunctionAddress),
        resourceNameAddressHex: hex(handler.resourceNameAddress),
        setupConstructorCallAddressHex: hex(handler.setupConstructorCallAddress),
        setupRegistrationCallAddressHex: hex(handler.setupRegistrationCallAddress),
        nameSlotAddress,
        nameSlotAddressHex: hex(nameSlotAddress),
        nameSlotFunction: readPointer(buffer, elf, nameSlotAddress),
        nameSlotFunctionHex: hex(readPointer(buffer, elf, nameSlotAddress)),
        processSlotAddress,
        processSlotAddressHex: hex(processSlotAddress),
        processSlotFunction: readPointer(buffer, elf, processSlotAddress),
        processSlotFunctionHex: hex(readPointer(buffer, elf, processSlotAddress)),
        downstreamBuilderCallsiteHex: hex(handler.downstreamBuilderCallsite),
        downstreamBuilderHex: hex(handler.downstreamBuilder),
        vtableNeighborhood: pointerNeighborhood(buffer, elf, handler.primaryVtableAddress - 0x10, 0x0, 0x80),
      };
    }),
    meshDataProcessEvidence: {
      processFunction: addresses.resourceHandlerMeshDataProcess,
      processFunctionHex: hex(addresses.resourceHandlerMeshDataProcess),
      resourceObjectBuilderCallsite: addresses.meshDataProcessorResourceObjectBuildCallsite,
      resourceObjectBuilderCallsiteHex: hex(addresses.meshDataProcessorResourceObjectBuildCallsite),
      resourceObjectBuilder: addresses.meshDataResourceObjectBuilder,
      resourceObjectBuilderHex: hex(addresses.meshDataResourceObjectBuilder),
      requestResultStoreCallsite: 0xe02bf8,
      requestResultStoreCallsiteHex: hex(0xe02bf8),
      evidence: [
        "e28714 resolves handlers by calling each registered handler object's vtable +0x10 name function and comparing against the requested resource string.",
        "The setup path constructs animData, meshData, shaderData, and texData handler objects, then appends all four through the e28418 context vtable +0x10 registration slot.",
        "The meshData handler vtable name slot returns string 0x1af8d04, so the e02c94 -> e28674 meshData request resolves to this handler object.",
        "The meshData process function e02ac8 hashes the request path/name, calls 0x18918e4 at 0xe02bb0, then stores the built/fetched resource object back on the request at 0xe02bf8.",
      ],
    },
    unresolved:
      "the object returned by 0x18918e4 and the later request execution path that pairs the mesh runtime payload with the scene/entity render-owner path",
  };
}

function buildMeshDataRuntimeHandoffEvidence(buffer, elf) {
  return {
    runtimeObjectBuilder: addresses.meshDataResourceObjectBuilder,
    runtimeObjectBuilderHex: hex(addresses.meshDataResourceObjectBuilder),
    runtimeObjectPrimaryVtable: addresses.meshDataRuntimeObjectPrimaryVtable,
    runtimeObjectPrimaryVtableHex: hex(addresses.meshDataRuntimeObjectPrimaryVtable),
    runtimeObjectVtableNeighborhood: pointerNeighborhood(
      buffer,
      elf,
      addresses.meshDataRuntimeObjectPrimaryVtable - 0x10,
      0x0,
      0x90,
    ),
    runtimeObjectStores: [
      {
        field: "primary-vtable",
        offset: "0x0",
        address: hex(0x1891944),
        evidence: "stores vtable 0x2ab5148 into the allocated 0x28-byte runtime object",
      },
      {
        field: "request-path-or-name",
        offset: "0x10",
        address: hex(0x1891948),
        evidence: "stores the meshData request path/name pointer",
      },
      {
        field: "handler-owner-or-resource-factory",
        offset: "0x18",
        address: hex(0x189194c),
        evidence: "stores the owner/resource-factory pointer that came from the meshData handler object",
      },
      {
        field: "hashed-request-key",
        offset: "0x20",
        address: hex(0x1891950),
        evidence: "stores the hashed meshData request key",
      },
    ],
    setupFunction: addresses.meshDataRuntimeObjectSetup,
    setupFunctionHex: hex(addresses.meshDataRuntimeObjectSetup),
    setupBridgeA: addresses.meshDataRuntimeSetupBridgeA,
    setupBridgeAHex: hex(addresses.meshDataRuntimeSetupBridgeA),
    setupBridgeB: addresses.meshDataRuntimeSetupBridgeB,
    setupBridgeBHex: hex(addresses.meshDataRuntimeSetupBridgeB),
    payloadBuilder: addresses.meshDataRuntimePayloadBuilder,
    payloadBuilderHex: hex(addresses.meshDataRuntimePayloadBuilder),
    renderCommandParamRuntimeVcalls: [
      {
        command: "render-command-a",
        builder: hex(addresses.renderCommandABuilder),
        loadAddress: hex(addresses.renderCommandAParamRuntimeVcallSlot),
        callAddress: hex(addresses.renderCommandAParamRuntimeVcall),
        slot: "x2-vtable+0x10",
        evidence:
          "builder A calls the x2 runtime parameter object's vtable +0x10 before allocating the queued command and copying the x4-derived transform",
      },
      {
        command: "render-command-b",
        builder: hex(addresses.renderCommandBBuilder),
        loadAddress: hex(addresses.renderCommandBParamRuntimeVcallSlot),
        callAddress: hex(addresses.renderCommandBParamRuntimeVcall),
        slot: "x2-vtable+0x10",
        evidence:
          "builder B calls the x2 runtime parameter object's vtable +0x10 before allocating the queued command and copying the x4-derived transform",
      },
    ],
    evidence: [
      "0x18918e4 allocates a small runtime object, writes primary vtable 0x2ab5148, stores request/resource-factory/hash fields, and returns a wrapper/handle object rather than directly appending render commands.",
      "The runtime object's setup path reaches 0x1891a70, which calls 0x1890e90 and 0x1890e98 to build two payload blocks through object/vtable dispatch.",
      "0x1890e90 loads object +0x18 and tail-branches to 0x18942f8; 0x18942f8 builds payload state and copies the resulting payload blocks back to the caller-provided buffers.",
      "The render-command owner builders still contain a later x2 runtime-parameter vtable +0x10 call and the already recovered x4 transform-provider vtable +0x18 call before command enqueue.",
    ],
    unresolved:
      "the active hero/model preview profile path paired with owner builders 0x1892120/0x189366c and the full character-lit shader formula",
  };
}

function buildCompositeTaskDispatchEvidence(buffer, elf) {
  const dispatchFunction = readPointer(buffer, elf, addresses.compositeTaskDispatchSlot);
  return {
    singleConstructor: addresses.compositeTaskSingleConstructor,
    singleConstructorHex: hex(addresses.compositeTaskSingleConstructor),
    batchConstructor: addresses.compositeTaskBatchConstructor,
    batchConstructorHex: hex(addresses.compositeTaskBatchConstructor),
    primaryVtable: addresses.compositeTaskPrimaryVtable,
    primaryVtableHex: hex(addresses.compositeTaskPrimaryVtable),
    dispatchSlot: addresses.compositeTaskDispatchSlot,
    dispatchSlotHex: hex(addresses.compositeTaskDispatchSlot),
    dispatchFunction,
    dispatchFunctionHex: hex(dispatchFunction),
    listPrimaryVtable: addresses.compositeTaskListPrimaryVtable,
    listPrimaryVtableHex: hex(addresses.compositeTaskListPrimaryVtable),
    payloadSerializerPrimaryVtable: addresses.meshDataPayloadSerializerPrimaryVtable,
    payloadSerializerPrimaryVtableHex: hex(addresses.meshDataPayloadSerializerPrimaryVtable),
    singleConstructorCallers: findDirectBranchCallers(buffer, elf, addresses.compositeTaskSingleConstructor).map(
      (caller) => ({
        callerAddress: caller.callerAddress,
        callerAddressHex: caller.callerAddressHex,
        mode: caller.mode,
        instructionHex: caller.instructionHex,
      }),
    ),
    batchConstructorCallers: findDirectBranchCallers(buffer, elf, addresses.compositeTaskBatchConstructor).map(
      (caller) => ({
        callerAddress: caller.callerAddress,
        callerAddressHex: caller.callerAddressHex,
        mode: caller.mode,
        instructionHex: caller.instructionHex,
      }),
    ),
    constructorCallsites: compositeTaskConstructorCallsiteEvidence.map((row) => ({
      ...row,
      callsiteAddressHex: hex(row.callsiteAddress),
      evidence:
        "current disassembly shows this callsite passes the listed x2/entry-array source into 0x18a1170 or 0x18a11e4",
    })),
    taskVtableNeighborhood: pointerNeighborhood(buffer, elf, addresses.compositeTaskPrimaryVtable - 0x10, 0x0, 0x90),
    listVtableNeighborhood: pointerNeighborhood(
      buffer,
      elf,
      addresses.compositeTaskListPrimaryVtable - 0x10,
      0x0,
      0x90,
    ),
    payloadSerializerVtableNeighborhood: pointerNeighborhood(
      buffer,
      elf,
      addresses.meshDataPayloadSerializerPrimaryVtable - 0x10,
      0x0,
      0x90,
    ),
    dispatchArgumentPattern: {
      entrySource:
        "0x18a1170 single constructor stores its x2 argument as the inline entry at task +0x50. 0x18a11e4 batch constructor stores its x2 argument as the entry-array pointer at task +0x50 and x3 as the count in task +0x88 with bit 30 set. 0x18a1420/0x18a1428 then choose inline +0x50 or dereferenced +0x50 based on that bit.",
      targetedPath:
        "0x18a1440 loads an entry from task +0x50, 0x18a1444 reads entry +0x8 and matches it against the requested target, then 0x18a1454 loads x2 from task +0x58 and 0x18a146c calls the matched object's vtable +0x10 with x4 as the entry.",
      allPath:
        "0x18a1494 iterates every task entry, 0x18a1498 loads x2 from task +0x58, 0x18a14a4 loads x0 from entry +0x8, and 0x18a14b4 calls each entry object's vtable +0x10 with x4 as the entry.",
      runtimeParamCallback:
        "0x18a14f8 loads task +0x58 and 0x18a150c branches through that object's vtable +0x18 with the task list pointer.",
      clonePath:
        "0x18a1268 clones composite tasks by copying task +0x58 and, when the external-array bit is present, copying the source +0x50 entry array into the clone.",
    },
    evidence: [
      "Composite-task constructors 0x18a1170 and 0x18a11e4 both write primary vtable 0x2ab5590 and store a runtime-parameter object at task +0x58.",
      "The entry source is constructor-owned: single tasks place the caller's x2 entry inline at task +0x50, while batch tasks place the caller's x2 entry-array pointer at task +0x50 and set bit 30 in task +0x88.",
      "The primary vtable +0x18 slot at 0x2ab55a8 points to 0x18a13fc, whose dispatch loop calls entry object vtable +0x10 with x2 loaded from task +0x58 and x4 set to the current entry.",
      "This call signature matches the already recovered render owner builders' important argument usage: x2 is the runtime-parameter object and x4 is the provider/list entry used to derive the transform source.",
      "The current callers include menu mesh and generic screen/view composite task labels, so this is upstream dispatch-shape evidence rather than proof that every entry is a hero preview render owner.",
      "Current direct constructor callsites classify as menu mesh, scene entity, particle effects, ScreenNode, ViewNode/ViewRTNode, and shadow tasks. The render-owner proof must therefore continue inside those callsites' x2 entry arrays.",
      "The payload serializer vtable 0x2ab52a8 is also current-package evidence for the meshData payload-builder side, but it does not by itself prove the concrete entry objects in the composite-task list.",
    ],
    unresolved:
      "the list-entry population path that proves which entries carry render-command owner A/B objects for active hero/model preview, and the active profile payload loaded before dispatch",
  };
}

function buildSceneEntityEntryArrayEvidence(buffer, elf) {
  return {
    globalManagerSlot: addresses.sceneEntityEntryArrayGlobalSlot,
    globalManagerSlotHex: hex(addresses.sceneEntityEntryArrayGlobalSlot),
    forwarder: addresses.sceneEntityEntryArrayForwarder,
    forwarderHex: hex(addresses.sceneEntityEntryArrayForwarder),
    builder: addresses.sceneEntityEntryArrayBuilder,
    builderHex: hex(addresses.sceneEntityEntryArrayBuilder),
    directCallers: findDirectBranchCallers(buffer, elf, addresses.sceneEntityEntryArrayBuilder).map((caller) => ({
      callerAddress: caller.callerAddress,
      callerAddressHex: caller.callerAddressHex,
      mode: caller.mode,
      instructionHex: caller.instructionHex,
    })),
    globalSlotReferences: findU64References(buffer, elf, addresses.sceneEntityEntryArrayGlobalSlot).map((reference) => ({
      virtualAddress: reference.virtualAddress,
      virtualAddressHex: reference.virtualAddressHex,
      section: reference.section,
      fileOffsetHex: reference.fileOffsetHex,
    })),
    entryArrayPattern: {
      forwarder:
        "0x188e784 loads global manager slot 0x311a960 and tail-calls 0x188f03c with the caller-provided output array.",
      managerVirtuals:
        "0x188f03c calls manager vtable +0x38 to determine temporary index capacity, then manager vtable +0x28 to fill a u16 index buffer.",
      entryMaterialization:
        "0x188f0d8..0x188f0e8 converts each u16 index into manager +0x10 + index*16 +0x8 and stores that concrete entry pointer into the output entry array.",
    },
    evidence: [
      "The Draw all scene entities composite task receives an x2 stack entry array. Current-binary evidence traces that array back through 0x188e784 into global manager slot 0x311a960 and builder 0x188f03c.",
      "0x188f03c does not invent entries locally. It asks the manager for indices, then materializes each entry pointer from manager records at +0x10 + index*16 +0x8.",
      "This proves the scene-entity task entries are manager-record pointers, but it still does not identify the concrete class stored at each record +0x8.",
    ],
    unresolved:
      "the concrete class/vtable type of the caller-provided entry pointer stored at manager +0x10 + index*16 +0x8",
  };
}

function buildSceneEntityManagerLifecycleEvidence(buffer, elf) {
  return {
    globalManagerSlot: addresses.sceneEntityEntryArrayGlobalSlot,
    globalManagerSlotHex: hex(addresses.sceneEntityEntryArrayGlobalSlot),
    constructorCallsite: addresses.sceneEntityManagerConstructorCallsite,
    constructorCallsiteHex: hex(addresses.sceneEntityManagerConstructorCallsite),
    globalStore: addresses.sceneEntityManagerGlobalStore,
    globalStoreHex: hex(addresses.sceneEntityManagerGlobalStore),
    destructorLoad: addresses.sceneEntityManagerDestructorLoad,
    destructorLoadHex: hex(addresses.sceneEntityManagerDestructorLoad),
    destructorDeleteCall: addresses.sceneEntityManagerDestructorDeleteCall,
    destructorDeleteCallHex: hex(addresses.sceneEntityManagerDestructorDeleteCall),
    destructorClear: addresses.sceneEntityManagerDestructorClear,
    destructorClearHex: hex(addresses.sceneEntityManagerDestructorClear),
    accessor: addresses.sceneEntityManagerAccessor,
    accessorHex: hex(addresses.sceneEntityManagerAccessor),
    constructor: addresses.sceneEntityManagerConstructor,
    constructorHex: hex(addresses.sceneEntityManagerConstructor),
    addRecord: addresses.sceneEntityManagerAddRecord,
    addRecordHex: hex(addresses.sceneEntityManagerAddRecord),
    removeRecord: addresses.sceneEntityManagerRemoveRecord,
    removeRecordHex: hex(addresses.sceneEntityManagerRemoveRecord),
    dispatchRecord: addresses.sceneEntityManagerDispatchRecord,
    dispatchRecordHex: hex(addresses.sceneEntityManagerDispatchRecord),
    addRecordCallers: findDirectBranchCallers(buffer, elf, addresses.sceneEntityManagerAddRecord).map((caller) => ({
      callerAddress: caller.callerAddress,
      callerAddressHex: caller.callerAddressHex,
      mode: caller.mode,
      instructionHex: caller.instructionHex,
    })),
    removeRecordCallers: findDirectBranchCallers(buffer, elf, addresses.sceneEntityManagerRemoveRecord).map((caller) => ({
      callerAddress: caller.callerAddress,
      callerAddressHex: caller.callerAddressHex,
      mode: caller.mode,
      instructionHex: caller.instructionHex,
    })),
    dispatchRecordCallers: findDirectBranchCallers(buffer, elf, addresses.sceneEntityManagerDispatchRecord).map(
      (caller) => ({
        callerAddress: caller.callerAddress,
        callerAddressHex: caller.callerAddressHex,
        mode: caller.mode,
        instructionHex: caller.instructionHex,
      }),
    ),
    accessorCallers: findDirectBranchCallers(buffer, elf, addresses.sceneEntityManagerAccessor).map((caller) => ({
      callerAddress: caller.callerAddress,
      callerAddressHex: caller.callerAddressHex,
      mode: caller.mode,
      instructionHex: caller.instructionHex,
    })),
    globalSlotReferences: findU64References(buffer, elf, addresses.sceneEntityEntryArrayGlobalSlot).map((reference) => ({
      virtualAddress: reference.virtualAddress,
      virtualAddressHex: reference.virtualAddressHex,
      section: reference.section,
      fileOffsetHex: reference.fileOffsetHex,
    })),
    layout: {
      allocationBytes: "0x8020",
      recordCapacity: 0x800,
      backingIndexedObjectOffset: "+0x0",
      recordBaseOffset: "+0x10",
      recordSizeBytes: 0x10,
      recordBackingIdOffset: "+0x2",
      recordEntryPointerOffset: "+0x8",
      freeListMetadataOffset: "+0x8010",
      interpretation:
        "0x311a960 is a fixed-capacity scene/entity record pool. The manager itself is not a vtable object; manager +0x0 points to a backing indexed object whose vtable is used for count, filter, add/remove, and per-record dispatch.",
    },
    operationPattern: {
      constructor:
        "0x188e008 calls 0x188eeb4 after allocating 0x8020 bytes. 0x188eeb4 stores the backing indexed object pointer at +0x0, initializes 0x800 16-byte records beginning at +0x10, then writes free-list metadata at +0x8010. 0x188e014 stores the allocation in global slot 0x311a960.",
      addRecord:
        "0x188eee0 reads the free-list head, calls backing object vtable +0x10 with the allocated record index, stores the returned record id at record +0x2, and stores the caller-provided entry pointer at record +0x8.",
      removeRecord:
        "0x188ef88 calls backing object vtable +0x18 with the record id, then returns the record index to the free list.",
      dispatchRecord:
        "0x188f020 maps a record index to manager +0x10 + index*16 +0x2 and branches through backing object vtable +0x20 with caller-provided runtime payload.",
      entryArray:
        "0x188f03c and 0x188f144 both ask backing object virtuals for filtered u16 record indices, then materialize concrete task entries from record +0x8.",
    },
    evidence: [
      "The scene/entity manager global at 0x311a960 now has current-binary lifecycle evidence: allocation/init, global store, accessor, shutdown load/delete/clear, add/remove, and per-record dispatch.",
      "The entry pointers used by Draw all scene entities are not guessed from file names. They are the exact caller-provided pointers stored by 0x188eee0 into manager records at +0x8.",
      "The same record index stored in model-side objects at +0xb0 is passed back into 0x188ef88/0x188f020 by multiple caller groups, which ties scene task entries to object lifecycle and transform/material update calls.",
    ],
    unresolved:
      "the concrete class/vtable names of the caller-provided entry pointers stored at record +0x8, and which of those entries invoke render-command owner A/B builders for the active hero/model preview path",
  };
}

function buildSceneEntityRecordEntryEvidence(buffer, elf) {
  const ownerBAccessorCallers = findDirectBranchCallers(
    buffer,
    elf,
    addresses.sceneEntityRecordEntryOwnerBAccessor,
  ).map((caller) => ({
    callerAddress: caller.callerAddress,
    callerAddressHex: caller.callerAddressHex,
    mode: caller.mode,
    instructionHex: caller.instructionHex,
  }));
  const ownerAAccessorCallers = findDirectBranchCallers(
    buffer,
    elf,
    addresses.sceneEntityRecordEntryOwnerAAccessor,
  ).map((caller) => ({
    callerAddress: caller.callerAddress,
    callerAddressHex: caller.callerAddressHex,
    mode: caller.mode,
    instructionHex: caller.instructionHex,
  }));
  return {
    recordEntryPointerSource: {
      callerA: {
        objectRegister: "x20",
        entryPointerExpression: "x3 = x20 + 0x30",
        entryPointerAddress: addresses.sceneEntityRecordAddCallerAEntryPointer,
        entryPointerAddressHex: hex(addresses.sceneEntityRecordAddCallerAEntryPointer),
        addRecordCall: addresses.sceneEntityRecordAddCallerAAddRecordCall,
        addRecordCallHex: hex(addresses.sceneEntityRecordAddCallerAAddRecordCall),
      },
      callerB: {
        objectRegister: "x20",
        entryPointerExpression: "x3 = x20 + 0x30",
        entryPointerAddress: addresses.sceneEntityRecordAddCallerBEntryPointer,
        entryPointerAddressHex: hex(addresses.sceneEntityRecordAddCallerBEntryPointer),
        addRecordCall: addresses.sceneEntityRecordAddCallerBAddRecordCall,
        addRecordCallHex: hex(addresses.sceneEntityRecordAddCallerBAddRecordCall),
      },
      conclusion:
        "Both current add-record callsites pass the model/scene object subobject at this +0x30 as x3. 0x188eee0 then stores that exact pointer into manager record +0x8.",
    },
    layoutB: {
      registerWrapperTail: addresses.sceneEntityRecordEntryLayoutBRegisterWrapperTail,
      registerWrapperTailHex: hex(addresses.sceneEntityRecordEntryLayoutBRegisterWrapperTail),
      registerFunction: addresses.sceneEntityRecordEntryLayoutBRegister,
      registerFunctionHex: hex(addresses.sceneEntityRecordEntryLayoutBRegister),
      registerDirectCallers: findDirectBranchCallers(
        buffer,
        elf,
        addresses.sceneEntityRecordEntryLayoutBRegister,
      ).map((caller) => ({
        callerAddress: caller.callerAddress,
        callerAddressHex: caller.callerAddressHex,
        mode: caller.mode,
        instructionHex: caller.instructionHex,
      })),
      wrapperArgumentSource: {
        modeOrFlags: "0x8d3110 reads w2 from object +0xac",
        tableOrDefaultSource:
          "0x8d3114 loads x1 from the global table pointer at 0x2ae54f0 before tail-branching to 0x8d398c",
        boundary:
          "This wrapper source is pointer/default-state evidence for layout B registration. It is not a string/resource payload and must not be promoted to an active lightfield/profile source.",
      },
      layoutStores: {
        transformBlock0: {
          address: addresses.sceneEntityRecordEntryLayoutBTransformStore0,
          addressHex: hex(addresses.sceneEntityRecordEntryLayoutBTransformStore0),
          objectOffset: "+0x68",
        },
        transformBlock1: {
          address: addresses.sceneEntityRecordEntryLayoutBTransformStore1,
          addressHex: hex(addresses.sceneEntityRecordEntryLayoutBTransformStore1),
          objectOffset: "+0x78",
        },
        transformBlock2: {
          address: addresses.sceneEntityRecordEntryLayoutBTransformStore2,
          addressHex: hex(addresses.sceneEntityRecordEntryLayoutBTransformStore2),
          objectOffset: "+0x88",
        },
        payloadPointer: {
          address: addresses.sceneEntityRecordEntryLayoutBPayloadPointerStore,
          addressHex: hex(addresses.sceneEntityRecordEntryLayoutBPayloadPointerStore),
          objectOffset: "+0x98",
        },
        flags: {
          address: addresses.sceneEntityRecordEntryLayoutBFlagsStore,
          addressHex: hex(addresses.sceneEntityRecordEntryLayoutBFlagsStore),
          objectOffset: "+0xa0",
        },
      },
      managerRegistration: {
        managerAccessorCall: addresses.sceneEntityRecordEntryLayoutBManagerAccessorCall,
        managerAccessorCallHex: hex(addresses.sceneEntityRecordEntryLayoutBManagerAccessorCall),
        entryPointerAddress: addresses.sceneEntityRecordAddCallerBEntryPointer,
        entryPointerAddressHex: hex(addresses.sceneEntityRecordAddCallerBEntryPointer),
        addRecordCall: addresses.sceneEntityRecordAddCallerBAddRecordCall,
        addRecordCallHex: hex(addresses.sceneEntityRecordAddCallerBAddRecordCall),
        recordIndexStore: addresses.sceneEntityRecordEntryLayoutBRecordIndexStore,
        recordIndexStoreHex: hex(addresses.sceneEntityRecordEntryLayoutBRecordIndexStore),
        conclusion:
          "Layout B uses the same manager and the same entry pointer convention as layout A: x3 is object +0x30, 0x188eee0 registers it, and the returned u16 record index is stored at object +0xb0.",
      },
      materialParamUpdate: {
        followupCallsite: addresses.sceneEntityRecordEntryLayoutBFollowupCallsite,
        followupCallsiteHex: hex(addresses.sceneEntityRecordEntryLayoutBFollowupCallsite),
        followupFunction: addresses.sceneEntityRecordEntryLayoutBFollowup,
        followupFunctionHex: hex(addresses.sceneEntityRecordEntryLayoutBFollowup),
        followupDirectCallers: findDirectBranchCallers(
          buffer,
          elf,
          addresses.sceneEntityRecordEntryLayoutBFollowup,
        ).map((caller) => ({
          callerAddress: caller.callerAddress,
          callerAddressHex: caller.callerAddressHex,
          mode: caller.mode,
          instructionHex: caller.instructionHex,
        })),
        bitfieldSource: "object +0x10c/+0x110",
        parameterSourceRange: "object +0xf8..+0x108",
        targetObject: "object +0x50",
        writerFunction: addresses.runtimeMaterialParamWriter,
        writerFunctionHex: hex(addresses.runtimeMaterialParamWriter),
        writeCallsites: [
          addresses.sceneEntityRecordEntryLayoutBParamWriteCallA,
          addresses.sceneEntityRecordEntryLayoutBParamWriteCallB,
          addresses.sceneEntityRecordEntryLayoutBParamWriteCallC,
          addresses.sceneEntityRecordEntryLayoutBParamWriteCallD,
          addresses.sceneEntityRecordEntryLayoutBParamWriteCallE,
          addresses.sceneEntityRecordEntryLayoutBParamWriteCallF,
        ].map((address) => ({ address, addressHex: hex(address) })),
        stateDispatchCallsite: addresses.sceneEntityRecordEntryLayoutBStateDispatchCallsite,
        stateDispatchCallsiteHex: hex(addresses.sceneEntityRecordEntryLayoutBStateDispatchCallsite),
        stateDispatchFunction: addresses.sceneEntityRecordEntryLayoutBStateDispatch,
        stateDispatchFunctionHex: hex(addresses.sceneEntityRecordEntryLayoutBStateDispatch),
        stateDispatchDirectCallers: findDirectBranchCallers(
          buffer,
          elf,
          addresses.sceneEntityRecordEntryLayoutBStateDispatch,
        ).map((caller) => ({
          callerAddress: caller.callerAddress,
          callerAddressHex: caller.callerAddressHex,
          mode: caller.mode,
          instructionHex: caller.instructionHex,
        })),
        conclusion:
          "Layout B has a separate runtime/material parameter refresh path. It decodes packed slots from object +0x10c/+0x110, reads values from object +0xf8..+0x108, writes them to the object +0x50 target through 0xe39830, and then enters an object +0x58 state-dependent path at 0x8d3c24.",
      },
      stateDispatch: {
        function: addresses.sceneEntityRecordEntryLayoutBStateDispatch,
        functionHex: hex(addresses.sceneEntityRecordEntryLayoutBStateDispatch),
        modeSource: "object +0xb8",
        linkedStateObject: "object +0x58",
        linkedStateVersion: "object +0x60 is compared with linked state object +0x8",
        staleStateBehavior:
          "when the linked state object's version does not match, object +0x58 is cleared and object +0x60 is reset from a global default-version source",
        modeBranches: [
          {
            mode: 1,
            converter: "0xc5c404",
            converterCallsite: hex(addresses.sceneEntityRecordEntryLayoutBStateMode1ConvertCall),
            transformApply: hex(addresses.sceneEntityRecordEntryLayoutBTransformApplyCallA),
          },
          {
            mode: 2,
            converter: "0xc5c504",
            converterCallsite: hex(addresses.sceneEntityRecordEntryLayoutBStateMode2ConvertCall),
            transformApply: hex(addresses.sceneEntityRecordEntryLayoutBTransformApplyCallA),
          },
          {
            mode: 3,
            helper: hex(addresses.sceneEntityRecordEntryLayoutBStateMode3Apply),
            helperCallsite: hex(addresses.sceneEntityRecordEntryLayoutBStateMode3ApplyCall),
          },
        ],
        transformApplyFunction: addresses.sceneEntityRecordEntryLayoutBTransformApply,
        transformApplyFunctionHex: hex(addresses.sceneEntityRecordEntryLayoutBTransformApply),
        transformApplyDirectCallers: findDirectBranchCallers(
          buffer,
          elf,
          addresses.sceneEntityRecordEntryLayoutBTransformApply,
        ).map((caller) => ({
          callerAddress: caller.callerAddress,
          callerAddressHex: caller.callerAddressHex,
          mode: caller.mode,
          instructionHex: caller.instructionHex,
        })),
        matrixComposeFunction: 0x8b5a60,
        matrixComposeCallsites: [
          addresses.sceneEntityRecordEntryLayoutBMatrixComposeCallA,
          addresses.sceneEntityRecordEntryLayoutBMatrixComposeCallB,
        ].map((address) => ({ address, addressHex: hex(address) })),
        optionalVisibilityUpdate: {
          function: addresses.sceneEntityRecordEntryLayoutBOptionalVisibilityUpdate,
          functionHex: hex(addresses.sceneEntityRecordEntryLayoutBOptionalVisibilityUpdate),
          callsite: addresses.sceneEntityRecordEntryLayoutBOptionalVisibilityCall,
          callsiteHex: hex(addresses.sceneEntityRecordEntryLayoutBOptionalVisibilityCall),
          condition: "object +0xc4 == 1",
        },
        finalRecordDispatch: {
          managerAccessorCall: addresses.sceneEntityRecordEntryLayoutBFinalManagerAccessorCall,
          managerAccessorCallHex: hex(addresses.sceneEntityRecordEntryLayoutBFinalManagerAccessorCall),
          paramTargetLoad: addresses.sceneEntityRecordEntryLayoutBParamPayloadTargetLoad,
          paramTargetLoadHex: hex(addresses.sceneEntityRecordEntryLayoutBParamPayloadTargetLoad),
          payloadBuilder: addresses.runtimeParamPayloadBuilder,
          payloadBuilderHex: hex(addresses.runtimeParamPayloadBuilder),
          payloadBuilderCall: addresses.sceneEntityRecordEntryLayoutBParamPayloadBuildCall,
          payloadBuilderCallHex: hex(addresses.sceneEntityRecordEntryLayoutBParamPayloadBuildCall),
          recordIndexLoad: addresses.sceneEntityRecordEntryLayoutBRecordIndexLoad,
          recordIndexLoadHex: hex(addresses.sceneEntityRecordEntryLayoutBRecordIndexLoad),
          dispatchCall: addresses.sceneEntityRecordEntryLayoutBFinalDispatchCall,
          dispatchCallHex: hex(addresses.sceneEntityRecordEntryLayoutBFinalDispatchCall),
          target: addresses.sceneEntityManagerDispatchRecord,
          targetHex: hex(addresses.sceneEntityManagerDispatchRecord),
        },
        conclusion:
          "Layout B state dispatch validates a linked object +0x58 state, converts or composes transform payloads, writes the resulting transform through 0x8d45d4, then builds a runtime payload from object +0x50 through 0xe3a510 and dispatches it to the existing scene/entity manager record with object +0xb0. This is a state/transform/record-dispatch path, not an active lightfield/profile selector.",
      },
    },
    entrySetup: {
      ownerBAccessor: addresses.sceneEntityRecordEntryOwnerBAccessor,
      ownerBAccessorHex: hex(addresses.sceneEntityRecordEntryOwnerBAccessor),
      ownerBGlobalSlot: addresses.globalRenderCommandBSlot,
      ownerBGlobalSlotHex: hex(addresses.globalRenderCommandBSlot),
      ownerBLoadCallsite: addresses.sceneEntityRecordEntryOwnerBLoadCallsite,
      ownerBLoadCallsiteHex: hex(addresses.sceneEntityRecordEntryOwnerBLoadCallsite),
      ownerAAccessor: addresses.sceneEntityRecordEntryOwnerAAccessor,
      ownerAAccessorHex: hex(addresses.sceneEntityRecordEntryOwnerAAccessor),
      ownerAGlobalSlot: addresses.globalRenderCommandASlot,
      ownerAGlobalSlotHex: hex(addresses.globalRenderCommandASlot),
      flagStore: addresses.sceneEntityRecordEntryFlagStore,
      flagStoreHex: hex(addresses.sceneEntityRecordEntryFlagStore),
      ownerAndCallbackStore: addresses.sceneEntityRecordEntryOwnerAndCallbackStore,
      ownerAndCallbackStoreHex: hex(addresses.sceneEntityRecordEntryOwnerAndCallbackStore),
      primaryVtableStore: addresses.sceneEntityRecordEntryPrimaryVtableStore,
      primaryVtableStoreHex: hex(addresses.sceneEntityRecordEntryPrimaryVtableStore),
      subVtableStore: addresses.sceneEntityRecordEntrySubVtableStore,
      subVtableStoreHex: hex(addresses.sceneEntityRecordEntrySubVtableStore),
      listInitCallsite: addresses.sceneEntityRecordEntryListInitCallsite,
      listInitCallsiteHex: hex(addresses.sceneEntityRecordEntryListInitCallsite),
      listInit: addresses.sceneEntityRecordEntryListInit,
      listInitHex: hex(addresses.sceneEntityRecordEntryListInit),
      listDestroy: addresses.sceneEntityRecordEntryListDestroy,
      listDestroyHex: hex(addresses.sceneEntityRecordEntryListDestroy),
      listUnlink: addresses.sceneEntityRecordEntryListUnlink,
      listUnlinkHex: hex(addresses.sceneEntityRecordEntryListUnlink),
      interpretation:
        "The record entry stored at manager record +0x8 is a subobject rooted at object +0x30. Its setup stores owner B from 0x18906ec at entry +0x8, stores the 0x2726740-derived callback/table pointer at entry +0x10, and initializes an entry-side list holder. This proves the entry is tied to global render-command owner infrastructure, but it still does not prove the final active preview profile.",
    },
    entryCallbacks: {
      helperDispatch: {
        table: "primaryVtable",
        tableSlotRelativeOffset: "+0x20",
        function: addresses.sceneEntityRecordEntryGlobalHelperDispatchSlot,
        functionHex: hex(addresses.sceneEntityRecordEntryGlobalHelperDispatchSlot),
        entryListAddressSetup: addresses.sceneEntityRecordEntryGlobalHelperDispatchSlot,
        entryListAddressSetupHex: hex(addresses.sceneEntityRecordEntryGlobalHelperDispatchSlot),
        payloadSetup: addresses.sceneEntityRecordEntryGlobalHelperDispatchPayload,
        payloadSetupHex: hex(addresses.sceneEntityRecordEntryGlobalHelperDispatchPayload),
        helperDispatchTail: addresses.sceneEntityRecordEntryGlobalHelperDispatchTail,
        helperDispatchTailHex: hex(addresses.sceneEntityRecordEntryGlobalHelperDispatchTail),
        helperDispatchThunk: addresses.globalHelperDispatchThunk,
        helperDispatchThunkHex: hex(addresses.globalHelperDispatchThunk),
        argumentPattern:
          "0xd7fc64 prepares x0 = object +0x58, 0xd7fc68 prepares x2 = object +0x40, then 0xd7fc70 tail-branches to 0x18906b0. This ties the entry callback table to the already recovered global helper/resource-render dispatch chain.",
      },
      ownerSwitch: {
        ownerACall: addresses.sceneEntityRecordEntryOwnerSwitchOwnerACall,
        ownerACallHex: hex(addresses.sceneEntityRecordEntryOwnerSwitchOwnerACall),
        ownerBCall: addresses.sceneEntityRecordEntryOwnerSwitchOwnerBCall,
        ownerBCallHex: hex(addresses.sceneEntityRecordEntryOwnerSwitchOwnerBCall),
        ownerStore: addresses.sceneEntityRecordEntryOwnerSwitchStore,
        ownerStoreHex: hex(addresses.sceneEntityRecordEntryOwnerSwitchStore),
        pattern:
          "0xd7fc74 selects owner A or owner B through 0x18906f8/0x18906ec and stores the selected global render-command owner at object +0x38.",
      },
      recordUpdateDispatch: {
        changeCheckCall: addresses.sceneEntityRecordEntryChangeCheckCall,
        changeCheckCallHex: hex(addresses.sceneEntityRecordEntryChangeCheckCall),
        payloadAccess: addresses.sceneEntityRecordEntryRecordDispatchPayloadAccess,
        payloadAccessHex: hex(addresses.sceneEntityRecordEntryRecordDispatchPayloadAccess),
        managerAccessorCall: addresses.sceneEntityRecordEntryRecordDispatchAccessorCall,
        managerAccessorCallHex: hex(addresses.sceneEntityRecordEntryRecordDispatchAccessorCall),
        dispatchRecordCall: addresses.sceneEntityRecordEntryRecordDispatchCall,
        dispatchRecordCallHex: hex(addresses.sceneEntityRecordEntryRecordDispatchCall),
        primaryConditionalUpdate: addresses.sceneEntityRecordEntryConditionalUpdatePrimary,
        primaryConditionalUpdateHex: hex(addresses.sceneEntityRecordEntryConditionalUpdatePrimary),
        callbackConditionalUpdate: addresses.sceneEntityRecordEntryConditionalUpdateCallback,
        callbackConditionalUpdateHex: hex(addresses.sceneEntityRecordEntryConditionalUpdateCallback),
        pattern:
          "0xd7fe18 builds a stack payload from entry-side state, calls the global manager accessor 0x188e7e0, loads the object +0xb0 record index, then calls 0x188f020. The primary and callback tables both have conditional thunks that enter this body when w1 == 1.",
      },
    },
    renderOwnerBuilderLink: {
      compositeDispatchEntryOwnerLoad: 0x18a14a4,
      compositeDispatchEntryOwnerLoadHex: hex(0x18a14a4),
      compositeDispatchOwnerVslotLoad: 0x18a14b0,
      compositeDispatchOwnerVslotLoadHex: hex(0x18a14b0),
      compositeDispatchOwnerVslotCall: 0x18a14b4,
      compositeDispatchOwnerVslotCallHex: hex(0x18a14b4),
      entryOwnerStore: addresses.sceneEntityRecordEntryOwnerAndCallbackStore,
      entryOwnerStoreHex: hex(addresses.sceneEntityRecordEntryOwnerAndCallbackStore),
      entryOwnerSwitchStore: addresses.sceneEntityRecordEntryOwnerSwitchStore,
      entryOwnerSwitchStoreHex: hex(addresses.sceneEntityRecordEntryOwnerSwitchStore),
      ownerABuilderSlot: addresses.renderCommandAOwnerBuilderSlot,
      ownerABuilderSlotHex: hex(addresses.renderCommandAOwnerBuilderSlot),
      ownerABuilderFunction: readPointer(buffer, elf, addresses.renderCommandAOwnerBuilderSlot),
      ownerABuilderFunctionHex: hex(readPointer(buffer, elf, addresses.renderCommandAOwnerBuilderSlot)),
      ownerBBuilderSlot: addresses.renderCommandBOwnerBuilderSlot,
      ownerBBuilderSlotHex: hex(addresses.renderCommandBOwnerBuilderSlot),
      ownerBBuilderFunction: readPointer(buffer, elf, addresses.renderCommandBOwnerBuilderSlot),
      ownerBBuilderFunctionHex: hex(readPointer(buffer, elf, addresses.renderCommandBOwnerBuilderSlot)),
      conclusion:
        "Scene/entity composite dispatch loads the owner from entry +0x8 and calls that owner's vtable +0x10. The recovered record entry is object +0x30, and its entry +0x8/object +0x38 is initialized or switched to global render-command owner B/A. Because owner A/B vtable +0x10 resolves to 0x1892120/0x189366c, this links scene/entity record entries to render owner builder invocation.",
    },
    x4TransformProviderLink: {
      compositeDispatchX4:
        "0x18a14b4 calls the owner builder with x4 set to the current entry. For scene entities, that entry is object +0x30.",
      derivedProvider:
        "Both owner builders pre-decrement x4 by 8 before reading the provider vtable, so the provider subobject is object +0x28.",
      providerVtable: addresses.sceneEntityRecordEntrySubVtableBase,
      providerVtableHex: hex(addresses.sceneEntityRecordEntrySubVtableBase),
      providerTransformSlot: addresses.sceneEntityRecordEntrySubVtableBase + 0x18,
      providerTransformSlotHex: hex(addresses.sceneEntityRecordEntrySubVtableBase + 0x18),
      providerTransformFunction: readPointer(buffer, elf, addresses.sceneEntityRecordEntrySubVtableBase + 0x18),
      providerTransformFunctionHex: hex(readPointer(buffer, elf, addresses.sceneEntityRecordEntrySubVtableBase + 0x18)),
      transformSourceReturn: addresses.sceneEntityRecordEntryTransformProviderReturn,
      transformSourceReturnHex: hex(addresses.sceneEntityRecordEntryTransformProviderReturn),
      transformSourcePointer: "object +0x70",
      sampledColumnPointer: "object +0xa0",
      renderCommandABuilderEvidence: {
        entryMove: hex(addresses.renderCommandAX4EntryMove),
        providerPredecrementLoad: hex(addresses.renderCommandAX4ProviderPredecrementLoad),
        transformVslotLoad: hex(0x189216c),
        transformVslotCall: hex(0x1892170),
      },
      renderCommandBBuilderEvidence: {
        entryMove: hex(addresses.renderCommandBX4EntryMove),
        providerPredecrementLoad: hex(addresses.renderCommandBX4ProviderPredecrementLoad),
        transformVslotLoad: hex(0x18936c8),
        transformVslotCall: hex(0x18936cc),
      },
      conclusion:
        "The x4 transform provider for scene/entity render-owner builders is no longer unknown. Composite dispatch passes x4 = entry = object +0x30; the owner builders use x4-8 = object +0x28; object +0x28 uses table 0x2726710; its +0x18 slot returns object +0x70, whose +0x30 column becomes the render command sample position at command +0x50.",
    },
    tables: {
      primaryVtable: {
        base: addresses.sceneEntityRecordEntryPrimaryVtableBase,
        baseHex: hex(addresses.sceneEntityRecordEntryPrimaryVtableBase),
        neighborhood: pointerNeighborhood(buffer, elf, addresses.sceneEntityRecordEntryPrimaryVtableBase, 0x10, 0x50),
      },
      subVtable: {
        base: addresses.sceneEntityRecordEntrySubVtableBase,
        baseHex: hex(addresses.sceneEntityRecordEntrySubVtableBase),
        neighborhood: pointerNeighborhood(buffer, elf, addresses.sceneEntityRecordEntrySubVtableBase, 0x10, 0x50),
      },
      callbackTable: {
        base: addresses.sceneEntityRecordEntryCallbackTableBase,
        baseHex: hex(addresses.sceneEntityRecordEntryCallbackTableBase),
        neighborhood: pointerNeighborhood(buffer, elf, addresses.sceneEntityRecordEntryCallbackTableBase, 0x10, 0x50),
      },
    },
    helperAccessors: {
      ownerBAccessorCallers,
      ownerAAccessorCallers,
    },
    evidence: [
      "The previously opaque manager record +0x8 entry pointer is now tied to two current add-record callers: both pass x3 = object +0x30 into 0x188eee0.",
      "One entry setup path calls 0x18906ec and stores the returned global render-command owner B pointer plus a 0x2726740-derived callback/table pointer into the entry subobject.",
      "The surrounding object writes table/vtable bases 0x27266c0 and 0x2726710 while setting up the same object family. The entry-side callback/table neighborhood starts at 0x2726740.",
      "The primary entry table +0x20 slot now has current-binary dispatch evidence: 0xd7fc64 prepares x0 = object +0x58, 0xd7fc68 prepares x2 = object +0x40, and 0xd7fc70 tail-branches into 0x18906b0, the global helper dispatch thunk.",
      "The entry update path also loops back through the 0x311a960 manager: conditional table thunks at 0xd80100 and 0xd80110 enter 0xd7fe18, which builds a stack payload and calls 0x188f020 with the object's stored record index at +0xb0.",
      "The render-owner builder link is now current-binary evidence: composite dispatch loads entry +0x8 and calls owner vtable +0x10; entry +0x8 is initialized/switched to global render-command owner B/A; owner A/B vtable +0x10 resolves to 0x1892120/0x189366c.",
      "The x4 transform-provider link is also current-binary evidence: owner builders derive provider = x4-8, which maps scene/entity entries to object +0x28 and sub-vtable 0x2726710; sub-vtable +0x18 returns object +0x70 as the transform source.",
      "A second scene/entity entry layout is now current-binary evidence: the 0x8d3118 wrapper tail-calls 0x8d398c, layout B writes transform/default blocks at object +0x68/+0x78/+0x88, still registers object +0x30 through 0x188eee0, and stores the returned record index at object +0xb0.",
      "Layout B also has a separate runtime/material parameter refresh path: 0x8d3188 calls 0x8d3a80, which decodes object +0x10c/+0x110 bitfields, writes selected values from object +0xf8..+0x108 through 0xe39830 into object +0x50, then tail-branches toward object +0x58 state handling at 0x8d3c24.",
      "The layout B state path is now bounded: 0x8d3c24 validates object +0x58 against object +0x60, converts linked-state data for modes 1/2/3, applies transforms through 0x8d45d4, then calls 0xe3a510 on object +0x50 and dispatches that payload through 0x188f020 using object +0xb0. This is state/transform record dispatch, not a LevelVisuals/lightfield profile selector.",
      "The layout B wrapper source at 0x2ae54f0 is table/default-state evidence, not a string or .lightfield profile payload, so it tightens the scene/entity runtime chain without resolving the active hero preview profile.",
      "This moves the scene-entity chain from anonymous record entries to concrete render-owner builder invocation, transform-provider source, and x2-derived render queue sort key. It is still diagnostic-only because the active preview profile/lightfield payload selected before draw remains unresolved.",
    ],
    unresolved:
      "the active preview profile/lightfield payload selected before draw and the full character-lit shader formula",
  };
}

function buildSceneEntityRuntimeParamEvidence(buffer, elf) {
  const globalSlots = [
    addresses.sceneEntityRuntimeParamGlobalBase,
    addresses.sceneEntityRuntimeParamGlobalBase + 0x8,
    addresses.sceneEntityRuntimeParamGlobalBase + 0x10,
    addresses.sceneEntityRuntimeParamGlobalBase + 0x18,
    addresses.sceneEntityRuntimeParamGlobalBase + 0x20,
  ];
  return {
    accessor: addresses.sceneEntityRuntimeParamAccessor,
    accessorHex: hex(addresses.sceneEntityRuntimeParamAccessor),
    globalTableBase: addresses.sceneEntityRuntimeParamGlobalBase,
    globalTableBaseHex: hex(addresses.sceneEntityRuntimeParamGlobalBase),
    globalSlots: globalSlots.map((slotAddress, index) => ({
      index,
      slotAddress,
      slotAddressHex: hex(slotAddress),
    })),
    directCallers: findDirectBranchCallers(buffer, elf, addresses.sceneEntityRuntimeParamAccessor).map((caller) => ({
      callerAddress: caller.callerAddress,
      callerAddressHex: caller.callerAddressHex,
      mode: caller.mode,
      instructionHex: caller.instructionHex,
    })),
    globalSlotTextReferences: buildTextReferenceEvidence(
      buffer,
      elf,
      globalSlots.map((slotAddress, index) => ({
        name: `scene-entity-runtime-param-slot-${index}`,
        virtualAddress: slotAddress,
      })),
    ),
    initPattern: {
      tableBaseAdd: addresses.sceneEntityRuntimeParamInitBaseAdd,
      tableBaseAddHex: hex(addresses.sceneEntityRuntimeParamInitBaseAdd),
      slot0Slot1Store: addresses.sceneEntityRuntimeParamInitSlotPairStore,
      slot0Slot1StoreHex: hex(addresses.sceneEntityRuntimeParamInitSlotPairStore),
      slot2Store: addresses.sceneEntityRuntimeParamInitSlot2Store,
      slot2StoreHex: hex(addresses.sceneEntityRuntimeParamInitSlot2Store),
      slot3Store: addresses.sceneEntityRuntimeParamInitSlot3Store,
      slot3StoreHex: hex(addresses.sceneEntityRuntimeParamInitSlot3Store),
      slot4Store: addresses.sceneEntityRuntimeParamInitSlot4Store,
      slot4StoreHex: hex(addresses.sceneEntityRuntimeParamInitSlot4Store),
      interpretation:
        "0x189d430-family init allocates multiple runtime-parameter objects and stores them into global slots 0x311af50, 0x311af58, 0x311af60, 0x311af68, and 0x311af70.",
    },
    slot0Object: {
      constructor: addresses.sceneEntityRuntimeParamSlot0Constructor,
      constructorHex: hex(addresses.sceneEntityRuntimeParamSlot0Constructor),
      vtableBase: addresses.sceneEntityRuntimeParamSlot0VtableBase,
      vtableBaseHex: hex(addresses.sceneEntityRuntimeParamSlot0VtableBase),
      vtableWrite: addresses.sceneEntityRuntimeParamSlot0VtableWrite,
      vtableWriteHex: hex(addresses.sceneEntityRuntimeParamSlot0VtableWrite),
      renderObjectBuildSlot: addresses.sceneEntityRuntimeParamSlot0VtableBase + 0x10,
      renderObjectBuildSlotHex: hex(addresses.sceneEntityRuntimeParamSlot0VtableBase + 0x10),
      renderObjectBuildFunction: readPointer(buffer, elf, addresses.sceneEntityRuntimeParamSlot0VtableBase + 0x10),
      renderObjectBuildFunctionHex: hex(readPointer(buffer, elf, addresses.sceneEntityRuntimeParamSlot0VtableBase + 0x10)),
      callbackDispatchSlot: addresses.sceneEntityRuntimeParamSlot0VtableBase + 0x18,
      callbackDispatchSlotHex: hex(addresses.sceneEntityRuntimeParamSlot0VtableBase + 0x18),
      callbackDispatchFunction: readPointer(buffer, elf, addresses.sceneEntityRuntimeParamSlot0VtableBase + 0x18),
      callbackDispatchFunctionHex: hex(readPointer(buffer, elf, addresses.sceneEntityRuntimeParamSlot0VtableBase + 0x18)),
      queueFlushSlot: addresses.sceneEntityRuntimeParamSlot0VtableBase + 0x28,
      queueFlushSlotHex: hex(addresses.sceneEntityRuntimeParamSlot0VtableBase + 0x28),
      queueFlushFunction: readPointer(buffer, elf, addresses.sceneEntityRuntimeParamSlot0VtableBase + 0x28),
      queueFlushFunctionHex: hex(readPointer(buffer, elf, addresses.sceneEntityRuntimeParamSlot0VtableBase + 0x28)),
      vtableNeighborhood: pointerNeighborhood(buffer, elf, addresses.sceneEntityRuntimeParamSlot0VtableBase, 0x10, 0x50),
      interpretation:
        "The scene/entity table slot 0 object is constructed by 0x189f7ec with primary vtable 0x2ab54a0. Owner builders call its +0x10 slot, which resolves to 0x189f850.",
    },
    returnedObject: {
      constructor: addresses.sceneEntityRuntimeParamSlot0RenderObjectConstructor,
      constructorHex: hex(addresses.sceneEntityRuntimeParamSlot0RenderObjectConstructor),
      vtableBase: addresses.sceneEntityRuntimeParamReturnedObjectVtableBase,
      vtableBaseHex: hex(addresses.sceneEntityRuntimeParamReturnedObjectVtableBase),
      vtableWrite: addresses.sceneEntityRuntimeParamReturnedObjectVtableWrite,
      vtableWriteHex: hex(addresses.sceneEntityRuntimeParamReturnedObjectVtableWrite),
      valueAccessorSlot: addresses.sceneEntityRuntimeParamReturnedObjectVtableBase + 0x10,
      valueAccessorSlotHex: hex(addresses.sceneEntityRuntimeParamReturnedObjectVtableBase + 0x10),
      valueAccessorFunction: readPointer(buffer, elf, addresses.sceneEntityRuntimeParamReturnedObjectVtableBase + 0x10),
      valueAccessorFunctionHex: hex(readPointer(buffer, elf, addresses.sceneEntityRuntimeParamReturnedObjectVtableBase + 0x10)),
      vtableNeighborhood: pointerNeighborhood(
        buffer,
        elf,
        addresses.sceneEntityRuntimeParamReturnedObjectVtableBase,
        0x10,
        0x70,
      ),
      renderCommandUsage: [
        {
          command: "render-command-a",
          vslotLoad: addresses.renderCommandAParamRuntimeResultVslotLoad,
          vslotLoadHex: hex(addresses.renderCommandAParamRuntimeResultVslotLoad),
          vcall: addresses.renderCommandAParamRuntimeResultVcall,
          vcallHex: hex(addresses.renderCommandAParamRuntimeResultVcall),
          resultStore: addresses.renderCommandAParamRuntimeResultStore,
          resultStoreHex: hex(addresses.renderCommandAParamRuntimeResultStore),
          destination: "queued command +0x18",
        },
        {
          command: "render-command-b",
          vslotLoad: addresses.renderCommandBParamRuntimeResultVslotLoad,
          vslotLoadHex: hex(addresses.renderCommandBParamRuntimeResultVslotLoad),
          vcall: addresses.renderCommandBParamRuntimeResultVcall,
          vcallHex: hex(addresses.renderCommandBParamRuntimeResultVcall),
          resultStore: addresses.renderCommandBParamRuntimeResultStore,
          resultStoreHex: hex(addresses.renderCommandBParamRuntimeResultStore),
          destination: "queued command +0x18",
        },
      ],
      sourceTableProgramPath: {
        constructorSourceTableLoad: addresses.sceneEntityRuntimeParamReturnedObjectSourceTableLoad,
        constructorSourceTableLoadHex: hex(addresses.sceneEntityRuntimeParamReturnedObjectSourceTableLoad),
        constructorSourceTableIndexedAddress: addresses.sceneEntityRuntimeParamReturnedObjectSourceTableIndexedAddress,
        constructorSourceTableIndexedAddressHex: hex(
          addresses.sceneEntityRuntimeParamReturnedObjectSourceTableIndexedAddress,
        ),
        constructorSourceEntryLoad: addresses.sceneEntityRuntimeParamReturnedObjectSourceEntryLoad,
        constructorSourceEntryLoadHex: hex(addresses.sceneEntityRuntimeParamReturnedObjectSourceEntryLoad),
        programApplyFunction: addresses.sceneEntityRuntimeParamReturnedObjectProgramApply,
        programApplyFunctionHex: hex(addresses.sceneEntityRuntimeParamReturnedObjectProgramApply),
        programPointerLoad: addresses.sceneEntityRuntimeParamReturnedObjectProgramPointerLoad,
        programPointerLoadHex: hex(addresses.sceneEntityRuntimeParamReturnedObjectProgramPointerLoad),
        glUseProgramCall: addresses.sceneEntityRuntimeParamReturnedObjectGlUseProgramCall,
        glUseProgramCallHex: hex(addresses.sceneEntityRuntimeParamReturnedObjectGlUseProgramCall),
        parameterPayloadLoad: addresses.sceneEntityRuntimeParamReturnedObjectProgramParamLoad,
        parameterPayloadLoadHex: hex(addresses.sceneEntityRuntimeParamReturnedObjectProgramParamLoad),
        parameterApplyCall: addresses.sceneEntityRuntimeParamReturnedObjectProgramParamApplyCall,
        parameterApplyCallHex: hex(addresses.sceneEntityRuntimeParamReturnedObjectProgramParamApplyCall),
        interpretation:
          "The returned-object constructor uses the mapped small source object +0 as a source/program table, selects entry[index] +0x8, reads entry +0x10 for the sort key, and the +0x18/+0x28 apply path later selects the same table entry to call glUseProgram from entry +0 and apply parameters from entry +0x8.",
      },
      interpretation:
        "0x189f850 returns a per-command runtime object constructed by 0x189f8f8 with vtable 0x2ab54f8. Render-command A/B builders call that returned object's +0x10 accessor and store the result at queued command +0x18 before copying transforms and appending the command.",
    },
    sourceMapping: {
      lookupFunction: addresses.renderOwnerSourceMappingLookup,
      lookupFunctionHex: hex(addresses.renderOwnerSourceMappingLookup),
      buildFunction: addresses.renderOwnerSourceMappingBuild,
      buildFunctionHex: hex(addresses.renderOwnerSourceMappingBuild),
      sourceVectorAppendHelper: addresses.renderOwnerSourceMappingSourceVectorAppendHelper,
      sourceVectorAppendHelperHex: hex(addresses.renderOwnerSourceMappingSourceVectorAppendHelper),
      entryVectorAppendHelper: addresses.renderOwnerSourceMappingEntryVectorAppendHelper,
      entryVectorAppendHelperHex: hex(addresses.renderOwnerSourceMappingEntryVectorAppendHelper),
      entryArrayOffset: "+0x18",
      sourceArrayOffset: "+0x8",
      countOffset: "+0x10",
      nextEntryOffset: "+0x58",
      fallbackSourceExpression: "entry +0x8 when owner lookup returns null",
      sourceTableMount: {
        wrapper: addresses.sceneEntitySourceTableMountWrapper,
        wrapperHex: hex(addresses.sceneEntitySourceTableMountWrapper),
        tailCall: addresses.sceneEntitySourceTableMountTail,
        tailCallHex: hex(addresses.sceneEntitySourceTableMountTail),
        directCallers: findDirectBranchCallers(buffer, elf, addresses.sceneEntitySourceTableMountWrapper).map(
          (caller) => ({
            callerAddress: caller.callerAddress,
            callerAddressHex: caller.callerAddressHex,
            mode: caller.mode,
            instructionHex: caller.instructionHex,
          }),
        ),
        provenCloneMounts: [
          {
            cloneCall: addresses.sceneEntitySourceTableMountCloneCallA,
            cloneCallHex: hex(addresses.sceneEntitySourceTableMountCloneCallA),
            mountCall: addresses.sceneEntitySourceTableMountCallA,
            mountCallHex: hex(addresses.sceneEntitySourceTableMountCallA),
            sourceTableSource: "0x189be5c clone/finalize result from a temporary source/program table",
          },
          {
            cloneCall: addresses.sceneEntitySourceTableMountCloneCallB,
            cloneCallHex: hex(addresses.sceneEntitySourceTableMountCloneCallB),
            mountCall: addresses.sceneEntitySourceTableMountCallB,
            mountCallHex: hex(addresses.sceneEntitySourceTableMountCallB),
            sourceTableSource: "0x189be5c clone/finalize result from a multi-entry temporary source/program table",
          },
        ],
        stateSwitchMounts: [
          {
            sourceLoad: addresses.sceneEntityLayoutBSourceTableMountState0SourceLoad,
            sourceLoadHex: hex(addresses.sceneEntityLayoutBSourceTableMountState0SourceLoad),
            mountCall: addresses.sceneEntityLayoutBSourceTableMountState0Call,
            mountCallHex: hex(addresses.sceneEntityLayoutBSourceTableMountState0Call),
            sourceField: "layout-B object +0x40",
          },
          {
            sourceLoad: addresses.sceneEntityLayoutBSourceTableMountState1SourceLoad,
            sourceLoadHex: hex(addresses.sceneEntityLayoutBSourceTableMountState1SourceLoad),
            mountCall: addresses.sceneEntityLayoutBSourceTableMountState1Call,
            mountCallHex: hex(addresses.sceneEntityLayoutBSourceTableMountState1Call),
            sourceField: "layout-B object +0x48",
          },
          {
            sourceLoad: addresses.sceneEntityLayoutBSourceTableMountState2SourceLoad,
            sourceLoadHex: hex(addresses.sceneEntityLayoutBSourceTableMountState2SourceLoad),
            mountCall: addresses.sceneEntityLayoutBSourceTableMountState2Call,
            mountCallHex: hex(addresses.sceneEntityLayoutBSourceTableMountState2Call),
            sourceField: "layout-B object +0x50",
          },
        ],
        dynamicProducers: [
          {
            function: addresses.dynamicSourceProgramTableProducer,
            functionHex: hex(addresses.dynamicSourceProgramTableProducer),
            directCallers: findDirectBranchCallers(buffer, elf, addresses.dynamicSourceProgramTableProducer).map(
              (caller) => ({
                callerAddress: caller.callerAddress,
                callerAddressHex: caller.callerAddressHex,
                mode: caller.mode,
                instructionHex: caller.instructionHex,
              }),
            ),
            tempTableInitCallHex: hex(addresses.dynamicSourceProgramTableTempInitCall),
            entryWriterCallHex: hex(addresses.dynamicSourceProgramTableEntryWriterCall),
            cloneFinalizeCallHex: hex(addresses.dynamicSourceProgramTableCloneCall),
            destinationStoreHex: hex(addresses.dynamicSourceProgramTableDestinationStore),
            mountCallHex: hex(addresses.dynamicSourceProgramTableMountCall),
            acceptedResourceIdCounts: [1, 2, 3, 4],
            inputShape:
              "x0 scene/entity holder or selected node; x1 destination pointer for cloned table; x2 top-level resource-list head",
            listShape:
              "top-level nodes are walked through x21 +0x8; each node +0x8 points to a nested id list; ids are loaded from nested node +0 and passed to 0x189bde4 via the stack scratch array",
            callerShapes: [
              {
                caller: addresses.dynamicSourceProgramTableDirectCallerCall,
                callerHex: hex(addresses.dynamicSourceProgramTableDirectCallerCall),
                sceneObject: "[x19 +0x48]",
                destination: "x19 +0x50",
                resourceListAlternatives: ["[x23 +0x28]", "[x24 +0x28]"],
              },
              {
                caller: addresses.dynamicSourceProgramTableSelectorTailCall,
                callerHex: hex(addresses.dynamicSourceProgramTableSelectorTailCall),
                sceneObject: "matched node from object +0x18 chain, or null",
                destination: "object +0x28",
                resourceList: "original x1 preserved into x2",
                selector:
                  "walks candidate nodes through node +0x20 and compares candidate payload +0xa4 against global 0x30349e4",
              },
            ],
            upstreamSelection: {
              function: addresses.dynamicSourceProgramTableUpstreamFunction,
              functionHex: hex(addresses.dynamicSourceProgramTableUpstreamFunction),
              callerResourceSlotBase: "input x2, preserved as x24/x21",
              ownerConfigSource: "input x1 stored at object +0x38; x1 +0x1d8 is indexed by the current global type/class index",
              defaultResourceNode: "(*(x1 +0x1d8))[currentTypeIndex] +0x8",
              primarySlot:
                "caller slot x2 +0x8 is used when its resource pointer validates through 0xd6d6e0; otherwise x23 falls back to the default resource node +0x8",
              secondarySlot:
                "caller slot x2 +0x10 is used when it validates through 0xd6d6e0; otherwise x24 falls back to the default resource node +0x8",
              selectedResourceValidation:
                "0x8abe6c validates *x23 first, then *(x24 +0x8); if both fail it exits before creating the scene/entity object or calling 0xbac9d4",
              sceneObject:
                "after validation, 0x8abe6c creates/resolves a scene/entity object through 0x188b8b8, stores it at object +0x48, attaches the selected resource pointer through vtable +0x20, then passes object +0x48 and the selected slot +0x28 list to 0xbac9d4",
              postMount:
                "after 0xbac9d4 mounts the source/program table, 0x8abe6c copies x23 +0x30 to scene object +0x33 and calls 0xd7fcbc to initialize/update transform state",
              boundary:
                "This proves native slot selection and fallback mechanics. It does not assign gameplay names to the resource slots or prove active light/probe/profile ownership.",
            },
            selectorCallsite: {
              function: addresses.dynamicSourceProgramTableSelectorCallerFunction,
              functionHex: hex(addresses.dynamicSourceProgramTableSelectorCallerFunction),
              selectorCall: addresses.dynamicSourceProgramTableSelectorCallerSelectorCall,
              selectorCallHex: hex(addresses.dynamicSourceProgramTableSelectorCallerSelectorCall),
              guard: "x19 +0x38 must validate through 0xd6d6e0; otherwise the 0x8d551c selector path is skipped",
              parentObject:
                "0x8cca64 creates/resolves a parent object through 0x188b8b8 with index loaded from global 0x30350c8",
              selectorChildObject:
                "under that parent, 0x8cca64 creates/resolves a child object with index 0x30349e4, attaches x19 +0x30 through vtable +0x20, then calls 0x8d551c",
              selectorArguments: {
                x0: "parent object resolved through 0x188b8b8",
                x1: "x19 +0x68 resource/list argument",
              },
              postSelectorSetup:
                "after 0x8d551c, 0x8cca64 creates/resolves another child using global 0x30349f0 and calls 0x8b4790 with x19 +0x38 and x19 +0x40",
              registryIndexSources: {
                parentIndex30350c8: {
                  global: "0x30350c8",
                  lazyInitializer: hex(addresses.dynamicSourceProgramTableParentLazyInitFunction),
                  typeRegistration: hex(addresses.dynamicSourceProgramTableParentTypeRegister),
                  typeRecordShape:
                    "0x8d5434 allocates a shared 0x2e8 stride type record, stores callback pair at +0xb0, stores [type index, 0x30] at +0xa4, and writes the type index to global 0x30350c8",
                  lazyInitShape:
                    "0x79f268 uses adjacent flag 0x30350d0, reads shared type-record pointer 0x2adec30, then copies the record index word into global 0x30350c8",
                },
                selectorChildIndex30349e4: {
                  global: "0x30349e4",
                  lazyInitializer: hex(addresses.dynamicSourceProgramTableSelectorChildLazyInitFunction),
                  typeRegistration: hex(addresses.dynamicSourceProgramTableSelectorChildTypeRegister),
                  typeRecordShape:
                    "0xd7fc20 allocates the shared type record, stores callback pair at +0xb0, stores [type index, 0xb8] at +0xa4, and writes the type index to global 0x30349e4",
                  lazyInitShape:
                    "0x79e688 uses adjacent flag 0x30349e8, reads shared type-record pointer 0x2adec30, then copies the record index word into global 0x30349e4",
                },
                postChildIndex30349f0: {
                  global: "0x30349f0",
                  lazyInitializer: hex(addresses.dynamicSourceProgramTablePostChildLazyInitFunction),
                  typeRegistration: hex(addresses.dynamicSourceProgramTablePostChildTypeRegister),
                  postSetup: hex(addresses.dynamicSourceProgramTablePostChildSetupFunction),
                  typeRecordShape:
                    "0x8b4154 allocates the shared type record, stores callback pair at +0xb0, writes control literal 0xfa, stores [type index, 0x1d18] at +0xa4, and writes the type index to global 0x30349f0",
                  lazyInitShape:
                    "0x79e6b4 uses adjacent flag 0x30349f8, reads shared type-record pointer 0x2adec30, then copies the record index word into global 0x30349f0",
                  setupShape:
                    "0x8b4790 calls the child object's vtable +0x10, clones/builds payload data from x19 +0x38 through 0x189b158, stores that payload into object +0x1be8 and +0x28, then applies the primary x19 +0x40 transform/config block through 0x8b4880",
                },
              },
              boundary:
                "This proves when the selector path is invoked, where its three registry/type indices come from, and how the post-selector child receives config/transform data. It still does not name the resource-list semantics or active profile payload.",
            },
            interpretation:
              "0xbac9d4 is a proven dynamic source/program table producer: it initializes a temporary table, walks resource-list nodes, extracts 1..4 ids, appends entries through 0x189bde4, clones/finalizes through 0x189be5c, stores the cloned table to the caller destination, then immediately mounts it through 0xd8003c.",
          },
        ],
        interpretation:
          "The original runtime mounts source/program tables by deriving object +0x58 and tail-calling 0x18907a8. Two current-package callsites clone/finalize a temporary table through 0x189be5c and immediately mount that result, layout-B state-switch paths mount prebuilt table fields at +0x40/+0x48/+0x50, and 0xbac9d4 is now recovered as the dynamic resource-list producer that builds, clones, stores, and mounts source/program tables from nested resource id lists.",
      },
      interpretation:
        "Render-command builders first call 0x1891818(owner, entry). That lookup searches owner +0x18 for the current entry and returns the paired object from owner +0x8. 0x18916c8 builds the two arrays by first reading the caller entry's holder at +0x28, then walking that holder's chain through chain node +0x58. For each chain node, it stores *(source holder +0), where source holder is *(chain node +0x8), into the small source object +0 and stores the runtime payload/context at +0x8. The source append call uses helper 0xe3c52c, and the entry append call uses helper 0x1891790; both helpers have matching count-load/count-store/array-slot-store shapes, so owner +0x8 and owner +0x18 are paired by append order. If the lookup returns null, the builders fall back to entry +0x8.",
    },
    queuedCommandSortKey: {
      sortAndReappend: addresses.renderCommandQueueSortAndReappend,
      sortAndReappendHex: hex(addresses.renderCommandQueueSortAndReappend),
      countLoad: addresses.renderCommandQueueSortCountLoad,
      countLoadHex: hex(addresses.renderCommandQueueSortCountLoad),
      headLoad: addresses.renderCommandQueueSortHeadLoad,
      headLoadHex: hex(addresses.renderCommandQueueSortHeadLoad),
      keyLoad: addresses.renderCommandQueueSortKeyLoad,
      keyLoadHex: hex(addresses.renderCommandQueueSortKeyLoad),
      pairStore: addresses.renderCommandQueueSortPairStore,
      pairStoreHex: hex(addresses.renderCommandQueueSortPairStore),
      nextLoad: addresses.renderCommandQueueSortNextLoad,
      nextLoadHex: hex(addresses.renderCommandQueueSortNextLoad),
      sortCall: addresses.renderCommandQueueSortCall,
      sortCallHex: hex(addresses.renderCommandQueueSortCall),
      reappendCall: addresses.renderCommandQueueSortReappendCall,
      reappendCallHex: hex(addresses.renderCommandQueueSortReappendCall),
      partitionFunction: addresses.renderCommandQueueSortPartition,
      partitionFunctionHex: hex(addresses.renderCommandQueueSortPartition),
      pivotKeyLoad: addresses.renderCommandQueueSortPivotKeyLoad,
      pivotKeyLoadHex: hex(addresses.renderCommandQueueSortPivotKeyLoad),
      leftKeyLoad: addresses.renderCommandQueueSortLeftKeyLoad,
      leftKeyLoadHex: hex(addresses.renderCommandQueueSortLeftKeyLoad),
      leftKeyCompare: addresses.renderCommandQueueSortLeftKeyCompare,
      leftKeyCompareHex: hex(addresses.renderCommandQueueSortLeftKeyCompare),
      rightKeyLoad: addresses.renderCommandQueueSortRightKeyLoad,
      rightKeyLoadHex: hex(addresses.renderCommandQueueSortRightKeyLoad),
      rightKeyCompare: addresses.renderCommandQueueSortRightKeyCompare,
      rightKeyCompareHex: hex(addresses.renderCommandQueueSortRightKeyCompare),
      interpretation:
        "Queued command +0x18 is consumed by the render queue as a sort key. 0x18a1698 builds temporary [command+0x18 key, command pointer] pairs, calls 0x18a1750 to sort those pairs by the first qword, clears the queue, and re-appends commands in sorted order.",
    },
    destroyPattern: {
      slot4Load: addresses.sceneEntityRuntimeParamDestroySlot4Load,
      slot4LoadHex: hex(addresses.sceneEntityRuntimeParamDestroySlot4Load),
      slot3Load: addresses.sceneEntityRuntimeParamDestroySlot3Load,
      slot3LoadHex: hex(addresses.sceneEntityRuntimeParamDestroySlot3Load),
      slot2Load: addresses.sceneEntityRuntimeParamDestroySlot2Load,
      slot2LoadHex: hex(addresses.sceneEntityRuntimeParamDestroySlot2Load),
      arrayBaseAdd: addresses.sceneEntityRuntimeParamDestroyBaseAdd,
      arrayBaseAddHex: hex(addresses.sceneEntityRuntimeParamDestroyBaseAdd),
      arrayLoad: addresses.sceneEntityRuntimeParamDestroyArrayLoad,
      arrayLoadHex: hex(addresses.sceneEntityRuntimeParamDestroyArrayLoad),
      interpretation:
        "0x189d548-family shutdown destroys fixed slots 0x311af70/0x311af68/0x311af60, then iterates the 0x311af50 table entries at offsets 0 and 8.",
    },
    drawAllSceneEntities: {
      indexSetup: addresses.drawAllSceneEntitiesRuntimeParamIndexZero,
      indexSetupHex: hex(addresses.drawAllSceneEntitiesRuntimeParamIndexZero),
      accessorCall: addresses.drawAllSceneEntitiesRuntimeParamAccessorCall,
      accessorCallHex: hex(addresses.drawAllSceneEntitiesRuntimeParamAccessorCall),
      tempStore: addresses.drawAllSceneEntitiesRuntimeParamStoreTemp,
      tempStoreHex: hex(addresses.drawAllSceneEntitiesRuntimeParamStoreTemp),
      constructorArg: addresses.drawAllSceneEntitiesRuntimeParamArg,
      constructorArgHex: hex(addresses.drawAllSceneEntitiesRuntimeParamArg),
      conclusion:
        "Draw all scene entities calls 0x189d63c(0), saves the returned table slot 0 object in x23, passes it as x4 to 0x18a11e4, and the batch constructor stores it at task +0x58. Composite dispatch later passes that same object as x2 to entry owner builders.",
    },
    drawAllParticleEffects: {
      indexSetup: addresses.drawAllParticleEffectsRuntimeParamIndexZero,
      indexSetupHex: hex(addresses.drawAllParticleEffectsRuntimeParamIndexZero),
      accessorCall: addresses.drawAllParticleEffectsRuntimeParamAccessorCall,
      accessorCallHex: hex(addresses.drawAllParticleEffectsRuntimeParamAccessorCall),
      tempStore: addresses.drawAllParticleEffectsRuntimeParamStoreTemp,
      tempStoreHex: hex(addresses.drawAllParticleEffectsRuntimeParamStoreTemp),
      constructorArg: addresses.drawAllParticleEffectsRuntimeParamArg,
      constructorArgHex: hex(addresses.drawAllParticleEffectsRuntimeParamArg),
      conclusion:
        "Draw all particle effects repeats the same 0x189d63c(0) -> x23 -> x4 -> task +0x58 runtime-parameter path, so slot 0 is shared by both scene-entity and particle composite tasks in this draw function.",
    },
    accessorPattern:
      "0x189d63c computes table base 0x311af50 and returns table[w0] with an 8-byte unsigned index load.",
    evidence: [
      "The scene/entity x2 object is no longer an anonymous task field. Current disassembly shows Draw all scene entities calls 0x189d63c with index 0, passes the result as x4 to 0x18a11e4, and the constructor stores it into task +0x58.",
      "Composite dispatch already proves task +0x58 becomes x2 for entry owner builder calls, so scene/entity owner builders receive the object from global runtime-parameter table slot 0.",
      "The accessor and init/shutdown code prove 0x311af50 is a small global runtime-parameter object table, with slot 0 used by scene-entity and particle draw batches.",
      "The slot 0 object's vtable is now recovered: 0x189f7ec writes 0x2ab54a0, and the +0x10 slot used by render-command owner builders resolves to 0x189f850.",
      "0x189f850 constructs a returned per-command runtime object with vtable 0x2ab54f8. Render-command A/B builders call the returned object's +0x10 accessor and store that result at queued command +0x18.",
      "The source object passed into 0x189f850 is now bounded by the owner mapping lookup. Render-command builders call 0x1891818(owner, entry); it maps owner +0x18 entry pointers to paired owner +0x8 source objects, with entry +0x8 only used as a fallback when no mapped source exists.",
      "The owner mapping table is built by 0x18916c8: it reads the caller entry's holder at +0x28, walks that holder chain through chain node +0x58, creates a small source object for each chain node, stores *(source holder +0) from *(chain node +0x8) at the small source object +0, stores the runtime payload/context at +0x8, appends that object to owner +0x8, and appends the paired chain-node pointer to owner +0x18. The two append helpers now have internal opcode evidence for count increment and backing-array slot store, so the paired-array interpretation is no longer based only on callsite names.",
      "The source/program table mount path is now current-package evidence: 0xd8003c derives object +0x58 and tail-calls 0x18907a8; 0x8cab08/0x8cab14 and 0xbacad8/0xbacae8 clone/finalize a temporary source/program table through 0x189be5c and mount the result; layout-B state paths also mount prebuilt table fields at +0x40/+0x48/+0x50 through the same wrapper.",
      "The returned-object source table is no longer opaque. 0x189f8f8 uses the mapped small source object +0 as a source/program table, selects entry[index] +0x8, reads entry +0x10 for the sort key, and the later program-apply path uses the same table entry to call glUseProgram from entry +0 and apply parameters from entry +0x8 through 0x189ca94.",
      "The returned-object sort key formula is now current-binary traced: it combines the selected source/program entry pointer low 32 bits, a runtime mode nibble in bits 32..35, source/program entry +0x10 flag-derived bits, and high-bit toggles before storing the result at returned object +0x10.",
      "Queued command +0x18 is now classified as a render queue sort key: the queue builds [command +0x18, command pointer] pairs, sorts them, then re-appends commands.",
      "This still does not prove the active hero/model preview lightfield/profile payload.",
    ],
    unresolved:
      "the active hero/model preview profile/lightfield data selected before these sorted commands are drawn",
  };
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

function reportRows(manifest) {
  const instructionRows = manifest.instructionEvidence.map((row) => ({
    category: "instruction",
    subject: row.role,
    address: row.addressHex,
    relationship: row.opcodeMatchesExpected ? "current-opcode-matched" : "current-opcode-mismatch",
    detail: `${row.opcodeHex} ${row.evidence}`,
  }));
  const relationshipRows = manifest.relationships.flatMap((record) => [
    ...record.directCallers.map((caller) => ({
      category: "direct-caller",
      subject: record.name,
      address: record.virtualAddressHex,
      relationship: caller.mode,
      detail: caller.callerAddressHex,
    })),
    ...record.dataReferences.map((reference) => ({
      category: "data-reference",
      subject: record.name,
      address: record.virtualAddressHex,
      relationship: reference.section,
      detail: reference.virtualAddressHex,
    })),
  ]);
  const copyRows = manifest.renderCommandTransformCopies.flatMap((command) =>
    command.copies.map((copy) => ({
      category: "transform-copy",
      subject: command.command,
      address: copy.storeAddressHex,
      relationship: `${copy.sourceOffset}->${copy.destinationOffset}`,
      detail: `${copy.loadOpcodeHex}/${copy.storeOpcodeHex}`,
    })),
  );
  const ownerRows = manifest.ownerVtableEvidence.flatMap((owner) =>
    owner.vtableNeighborhood.map((entry) => ({
      category: "owner-vtable",
      subject: owner.command,
      address: entry.slotAddressHex,
      relationship: entry.relativeOffsetHex,
      detail: `${entry.valueHex}:${entry.valueSection}`,
    })),
  );
  const textReferenceRows = (manifest.globalSlotTextReferences || []).map((reference) => ({
    category: "text-reference",
    subject: reference.targetName,
    address: reference.targetAddressHex,
    relationship: reference.mode,
    detail: `${reference.xrefAddressHex} ${reference.baseInstructionHex}/${reference.useInstructionHex}`,
  }));
  const helperDispatcherRows = [
    {
      category: "helper-dispatcher",
      subject: "active-dispatcher",
      address: manifest.helperDispatcherEvidence.dispatcherObjectDispatchSlotHex,
      relationship: "vtable+0x10",
      detail: manifest.helperDispatcherEvidence.dispatcherObjectDispatchFunctionHex,
    },
    {
      category: "helper-dispatcher",
      subject: "threaded-bridge",
      address: manifest.helperDispatcherEvidence.threadedBridgeFunctionHex,
      relationship: "context-vtable+0x18",
      detail: manifest.helperDispatcherEvidence.unresolved,
    },
  ];
  const resourceContextRows = [
    {
      category: "resource-context",
      subject: "registry-key-one-context-build",
      address: manifest.resourceContextDispatchEvidence.registryRuntimeContextBuildSlotHex,
      relationship: "vtable+0x10",
      detail: manifest.resourceContextDispatchEvidence.registryRuntimeContextBuildFunctionHex,
    },
    {
      category: "resource-context",
      subject: "threaded-resource-dispatch",
      address: manifest.resourceContextDispatchEvidence.contextThreadedDispatchSlotHex,
      relationship: "context-vtable+0x18",
      detail: manifest.resourceContextDispatchEvidence.contextThreadedDispatchFunctionHex,
    },
    {
      category: "resource-context",
      subject: "meshData-handler-path",
      address: manifest.resourceContextDispatchEvidence.meshDataResourceNameHex,
      relationship: "resource-name",
      detail: manifest.resourceContextDispatchEvidence.unresolved,
    },
  ];
  const resourceHandlerRows = (manifest.resourceHandlerRegistrationEvidence?.handlers || []).flatMap((handler) => [
    {
      category: "resource-handler",
      subject: `${handler.resourceName}-name-slot`,
      address: handler.nameSlotAddressHex,
      relationship: "vtable+0x10",
      detail: handler.nameSlotFunctionHex,
    },
    {
      category: "resource-handler",
      subject: `${handler.resourceName}-process-slot`,
      address: handler.processSlotAddressHex,
      relationship: `vtable+${handler.processSlotRelativeOffset}`,
      detail: handler.processSlotFunctionHex,
    },
    {
      category: "resource-handler",
      subject: `${handler.resourceName}-registration`,
      address: handler.setupRegistrationCallAddressHex,
      relationship: "context-vtable+0x10",
      detail: handler.setupConstructorCallAddressHex,
    },
  ]);
  const meshDataRows = manifest.resourceHandlerRegistrationEvidence
    ? [
        {
          category: "resource-handler",
          subject: "meshData-resource-object-builder",
          address: manifest.resourceHandlerRegistrationEvidence.meshDataProcessEvidence.resourceObjectBuilderCallsiteHex,
          relationship: "call",
          detail: manifest.resourceHandlerRegistrationEvidence.meshDataProcessEvidence.resourceObjectBuilderHex,
        },
      ]
    : [];
  const meshRuntimeRows = manifest.meshDataRuntimeHandoffEvidence
    ? [
        {
          category: "meshdata-runtime",
          subject: "runtime-object-vtable",
          address: manifest.meshDataRuntimeHandoffEvidence.runtimeObjectPrimaryVtableHex,
          relationship: "constructed-by",
          detail: manifest.meshDataRuntimeHandoffEvidence.runtimeObjectBuilderHex,
        },
        {
          category: "meshdata-runtime",
          subject: "setup-bridge-a",
          address: manifest.meshDataRuntimeHandoffEvidence.setupBridgeAHex,
          relationship: "tail-payload-builder",
          detail: manifest.meshDataRuntimeHandoffEvidence.payloadBuilderHex,
        },
        {
          category: "meshdata-runtime",
          subject: "setup-bridge-b",
          address: manifest.meshDataRuntimeHandoffEvidence.setupBridgeBHex,
          relationship: "vtable+0x18",
          detail: manifest.meshDataRuntimeHandoffEvidence.unresolved,
        },
        ...manifest.meshDataRuntimeHandoffEvidence.renderCommandParamRuntimeVcalls.map((row) => ({
          category: "meshdata-runtime",
          subject: `${row.command}-param-runtime-vcall`,
          address: row.callAddress,
          relationship: row.slot,
          detail: row.evidence,
        })),
      ]
    : [];
  const compositeTaskRows = manifest.compositeTaskDispatchEvidence
    ? [
        {
          category: "composite-task-dispatch",
          subject: "primary-vtable-dispatch-slot",
          address: manifest.compositeTaskDispatchEvidence.dispatchSlotHex,
          relationship: "vtable+0x18",
          detail: manifest.compositeTaskDispatchEvidence.dispatchFunctionHex,
        },
        {
          category: "composite-task-dispatch",
          subject: "single-constructor-callers",
          address: manifest.compositeTaskDispatchEvidence.singleConstructorHex,
          relationship: "direct-callers",
          detail: manifest.compositeTaskDispatchEvidence.singleConstructorCallers
            .map((caller) => caller.callerAddressHex)
            .join(","),
        },
        {
          category: "composite-task-dispatch",
          subject: "batch-constructor-callers",
          address: manifest.compositeTaskDispatchEvidence.batchConstructorHex,
          relationship: "direct-callers",
          detail: manifest.compositeTaskDispatchEvidence.batchConstructorCallers
            .map((caller) => caller.callerAddressHex)
            .join(","),
        },
        {
          category: "composite-task-dispatch",
          subject: "runtime-param-callback",
          address: hex(0x18a150c),
          relationship: "task+0x58-vtable+0x18",
          detail: manifest.compositeTaskDispatchEvidence.unresolved,
        },
        {
          category: "meshdata-runtime",
          subject: "payload-serializer-vtable",
          address: manifest.compositeTaskDispatchEvidence.payloadSerializerPrimaryVtableHex,
          relationship: "current-vtable",
          detail: "constructed by 0x1894c40",
        },
        ...manifest.compositeTaskDispatchEvidence.constructorCallsites.map((row) => ({
          category: "composite-task-callsite",
          subject: row.label,
          address: row.callsiteAddressHex,
          relationship: `${row.constructor}:${row.classification}`,
          detail: row.entrySource,
        })),
      ]
    : [];
  const sceneEntityEntryRows = manifest.sceneEntityEntryArrayEvidence
    ? [
        {
          category: "scene-entity-entry-array",
          subject: "global-manager-slot",
          address: manifest.sceneEntityEntryArrayEvidence.globalManagerSlotHex,
          relationship: "loaded-by-forwarder",
          detail: manifest.sceneEntityEntryArrayEvidence.forwarderHex,
        },
        {
          category: "scene-entity-entry-array",
          subject: "entry-array-builder",
          address: manifest.sceneEntityEntryArrayEvidence.builderHex,
          relationship: "manager-index-to-entry-pointer",
          detail: manifest.sceneEntityEntryArrayEvidence.entryArrayPattern.entryMaterialization,
        },
      ]
    : [];
  const sceneEntityManagerRows = manifest.sceneEntityManagerLifecycleEvidence
    ? [
        {
          category: "scene-entity-manager",
          subject: "global-lifecycle",
          address: manifest.sceneEntityManagerLifecycleEvidence.globalManagerSlotHex,
          relationship: "init-store-delete-clear",
          detail: `${manifest.sceneEntityManagerLifecycleEvidence.constructorCallsiteHex}->${manifest.sceneEntityManagerLifecycleEvidence.globalStoreHex}/${manifest.sceneEntityManagerLifecycleEvidence.destructorDeleteCallHex}`,
        },
        {
          category: "scene-entity-manager",
          subject: "record-pool-layout",
          address: manifest.sceneEntityManagerLifecycleEvidence.constructorHex,
          relationship: "fixed-record-pool",
          detail: manifest.sceneEntityManagerLifecycleEvidence.layout.interpretation,
        },
        {
          category: "scene-entity-manager",
          subject: "add-record-callers",
          address: manifest.sceneEntityManagerLifecycleEvidence.addRecordHex,
          relationship: "direct-callers",
          detail: manifest.sceneEntityManagerLifecycleEvidence.addRecordCallers
            .map((caller) => caller.callerAddressHex)
            .join(","),
        },
        {
          category: "scene-entity-manager",
          subject: "remove-record-callers",
          address: manifest.sceneEntityManagerLifecycleEvidence.removeRecordHex,
          relationship: "direct-callers",
          detail: manifest.sceneEntityManagerLifecycleEvidence.removeRecordCallers
            .map((caller) => caller.callerAddressHex)
            .join(","),
        },
        {
          category: "scene-entity-manager",
          subject: "dispatch-record-callers",
          address: manifest.sceneEntityManagerLifecycleEvidence.dispatchRecordHex,
          relationship: "direct-callers",
          detail: manifest.sceneEntityManagerLifecycleEvidence.dispatchRecordCallers
            .map((caller) => caller.callerAddressHex)
            .join(","),
        },
      ]
    : [];
  const sceneEntityRecordEntryRows = manifest.sceneEntityRecordEntryEvidence
    ? [
        {
          category: "scene-entity-record-entry",
          subject: "record-entry-pointer-source-a",
          address: manifest.sceneEntityRecordEntryEvidence.recordEntryPointerSource.callerA.entryPointerAddressHex,
          relationship: "this+0x30",
          detail: manifest.sceneEntityRecordEntryEvidence.recordEntryPointerSource.callerA.addRecordCallHex,
        },
        {
          category: "scene-entity-record-entry",
          subject: "record-entry-pointer-source-b",
          address: manifest.sceneEntityRecordEntryEvidence.recordEntryPointerSource.callerB.entryPointerAddressHex,
          relationship: "this+0x30",
          detail: manifest.sceneEntityRecordEntryEvidence.recordEntryPointerSource.callerB.addRecordCallHex,
        },
        {
          category: "scene-entity-record-entry",
          subject: "layout-b-register-wrapper",
          address: manifest.sceneEntityRecordEntryEvidence.layoutB.registerWrapperTailHex,
          relationship: "tail-call",
          detail: manifest.sceneEntityRecordEntryEvidence.layoutB.registerFunctionHex,
        },
        {
          category: "scene-entity-record-entry",
          subject: "layout-b-default-source-boundary",
          address: manifest.sceneEntityRecordEntryEvidence.layoutB.registerWrapperTailHex,
          relationship: "not-profile",
          detail: manifest.sceneEntityRecordEntryEvidence.layoutB.wrapperArgumentSource.boundary,
        },
        {
          category: "scene-entity-record-entry",
          subject: "layout-b-manager-registration",
          address: manifest.sceneEntityRecordEntryEvidence.layoutB.managerRegistration.managerAccessorCallHex,
          relationship: "this+0x30-record",
          detail: manifest.sceneEntityRecordEntryEvidence.layoutB.managerRegistration.conclusion,
        },
        {
          category: "scene-entity-record-entry",
          subject: "layout-b-material-param-update",
          address: manifest.sceneEntityRecordEntryEvidence.layoutB.materialParamUpdate.followupFunctionHex,
          relationship: "object+0x50-param-writes",
          detail: manifest.sceneEntityRecordEntryEvidence.layoutB.materialParamUpdate.conclusion,
        },
        {
          category: "scene-entity-record-entry",
          subject: "layout-b-state-dispatch",
          address: manifest.sceneEntityRecordEntryEvidence.layoutB.stateDispatch.functionHex,
          relationship: "state-transform-record-dispatch",
          detail: manifest.sceneEntityRecordEntryEvidence.layoutB.stateDispatch.conclusion,
        },
        {
          category: "scene-entity-record-entry",
          subject: "layout-b-final-record-dispatch",
          address: manifest.sceneEntityRecordEntryEvidence.layoutB.stateDispatch.finalRecordDispatch.dispatchCallHex,
          relationship: "payload-to-0x188f020",
          detail: `${manifest.sceneEntityRecordEntryEvidence.layoutB.stateDispatch.finalRecordDispatch.payloadBuilderHex}/${manifest.sceneEntityRecordEntryEvidence.layoutB.stateDispatch.finalRecordDispatch.targetHex}`,
        },
        {
          category: "scene-entity-record-entry",
          subject: "owner-and-callback-store",
          address: manifest.sceneEntityRecordEntryEvidence.entrySetup.ownerAndCallbackStoreHex,
          relationship: "entry+0x8/+0x10",
          detail: `${manifest.sceneEntityRecordEntryEvidence.entrySetup.ownerBGlobalSlotHex}/${manifest.sceneEntityRecordEntryEvidence.tables.callbackTable.baseHex}`,
        },
        {
          category: "scene-entity-record-entry",
          subject: "helper-dispatch-slot",
          address: manifest.sceneEntityRecordEntryEvidence.entryCallbacks.helperDispatch.functionHex,
          relationship: "primary-vtable+0x20",
          detail: manifest.sceneEntityRecordEntryEvidence.entryCallbacks.helperDispatch.argumentPattern,
        },
        {
          category: "scene-entity-record-entry",
          subject: "record-update-dispatch",
          address: manifest.sceneEntityRecordEntryEvidence.entryCallbacks.recordUpdateDispatch.dispatchRecordCallHex,
          relationship: "manager-dispatch-record",
          detail: manifest.sceneEntityRecordEntryEvidence.entryCallbacks.recordUpdateDispatch.pattern,
        },
        {
          category: "scene-entity-record-entry",
          subject: "render-owner-builder-link",
          address: manifest.sceneEntityRecordEntryEvidence.renderOwnerBuilderLink.compositeDispatchOwnerVslotCallHex,
          relationship: "entry+0x8-vtable+0x10",
          detail: manifest.sceneEntityRecordEntryEvidence.renderOwnerBuilderLink.conclusion,
        },
        {
          category: "scene-entity-record-entry",
          subject: "x4-transform-provider-link",
          address: manifest.sceneEntityRecordEntryEvidence.x4TransformProviderLink.transformSourceReturnHex,
          relationship: "x4-8-vtable+0x18",
          detail: manifest.sceneEntityRecordEntryEvidence.x4TransformProviderLink.conclusion,
        },
        ...Object.entries(manifest.sceneEntityRecordEntryEvidence.tables).flatMap(([tableName, table]) =>
          table.neighborhood.map((entry) => ({
            category: "scene-entity-record-entry-table",
            subject: tableName,
            address: entry.slotAddressHex,
            relationship: entry.relativeOffsetHex,
            detail: `${entry.valueHex}:${entry.valueSection}`,
          })),
        ),
      ]
    : [];
  const sceneEntityRuntimeParamRows = manifest.sceneEntityRuntimeParamEvidence
    ? [
        {
          category: "scene-entity-runtime-param",
          subject: "global-table-accessor",
          address: manifest.sceneEntityRuntimeParamEvidence.accessorHex,
          relationship: "table-index-load",
          detail: manifest.sceneEntityRuntimeParamEvidence.accessorPattern,
        },
        {
          category: "scene-entity-runtime-param",
          subject: "init-global-slots",
          address: manifest.sceneEntityRuntimeParamEvidence.initPattern.slot0Slot1StoreHex,
          relationship: "0x311af50-table",
          detail: manifest.sceneEntityRuntimeParamEvidence.initPattern.interpretation,
        },
        {
          category: "scene-entity-runtime-param",
          subject: "draw-all-scene-entities",
          address: manifest.sceneEntityRuntimeParamEvidence.drawAllSceneEntities.accessorCallHex,
          relationship: "x4-to-task+0x58",
          detail: manifest.sceneEntityRuntimeParamEvidence.drawAllSceneEntities.conclusion,
        },
        {
          category: "scene-entity-runtime-param",
          subject: "draw-all-particle-effects",
          address: manifest.sceneEntityRuntimeParamEvidence.drawAllParticleEffects.accessorCallHex,
          relationship: "x4-to-task+0x58",
          detail: manifest.sceneEntityRuntimeParamEvidence.drawAllParticleEffects.conclusion,
        },
        {
          category: "scene-entity-runtime-param",
          subject: "slot0-vtable",
          address: manifest.sceneEntityRuntimeParamEvidence.slot0Object.vtableWriteHex,
          relationship: "vtable+0x10",
          detail: `${manifest.sceneEntityRuntimeParamEvidence.slot0Object.renderObjectBuildSlotHex}->${manifest.sceneEntityRuntimeParamEvidence.slot0Object.renderObjectBuildFunctionHex}`,
        },
        {
          category: "scene-entity-runtime-param",
          subject: "returned-object-vtable",
          address: manifest.sceneEntityRuntimeParamEvidence.returnedObject.vtableWriteHex,
          relationship: "vtable+0x10-to-command+0x18",
          detail: `${manifest.sceneEntityRuntimeParamEvidence.returnedObject.valueAccessorSlotHex}->${manifest.sceneEntityRuntimeParamEvidence.returnedObject.valueAccessorFunctionHex}`,
        },
        {
          category: "scene-entity-runtime-param",
          subject: "queued-command-sort-key",
          address: manifest.sceneEntityRuntimeParamEvidence.queuedCommandSortKey.keyLoadHex,
          relationship: "command+0x18-sort-key",
          detail: manifest.sceneEntityRuntimeParamEvidence.queuedCommandSortKey.interpretation,
        },
        ...manifest.sceneEntityRuntimeParamEvidence.globalSlotTextReferences.map((reference) => ({
          category: "scene-entity-runtime-param-reference",
          subject: reference.targetName,
          address: reference.xrefAddressHex,
          relationship: reference.mode,
          detail: `${reference.targetAddressHex}:${reference.baseInstructionHex}/${reference.useInstructionHex}`,
        })),
      ]
    : [];
  return [
    ...instructionRows,
    ...relationshipRows,
    ...copyRows,
    ...ownerRows,
    ...textReferenceRows,
    ...helperDispatcherRows,
    ...resourceContextRows,
    ...resourceHandlerRows,
    ...meshDataRows,
    ...meshRuntimeRows,
    ...compositeTaskRows,
    ...sceneEntityEntryRows,
    ...sceneEntityManagerRows,
    ...sceneEntityRecordEntryRows,
    ...sceneEntityRuntimeParamRows,
  ];
}

function exportCurrentNativePositionSamplerOwnerAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const instructionRecords = instructionEvidence.map((row) => instructionRecord(buffer, elf, row));
  const relationships = [
    relationshipRecord(buffer, elf, "scene-probe-position-sample-upload", addresses.sceneProbePositionSampleUpload),
    relationshipRecord(buffer, elf, "renderer-init-render-command-factory-callsite", addresses.rendererInitCaller),
    relationshipRecord(buffer, elf, "render-command-factory-init", addresses.renderCommandFactoryInit),
    relationshipRecord(buffer, elf, "render-command-a-owner-constructor", addresses.renderCommandAOwnerConstructor),
    relationshipRecord(buffer, elf, "render-command-a-owner-vtable-base", addresses.renderCommandAOwnerVtableBase),
    relationshipRecord(buffer, elf, "render-command-a-owner-builder-slot", addresses.renderCommandAOwnerBuilderSlot),
    relationshipRecord(buffer, elf, "render-command-a-queued-command-constructor", addresses.renderCommandAQueuedCommandConstructor),
    relationshipRecord(buffer, elf, "render-command-a-owner-setup", addresses.renderCommandAOwnerSetup),
    relationshipRecord(buffer, elf, "render-command-a-builder", addresses.renderCommandABuilder),
    relationshipRecord(buffer, elf, "render-command-a-sample-upload-method", addresses.renderCommandASampleUpload),
    relationshipRecord(buffer, elf, "render-command-a-draw-method", addresses.renderCommandADraw),
    relationshipRecord(buffer, elf, "render-command-a-queued-command-vtable-base", addresses.renderCommandAQueuedCommandVtableBase),
    relationshipRecord(buffer, elf, "render-command-b-owner-constructor", addresses.renderCommandBOwnerConstructor),
    relationshipRecord(buffer, elf, "render-command-b-owner-vtable-base", addresses.renderCommandBOwnerVtableBase),
    relationshipRecord(buffer, elf, "render-command-b-owner-builder-slot", addresses.renderCommandBOwnerBuilderSlot),
    relationshipRecord(buffer, elf, "render-command-b-builder", addresses.renderCommandBBuilder),
    relationshipRecord(buffer, elf, "render-command-b-sample-upload-method", addresses.renderCommandBSampleUpload),
    relationshipRecord(buffer, elf, "render-command-b-draw-method", addresses.renderCommandBDraw),
    relationshipRecord(buffer, elf, "render-command-b-queued-command-vtable-base", addresses.renderCommandBQueuedCommandVtableBase),
    relationshipRecord(buffer, elf, "render-command-queue-append", addresses.queueAppend),
    relationshipRecord(buffer, elf, "global-helper-register-active-dispatcher", addresses.globalHelperRegisterActiveDispatcher),
    relationshipRecord(buffer, elf, "global-helper-dispatch", addresses.globalHelperDispatch),
    relationshipRecord(buffer, elf, "renderer-dispatcher-object-constructor", addresses.rendererDispatcherObjectConstructor),
    relationshipRecord(buffer, elf, "renderer-dispatcher-object-dispatch", addresses.rendererDispatcherObjectDispatch),
    relationshipRecord(buffer, elf, "resource-dispatcher-threaded-bridge", addresses.resourceDispatcherThreadedBridge),
    relationshipRecord(buffer, elf, "renderer-context-registry-lookup", addresses.rendererContextRegistryLookup),
    relationshipRecord(
      buffer,
      elf,
      "renderer-context-registry-object-constructor",
      addresses.rendererContextRegistryObjectConstructor,
    ),
    relationshipRecord(
      buffer,
      elf,
      "renderer-context-registry-runtime-context-build",
      addresses.rendererContextRegistryRuntimeContextBuild,
    ),
    relationshipRecord(
      buffer,
      elf,
      "renderer-context-registry-runtime-context-accessor",
      addresses.rendererContextRegistryRuntimeContextAccessor,
    ),
    relationshipRecord(buffer, elf, "resource-dispatcher-context-constructor", addresses.resourceDispatcherContextConstructor),
    relationshipRecord(buffer, elf, "resource-dispatcher-context-dispatch", addresses.resourceDispatcherContextThreadedDispatch),
    relationshipRecord(buffer, elf, "resource-handler-shaderData-constructor", addresses.resourceHandlerShaderDataConstructor),
    relationshipRecord(buffer, elf, "resource-handler-shaderData-name", addresses.resourceHandlerShaderDataName),
    relationshipRecord(buffer, elf, "resource-handler-shaderData-process", addresses.resourceHandlerShaderDataProcess),
    relationshipRecord(buffer, elf, "resource-handler-texData-constructor", addresses.resourceHandlerTexDataConstructor),
    relationshipRecord(buffer, elf, "resource-handler-texData-name", addresses.resourceHandlerTexDataName),
    relationshipRecord(buffer, elf, "resource-handler-texData-process", addresses.resourceHandlerTexDataProcess),
    relationshipRecord(buffer, elf, "resource-handler-animData-constructor", addresses.resourceHandlerAnimDataConstructor),
    relationshipRecord(buffer, elf, "resource-handler-animData-name", addresses.resourceHandlerAnimDataName),
    relationshipRecord(buffer, elf, "resource-handler-animData-process", addresses.resourceHandlerAnimDataProcess),
    relationshipRecord(buffer, elf, "resource-handler-meshData-constructor", addresses.resourceHandlerMeshDataConstructor),
    relationshipRecord(buffer, elf, "resource-handler-meshData-name", addresses.resourceHandlerMeshDataName),
    relationshipRecord(buffer, elf, "resource-handler-meshData-process", addresses.resourceHandlerMeshDataProcess),
    relationshipRecord(buffer, elf, "meshData-resource-object-builder", addresses.meshDataResourceObjectBuilder),
    relationshipRecord(buffer, elf, "meshData-runtime-object-vtable", addresses.meshDataRuntimeObjectPrimaryVtable),
    relationshipRecord(buffer, elf, "meshData-runtime-object-setup", addresses.meshDataRuntimeObjectSetup),
    relationshipRecord(buffer, elf, "meshData-runtime-setup-bridge-a", addresses.meshDataRuntimeSetupBridgeA),
    relationshipRecord(buffer, elf, "meshData-runtime-setup-bridge-b", addresses.meshDataRuntimeSetupBridgeB),
    relationshipRecord(buffer, elf, "meshData-runtime-payload-builder", addresses.meshDataRuntimePayloadBuilder),
    relationshipRecord(buffer, elf, "composite-task-single-constructor", addresses.compositeTaskSingleConstructor),
    relationshipRecord(buffer, elf, "composite-task-batch-constructor", addresses.compositeTaskBatchConstructor),
    relationshipRecord(buffer, elf, "composite-task-primary-vtable", addresses.compositeTaskPrimaryVtable),
    relationshipRecord(buffer, elf, "composite-task-dispatch", addresses.compositeTaskDispatch),
    relationshipRecord(buffer, elf, "composite-task-list-vtable", addresses.compositeTaskListPrimaryVtable),
    relationshipRecord(buffer, elf, "meshData-payload-serializer-vtable", addresses.meshDataPayloadSerializerPrimaryVtable),
    relationshipRecord(buffer, elf, "scene-entity-entry-array-global-slot", addresses.sceneEntityEntryArrayGlobalSlot),
    relationshipRecord(buffer, elf, "scene-entity-manager-constructor", addresses.sceneEntityManagerConstructor),
    relationshipRecord(buffer, elf, "scene-entity-manager-add-record", addresses.sceneEntityManagerAddRecord),
    relationshipRecord(buffer, elf, "scene-entity-manager-remove-record", addresses.sceneEntityManagerRemoveRecord),
    relationshipRecord(buffer, elf, "scene-entity-manager-dispatch-record", addresses.sceneEntityManagerDispatchRecord),
    relationshipRecord(buffer, elf, "scene-entity-manager-accessor", addresses.sceneEntityManagerAccessor),
    relationshipRecord(buffer, elf, "scene-entity-record-entry-owner-b-accessor", addresses.sceneEntityRecordEntryOwnerBAccessor),
    relationshipRecord(buffer, elf, "scene-entity-record-entry-owner-a-accessor", addresses.sceneEntityRecordEntryOwnerAAccessor),
    relationshipRecord(buffer, elf, "scene-entity-record-entry-list-init", addresses.sceneEntityRecordEntryListInit),
    relationshipRecord(buffer, elf, "scene-entity-record-entry-list-destroy", addresses.sceneEntityRecordEntryListDestroy),
    relationshipRecord(buffer, elf, "scene-entity-record-entry-list-unlink", addresses.sceneEntityRecordEntryListUnlink),
    relationshipRecord(buffer, elf, "scene-entity-record-entry-helper-dispatch-slot", addresses.sceneEntityRecordEntryGlobalHelperDispatchSlot),
    relationshipRecord(buffer, elf, "scene-entity-record-entry-owner-switch-owner-a", addresses.sceneEntityRecordEntryOwnerSwitchOwnerACall),
    relationshipRecord(buffer, elf, "scene-entity-record-entry-owner-switch-owner-b", addresses.sceneEntityRecordEntryOwnerSwitchOwnerBCall),
    relationshipRecord(buffer, elf, "scene-entity-record-entry-record-dispatch", addresses.sceneEntityRecordEntryRecordDispatchCall),
    relationshipRecord(buffer, elf, "scene-entity-record-entry-conditional-update-primary", addresses.sceneEntityRecordEntryConditionalUpdatePrimary),
    relationshipRecord(buffer, elf, "scene-entity-record-entry-conditional-update-callback", addresses.sceneEntityRecordEntryConditionalUpdateCallback),
    relationshipRecord(
      buffer,
      elf,
      "scene-entity-record-entry-layout-b-register",
      addresses.sceneEntityRecordEntryLayoutBRegister,
    ),
    relationshipRecord(
      buffer,
      elf,
      "scene-entity-record-entry-layout-b-followup",
      addresses.sceneEntityRecordEntryLayoutBFollowup,
    ),
    relationshipRecord(
      buffer,
      elf,
      "scene-entity-record-entry-layout-b-state-dispatch",
      addresses.sceneEntityRecordEntryLayoutBStateDispatch,
    ),
    relationshipRecord(
      buffer,
      elf,
      "scene-entity-record-entry-layout-b-transform-apply",
      addresses.sceneEntityRecordEntryLayoutBTransformApply,
    ),
    relationshipRecord(
      buffer,
      elf,
      "scene-entity-record-entry-layout-b-mode3-apply",
      addresses.sceneEntityRecordEntryLayoutBStateMode3Apply,
    ),
    relationshipRecord(
      buffer,
      elf,
      "scene-entity-record-entry-layout-b-optional-visibility",
      addresses.sceneEntityRecordEntryLayoutBOptionalVisibilityUpdate,
    ),
    relationshipRecord(buffer, elf, "runtime-param-payload-builder", addresses.runtimeParamPayloadBuilder),
    relationshipRecord(buffer, elf, "runtime-material-param-writer", addresses.runtimeMaterialParamWriter),
    relationshipRecord(buffer, elf, "scene-entity-record-entry-primary-vtable", addresses.sceneEntityRecordEntryPrimaryVtableBase),
    relationshipRecord(buffer, elf, "scene-entity-record-entry-sub-vtable", addresses.sceneEntityRecordEntrySubVtableBase),
    relationshipRecord(buffer, elf, "scene-entity-record-entry-callback-table", addresses.sceneEntityRecordEntryCallbackTableBase),
    relationshipRecord(buffer, elf, "scene-entity-runtime-param-accessor", addresses.sceneEntityRuntimeParamAccessor),
    relationshipRecord(buffer, elf, "scene-entity-runtime-param-global-base", addresses.sceneEntityRuntimeParamGlobalBase),
    relationshipRecord(buffer, elf, "scene-entity-runtime-param-init-base", addresses.sceneEntityRuntimeParamInitBaseAdd),
    relationshipRecord(buffer, elf, "scene-entity-runtime-param-destroy-base", addresses.sceneEntityRuntimeParamDestroyBaseAdd),
    relationshipRecord(buffer, elf, "scene-entity-runtime-param-slot0-constructor", addresses.sceneEntityRuntimeParamSlot0Constructor),
    relationshipRecord(buffer, elf, "scene-entity-runtime-param-slot0-vtable", addresses.sceneEntityRuntimeParamSlot0VtableBase),
    relationshipRecord(
      buffer,
      elf,
      "scene-entity-runtime-param-returned-object-vtable",
      addresses.sceneEntityRuntimeParamReturnedObjectVtableBase,
    ),
    relationshipRecord(
      buffer,
      elf,
      "scene-entity-runtime-param-returned-object-value-accessor",
      addresses.sceneEntityRuntimeParamReturnedObjectValueAccessor,
    ),
    relationshipRecord(buffer, elf, "render-command-queue-sort-and-reappend", addresses.renderCommandQueueSortAndReappend),
    relationshipRecord(buffer, elf, "render-command-queue-sort-partition", addresses.renderCommandQueueSortPartition),
    relationshipRecord(
      buffer,
      elf,
      "dynamic-source-program-table-selector-parent-lazy-init",
      addresses.dynamicSourceProgramTableParentLazyInitFunction,
    ),
    relationshipRecord(
      buffer,
      elf,
      "dynamic-source-program-table-selector-child-lazy-init",
      addresses.dynamicSourceProgramTableSelectorChildLazyInitFunction,
    ),
    relationshipRecord(
      buffer,
      elf,
      "dynamic-source-program-table-post-child-lazy-init",
      addresses.dynamicSourceProgramTablePostChildLazyInitFunction,
    ),
    relationshipRecord(
      buffer,
      elf,
      "dynamic-source-program-table-selector-parent-type-register",
      addresses.dynamicSourceProgramTableParentTypeRegister,
    ),
    relationshipRecord(
      buffer,
      elf,
      "dynamic-source-program-table-selector-child-type-register",
      addresses.dynamicSourceProgramTableSelectorChildTypeRegister,
    ),
    relationshipRecord(
      buffer,
      elf,
      "dynamic-source-program-table-post-child-type-register",
      addresses.dynamicSourceProgramTablePostChildTypeRegister,
    ),
    relationshipRecord(
      buffer,
      elf,
      "dynamic-source-program-table-post-child-setup",
      addresses.dynamicSourceProgramTablePostChildSetupFunction,
    ),
    relationshipRecord(buffer, elf, "scene-entity-entry-array-forwarder", addresses.sceneEntityEntryArrayForwarder),
    relationshipRecord(buffer, elf, "scene-entity-entry-array-forwarder-alt", addresses.sceneEntityEntryArrayForwarderAlt),
    relationshipRecord(buffer, elf, "scene-entity-entry-array-builder", addresses.sceneEntityEntryArrayBuilder),
    relationshipRecord(buffer, elf, "scene-entity-entry-array-builder-alt", addresses.sceneEntityEntryArrayBuilderAlt),
  ];
  const renderCommandTransformCopies = transformCopyEvidence.map((row) => buildCommandEvidence(buffer, elf, row));
  const ownerVtableEvidence = buildOwnerVtableEvidence(buffer, elf);
  const helperDispatcherEvidence = buildHelperDispatcherEvidence(buffer, elf);
  const resourceContextDispatchEvidence = buildResourceContextDispatchEvidence(buffer, elf);
  const resourceHandlerRegistrationEvidence = buildResourceHandlerRegistrationEvidence(buffer, elf);
  const meshDataRuntimeHandoffEvidence = buildMeshDataRuntimeHandoffEvidence(buffer, elf);
  const compositeTaskDispatchEvidence = buildCompositeTaskDispatchEvidence(buffer, elf);
  const sceneEntityEntryArrayEvidence = buildSceneEntityEntryArrayEvidence(buffer, elf);
  const sceneEntityManagerLifecycleEvidence = buildSceneEntityManagerLifecycleEvidence(buffer, elf);
  const sceneEntityRecordEntryEvidence = buildSceneEntityRecordEntryEvidence(buffer, elf);
  const sceneEntityRuntimeParamEvidence = buildSceneEntityRuntimeParamEvidence(buffer, elf);
  const globalSlotTextReferences = buildTextReferenceEvidence(buffer, elf, [
    { name: "global-render-factory-slot", virtualAddress: addresses.globalRenderFactorySlot },
    { name: "global-render-command-b-owner-slot", virtualAddress: addresses.globalRenderCommandBSlot },
    { name: "global-render-command-a-owner-slot", virtualAddress: addresses.globalRenderCommandASlot },
    { name: "global-render-command-work-queue-slot", virtualAddress: addresses.globalRenderCommandWorkQueueSlot },
    { name: "global-helper-register-active-dispatcher", virtualAddress: addresses.globalHelperRegisterActiveDispatcher },
    { name: "global-helper-dispatch", virtualAddress: addresses.globalHelperDispatch },
    { name: "renderer-dispatcher-object-dispatch-slot", virtualAddress: addresses.rendererDispatcherObjectDispatchSlot },
    { name: "resource-dispatcher-threaded-bridge", virtualAddress: addresses.resourceDispatcherThreadedBridge },
    { name: "renderer-context-registry-object-vtable", virtualAddress: addresses.rendererContextRegistryObjectPrimaryVtable },
    { name: "resource-dispatcher-context-vtable", virtualAddress: addresses.resourceDispatcherContextPrimaryVtable },
    { name: "resource-dispatcher-context-dispatch-slot", virtualAddress: addresses.resourceDispatcherContextThreadedDispatchSlot },
    { name: "resource-handler-shaderData-vtable", virtualAddress: addresses.resourceHandlerShaderDataPrimaryVtable },
    { name: "resource-handler-texData-vtable", virtualAddress: addresses.resourceHandlerTexDataPrimaryVtable },
    { name: "resource-handler-animData-vtable", virtualAddress: addresses.resourceHandlerAnimDataPrimaryVtable },
    { name: "resource-handler-meshData-vtable", virtualAddress: addresses.resourceHandlerMeshDataPrimaryVtable },
    { name: "meshData-runtime-object-vtable", virtualAddress: addresses.meshDataRuntimeObjectPrimaryVtable },
    { name: "meshData-runtime-object-setup", virtualAddress: addresses.meshDataRuntimeObjectSetup },
    { name: "meshData-runtime-payload-builder", virtualAddress: addresses.meshDataRuntimePayloadBuilder },
    { name: "composite-task-vtable", virtualAddress: addresses.compositeTaskPrimaryVtable },
    { name: "composite-task-dispatch", virtualAddress: addresses.compositeTaskDispatch },
    { name: "composite-task-list-vtable", virtualAddress: addresses.compositeTaskListPrimaryVtable },
    { name: "meshData-payload-serializer-vtable", virtualAddress: addresses.meshDataPayloadSerializerPrimaryVtable },
    { name: "scene-entity-entry-array-global-slot", virtualAddress: addresses.sceneEntityEntryArrayGlobalSlot },
    { name: "scene-entity-manager-constructor", virtualAddress: addresses.sceneEntityManagerConstructor },
    { name: "scene-entity-manager-add-record", virtualAddress: addresses.sceneEntityManagerAddRecord },
    { name: "scene-entity-manager-remove-record", virtualAddress: addresses.sceneEntityManagerRemoveRecord },
    { name: "scene-entity-manager-dispatch-record", virtualAddress: addresses.sceneEntityManagerDispatchRecord },
    { name: "scene-entity-manager-accessor", virtualAddress: addresses.sceneEntityManagerAccessor },
    { name: "scene-entity-record-entry-owner-b-accessor", virtualAddress: addresses.sceneEntityRecordEntryOwnerBAccessor },
    { name: "scene-entity-record-entry-owner-a-accessor", virtualAddress: addresses.sceneEntityRecordEntryOwnerAAccessor },
    { name: "scene-entity-record-entry-list-init", virtualAddress: addresses.sceneEntityRecordEntryListInit },
    { name: "scene-entity-record-entry-list-unlink", virtualAddress: addresses.sceneEntityRecordEntryListUnlink },
    { name: "scene-entity-record-entry-helper-dispatch-slot", virtualAddress: addresses.sceneEntityRecordEntryGlobalHelperDispatchSlot },
    { name: "scene-entity-record-entry-record-dispatch", virtualAddress: addresses.sceneEntityRecordEntryRecordDispatchCall },
    { name: "scene-entity-record-entry-conditional-update-primary", virtualAddress: addresses.sceneEntityRecordEntryConditionalUpdatePrimary },
    { name: "scene-entity-record-entry-conditional-update-callback", virtualAddress: addresses.sceneEntityRecordEntryConditionalUpdateCallback },
    { name: "scene-entity-record-entry-layout-b-register", virtualAddress: addresses.sceneEntityRecordEntryLayoutBRegister },
    { name: "scene-entity-record-entry-layout-b-followup", virtualAddress: addresses.sceneEntityRecordEntryLayoutBFollowup },
    {
      name: "scene-entity-record-entry-layout-b-state-dispatch",
      virtualAddress: addresses.sceneEntityRecordEntryLayoutBStateDispatch,
    },
    {
      name: "scene-entity-record-entry-layout-b-transform-apply",
      virtualAddress: addresses.sceneEntityRecordEntryLayoutBTransformApply,
    },
    {
      name: "scene-entity-record-entry-layout-b-mode3-apply",
      virtualAddress: addresses.sceneEntityRecordEntryLayoutBStateMode3Apply,
    },
    {
      name: "scene-entity-record-entry-layout-b-optional-visibility",
      virtualAddress: addresses.sceneEntityRecordEntryLayoutBOptionalVisibilityUpdate,
    },
    { name: "runtime-param-payload-builder", virtualAddress: addresses.runtimeParamPayloadBuilder },
    { name: "runtime-material-param-writer", virtualAddress: addresses.runtimeMaterialParamWriter },
    { name: "scene-entity-record-entry-primary-vtable", virtualAddress: addresses.sceneEntityRecordEntryPrimaryVtableBase },
    { name: "scene-entity-record-entry-sub-vtable", virtualAddress: addresses.sceneEntityRecordEntrySubVtableBase },
    { name: "scene-entity-record-entry-callback-table", virtualAddress: addresses.sceneEntityRecordEntryCallbackTableBase },
    { name: "scene-entity-runtime-param-accessor", virtualAddress: addresses.sceneEntityRuntimeParamAccessor },
    { name: "scene-entity-runtime-param-global-base", virtualAddress: addresses.sceneEntityRuntimeParamGlobalBase },
    { name: "scene-entity-runtime-param-global-slot-1", virtualAddress: addresses.sceneEntityRuntimeParamGlobalBase + 0x8 },
    { name: "scene-entity-runtime-param-global-slot-2", virtualAddress: addresses.sceneEntityRuntimeParamGlobalBase + 0x10 },
    { name: "scene-entity-runtime-param-global-slot-3", virtualAddress: addresses.sceneEntityRuntimeParamGlobalBase + 0x18 },
    { name: "scene-entity-runtime-param-global-slot-4", virtualAddress: addresses.sceneEntityRuntimeParamGlobalBase + 0x20 },
    { name: "scene-entity-runtime-param-slot0-vtable", virtualAddress: addresses.sceneEntityRuntimeParamSlot0VtableBase },
    {
      name: "scene-entity-runtime-param-returned-object-vtable",
      virtualAddress: addresses.sceneEntityRuntimeParamReturnedObjectVtableBase,
    },
    {
      name: "scene-entity-runtime-param-returned-object-value-accessor",
      virtualAddress: addresses.sceneEntityRuntimeParamReturnedObjectValueAccessor,
    },
    { name: "render-command-queue-sort-and-reappend", virtualAddress: addresses.renderCommandQueueSortAndReappend },
    { name: "render-command-queue-sort-partition", virtualAddress: addresses.renderCommandQueueSortPartition },
    { name: "scene-entity-entry-array-builder", virtualAddress: addresses.sceneEntityEntryArrayBuilder },
    { name: "scene-entity-entry-array-builder-alt", virtualAddress: addresses.sceneEntityEntryArrayBuilderAlt },
    { name: "shaderData-resource-name", virtualAddress: addresses.shaderDataResourceName, kind: "resource-string" },
    { name: "texData-resource-name", virtualAddress: addresses.texDataResourceName, kind: "resource-string" },
    { name: "animData-resource-name", virtualAddress: addresses.animDataResourceName, kind: "resource-string" },
    { name: "meshData-resource-name", virtualAddress: addresses.meshDataResourceName, kind: "resource-string" },
  ]);
  const summary = {
    instructionEvidence: instructionRecords.length,
    instructionOpcodeMismatches: instructionRecords.filter((row) => !row.opcodeMatchesExpected).length,
    relationshipTargets: relationships.length,
    directCallers: relationships.reduce((sum, record) => sum + record.directCallers.length, 0),
    dataReferences: relationships.reduce((sum, record) => sum + record.dataReferences.length, 0),
    globalSlotTextReferences: globalSlotTextReferences.length,
    ownerVtableClasses: ownerVtableEvidence.length,
    helperDispatcherChainRecovered: helperDispatcherEvidence.dispatcherObjectDispatchFunction === addresses.rendererDispatcherObjectDispatch,
    resourceContextDispatchRecovered:
      resourceContextDispatchEvidence.registryRuntimeContextBuildFunction ===
        addresses.rendererContextRegistryRuntimeContextBuild &&
      resourceContextDispatchEvidence.contextThreadedDispatchFunction === addresses.resourceDispatcherContextThreadedDispatch,
    resourceHandlersRecovered: (resourceHandlerRegistrationEvidence.handlers || []).filter(
      (handler) =>
        handler.nameSlotFunction === handler.nameFunctionAddress &&
        handler.processSlotFunction === handler.processFunctionAddress,
    ).length,
    meshDataHandlerProcessRecovered:
      resourceHandlerRegistrationEvidence.meshDataProcessEvidence.resourceObjectBuilder ===
        addresses.meshDataResourceObjectBuilder &&
      resourceHandlerRegistrationEvidence.handlers.some(
        (handler) =>
          handler.resourceName === "meshData" &&
          handler.nameSlotFunction === addresses.resourceHandlerMeshDataName &&
          handler.processSlotFunction === addresses.resourceHandlerMeshDataProcess,
      ),
    meshDataRuntimeHandoffRecovered:
      meshDataRuntimeHandoffEvidence.runtimeObjectVtableNeighborhood.some(
        (entry) =>
          entry.slotAddress === addresses.meshDataRuntimeObjectPrimaryVtable &&
          entry.value === 0x1891ba0,
      ) &&
      meshDataRuntimeHandoffEvidence.renderCommandParamRuntimeVcalls.length === 2,
    compositeTaskDispatchPatternRecovered:
      compositeTaskDispatchEvidence.dispatchFunction === addresses.compositeTaskDispatch &&
      compositeTaskDispatchEvidence.singleConstructorCallers.length > 0 &&
      compositeTaskDispatchEvidence.batchConstructorCallers.length > 0,
    compositeTaskEntrySourceRecovered:
      instructionRecords.some(
        (row) => row.role === "composite-task-single-inline-entry-store" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "composite-task-batch-entry-array-store" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "composite-task-dispatch-external-array-load" && row.opcodeMatchesExpected,
      ),
    compositeTaskConstructorCallsitesClassified:
      compositeTaskDispatchEvidence.constructorCallsites.filter((row) => row.label && row.entrySource).length,
    sceneEntityEntryArrayRecovered:
      instructionRecords.some(
        (row) => row.role === "scene-entity-entry-array-entry-load" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-entry-array-output-store" && row.opcodeMatchesExpected,
      ),
    sceneEntityManagerLifecycleRecovered:
      instructionRecords.some((row) => row.role === "scene-entity-manager-global-store" && row.opcodeMatchesExpected) &&
      instructionRecords.some((row) => row.role === "scene-entity-manager-global-clear" && row.opcodeMatchesExpected) &&
      sceneEntityManagerLifecycleEvidence.addRecordCallers.length > 0 &&
      sceneEntityManagerLifecycleEvidence.removeRecordCallers.length > 0,
    sceneEntityManagerRecordPoolRecovered:
      instructionRecords.some(
        (row) => row.role === "scene-entity-manager-constructor-free-list-metadata" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-manager-add-entry-pointer-store" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-manager-dispatch-record-id-load" && row.opcodeMatchesExpected,
      ),
    sceneEntityRecordEntrySourceRecovered:
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-add-caller-a-entry-pointer" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-add-caller-b-entry-pointer" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-manager-add-entry-pointer-store" && row.opcodeMatchesExpected,
      ),
    sceneEntityRecordEntryLayoutBRecovered:
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-layout-b-register-wrapper-tail" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-layout-b-transform-store-68" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-layout-b-transform-store-78" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-layout-b-transform-store-88" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-layout-b-manager-accessor" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-add-caller-b-call" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-layout-b-record-index-store" && row.opcodeMatchesExpected,
      ),
    sceneEntityRecordEntryLayoutBMaterialParamUpdateRecovered:
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-layout-b-followup-callsite" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-layout-b-followup-bitfield-load" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-layout-b-param-target-load-a" && row.opcodeMatchesExpected,
      ) &&
      [
        "scene-entity-record-layout-b-param-write-call-a",
        "scene-entity-record-layout-b-param-write-call-b",
        "scene-entity-record-layout-b-param-write-call-c",
        "scene-entity-record-layout-b-param-write-call-d",
        "scene-entity-record-layout-b-param-write-call-e",
        "scene-entity-record-layout-b-param-write-call-f",
      ].every((role) => instructionRecords.some((row) => row.role === role && row.opcodeMatchesExpected)) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-layout-b-state-dispatch-tail" && row.opcodeMatchesExpected,
      ),
    sceneEntityRecordEntryLayoutBStateDispatchRecovered:
      [
        "scene-entity-record-layout-b-state-mode-load",
        "scene-entity-record-layout-b-state-object-load",
        "scene-entity-record-layout-b-state-version-compare",
        "scene-entity-record-layout-b-state-stale-clear",
        "scene-entity-record-layout-b-state-mode3-apply-call",
        "scene-entity-record-layout-b-state-mode2-convert-call",
        "scene-entity-record-layout-b-state-mode1-convert-call",
        "scene-entity-record-layout-b-transform-apply-call-a",
        "scene-entity-record-layout-b-final-manager-accessor",
        "scene-entity-record-layout-b-final-param-target-load",
        "scene-entity-record-layout-b-final-record-index-load",
        "scene-entity-record-layout-b-param-payload-build-call",
        "scene-entity-record-layout-b-final-record-dispatch-call",
      ].every((role) => instructionRecords.some((row) => row.role === role && row.opcodeMatchesExpected)) &&
      sceneEntityRecordEntryEvidence.layoutB.stateDispatch.finalRecordDispatch.target ===
        addresses.sceneEntityManagerDispatchRecord,
    sceneEntityRecordEntryOwnerLinked:
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-entry-owner-b-accessor-call" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-entry-owner-and-callback-store" && row.opcodeMatchesExpected,
      ) &&
      sceneEntityRecordEntryEvidence.entrySetup.ownerBGlobalSlot === addresses.globalRenderCommandBSlot,
    sceneEntityRecordEntryHelperDispatchRecovered:
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-entry-helper-dispatch-tail" && row.opcodeMatchesExpected,
      ) &&
      sceneEntityRecordEntryEvidence.entryCallbacks.helperDispatch.helperDispatchThunk ===
        addresses.globalHelperDispatchThunk &&
      sceneEntityRecordEntryEvidence.tables.primaryVtable.neighborhood.some(
        (entry) =>
          entry.relativeOffset === 0x20 && entry.value === addresses.sceneEntityRecordEntryGlobalHelperDispatchSlot,
      ),
    sceneEntityRecordEntryRenderOwnerBuilderLinked:
      instructionRecords.some(
        (row) => row.role === "composite-task-all-entry-owner-load" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some((row) => row.role === "composite-task-all-vslot-10-call" && row.opcodeMatchesExpected) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-entry-owner-and-callback-store" && row.opcodeMatchesExpected,
      ) &&
      sceneEntityRecordEntryEvidence.renderOwnerBuilderLink.ownerABuilderFunction ===
        addresses.renderCommandABuilder &&
      sceneEntityRecordEntryEvidence.renderOwnerBuilderLink.ownerBBuilderFunction === addresses.renderCommandBBuilder,
    sceneEntityRecordEntryX4TransformProviderRecovered:
      instructionRecords.some(
        (row) => row.role === "render-command-a-x4-provider-predecrement-load" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "render-command-b-x4-provider-predecrement-load" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-record-entry-transform-provider-return" && row.opcodeMatchesExpected,
      ) &&
      sceneEntityRecordEntryEvidence.x4TransformProviderLink.providerTransformFunction ===
        addresses.sceneEntityRecordEntryTransformProviderReturn,
    sceneEntityRuntimeParamAccessorRecovered:
      instructionRecords.some(
        (row) => row.role === "scene-entity-runtime-param-accessor-base-add" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-runtime-param-accessor-indexed-load" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "draw-all-scene-entities-runtime-param-accessor-call" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "draw-all-scene-entities-runtime-param-constructor-arg" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some((row) => row.role === "composite-task-batch-runtime-param-store" && row.opcodeMatchesExpected) &&
      sceneEntityRuntimeParamEvidence.directCallers.some(
        (caller) => caller.callerAddress === addresses.drawAllSceneEntitiesRuntimeParamAccessorCall,
      ),
    sceneEntityRuntimeParamSlot0VtableRecovered:
      instructionRecords.some(
        (row) => row.role === "scene-entity-runtime-param-slot0-vtable-write" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-runtime-param-slot0-render-object-build-entry" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "scene-entity-runtime-param-returned-object-vtable-store" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "render-command-a-runtime-param-result-store" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "render-command-b-runtime-param-result-store" && row.opcodeMatchesExpected,
      ) &&
      sceneEntityRuntimeParamEvidence.slot0Object.renderObjectBuildFunction ===
        addresses.sceneEntityRuntimeParamSlot0RenderObjectBuild &&
      sceneEntityRuntimeParamEvidence.returnedObject.valueAccessorFunction ===
        addresses.sceneEntityRuntimeParamReturnedObjectValueAccessor,
    sceneEntityRuntimeParamSourceMappingRecovered: [
      "render-owner-source-mapping-count-load",
      "render-owner-source-mapping-entry-array-load",
      "render-owner-source-mapping-entry-pointer-load",
      "render-owner-source-mapping-entry-compare",
      "render-owner-source-mapping-source-array-load",
      "render-owner-source-mapping-source-return-load",
      "render-owner-source-mapping-build-entry-source-load",
      "render-owner-source-mapping-small-object-alloc",
      "render-owner-source-mapping-small-object-clear",
      "render-owner-source-mapping-current-entry-source-holder-load",
      "render-owner-source-mapping-current-entry-source-pointer-load",
      "render-owner-source-mapping-small-object-source-store-call",
      "render-owner-source-mapping-small-object-entry-store",
      "render-owner-source-mapping-source-array-append",
      "render-owner-source-mapping-entry-array-append",
      "render-owner-source-mapping-source-vector-count-load",
      "render-owner-source-mapping-source-vector-count-increment",
      "render-owner-source-mapping-source-vector-count-store",
      "render-owner-source-mapping-source-vector-array-load",
      "render-owner-source-mapping-source-vector-payload-load",
      "render-owner-source-mapping-source-vector-slot-address",
      "render-owner-source-mapping-source-vector-payload-store",
      "render-owner-source-mapping-entry-vector-count-load",
      "render-owner-source-mapping-entry-vector-count-increment",
      "render-owner-source-mapping-entry-vector-count-store",
      "render-owner-source-mapping-entry-vector-array-load",
      "render-owner-source-mapping-entry-vector-payload-load",
      "render-owner-source-mapping-entry-vector-slot-address",
      "render-owner-source-mapping-entry-vector-payload-store",
      "render-owner-source-mapping-next-entry-load",
      "render-owner-source-mapping-build-holder-head-deref",
      "render-owner-source-mapping-build-empty-holder-guard",
      "source-table-holder-rebuild-node-size",
      "source-table-holder-rebuild-old-head-load",
      "source-table-holder-rebuild-mapping-call",
      "source-table-holder-rebuild-store",
      "source-table-holder-rebuild-root-map-call",
      "source-table-holder-rebuild-child-chain-load",
      "source-table-holder-rebuild-sibling-chain-load",
    ].every((role) => instructionRecords.some((row) => row.role === role && row.opcodeMatchesExpected)),
    sceneEntityRuntimeParamSourceTableMountRecovered: [
      "scene-entity-source-table-mount-holder-address",
      "scene-entity-source-table-mount-tail-call",
      "scene-entity-source-table-mount-clone-call-a",
      "scene-entity-source-table-mount-call-a",
      "scene-entity-source-table-mount-clone-call-b",
      "scene-entity-source-table-mount-call-b",
      "scene-entity-layout-b-source-table-state0-load",
      "scene-entity-layout-b-source-table-state0-mount-call",
      "scene-entity-layout-b-source-table-state1-load",
      "scene-entity-layout-b-source-table-state1-mount-call",
      "scene-entity-layout-b-source-table-state2-load",
      "scene-entity-layout-b-source-table-state2-mount-call",
      "source-program-table-entry-builder-wrapper",
      "source-program-table-entry-header-store",
      "source-program-table-entry-resource-store",
      "source-program-table-entry-count-increment",
      "source-program-table-entry-payload-pointer-store",
    ].every((role) => instructionRecords.some((row) => row.role === role && row.opcodeMatchesExpected)),
    sceneEntityRuntimeParamDynamicSourceTableProducerRecovered: [
      "dynamic-source-program-table-temp-init-call",
      "dynamic-source-program-table-list-head-load",
      "dynamic-source-program-table-source-list-load",
      "dynamic-source-program-table-nested-head-load",
      "dynamic-source-program-table-resource-id-load",
      "dynamic-source-program-table-resource-id-scratch-store",
      "dynamic-source-program-table-nested-next-load",
      "dynamic-source-program-table-resource-count-mask",
      "dynamic-source-program-table-resource-count-max-check",
      "dynamic-source-program-table-mode-1",
      "dynamic-source-program-table-mode-2",
      "dynamic-source-program-table-mode-3",
      "dynamic-source-program-table-mode-4",
      "dynamic-source-program-table-entry-writer-call",
      "dynamic-source-program-table-next-list-load",
      "dynamic-source-program-table-clone-call",
      "dynamic-source-program-table-destination-store",
      "dynamic-source-program-table-mount-call",
      "dynamic-source-program-table-direct-caller-scene-object-load-a",
      "dynamic-source-program-table-direct-caller-resource-list-load-a",
      "dynamic-source-program-table-direct-caller-scene-object-load-b",
      "dynamic-source-program-table-direct-caller-resource-list-load-b",
      "dynamic-source-program-table-direct-caller-destination",
      "dynamic-source-program-table-direct-caller-call",
      "dynamic-source-program-table-selector-list-load",
      "dynamic-source-program-table-selector-arg-preserve",
      "dynamic-source-program-table-selector-node-payload-load",
      "dynamic-source-program-table-selector-node-class-load",
      "dynamic-source-program-table-selector-next-node-load",
      "dynamic-source-program-table-selector-destination",
      "dynamic-source-program-table-selector-selected-node-move",
      "dynamic-source-program-table-selector-tail-call",
    ].every((role) => instructionRecords.some((row) => row.role === role && row.opcodeMatchesExpected)),
    sceneEntityRuntimeParamDynamicSourceTableUpstreamSelectionRecovered: [
      "dynamic-source-program-table-upstream-arg-resource-move",
      "dynamic-source-program-table-upstream-owner-store",
      "dynamic-source-program-table-upstream-default-array-load",
      "dynamic-source-program-table-upstream-default-node-load",
      "dynamic-source-program-table-upstream-primary-slot-load",
      "dynamic-source-program-table-upstream-primary-validate-call",
      "dynamic-source-program-table-upstream-primary-candidate-move",
      "dynamic-source-program-table-upstream-primary-fallback",
      "dynamic-source-program-table-upstream-secondary-slot-load",
      "dynamic-source-program-table-upstream-secondary-validate-call",
      "dynamic-source-program-table-upstream-secondary-fallback",
      "dynamic-source-program-table-upstream-primary-resource-load",
      "dynamic-source-program-table-upstream-primary-resource-validate-call",
      "dynamic-source-program-table-upstream-secondary-resource-load",
      "dynamic-source-program-table-upstream-secondary-resource-validate-call",
      "dynamic-source-program-table-upstream-no-resource-exit",
      "dynamic-source-program-table-upstream-scene-object-create-call",
      "dynamic-source-program-table-upstream-scene-object-store",
      "dynamic-source-program-table-upstream-primary-attach-resource-load",
      "dynamic-source-program-table-upstream-primary-attach-call",
      "dynamic-source-program-table-upstream-secondary-attach-resource-load",
      "dynamic-source-program-table-upstream-secondary-attach-call",
      "dynamic-source-program-table-upstream-type-byte-load",
      "dynamic-source-program-table-upstream-type-byte-store",
      "dynamic-source-program-table-upstream-transform-update-call",
    ].every((role) => instructionRecords.some((row) => row.role === role && row.opcodeMatchesExpected)),
    sceneEntityRuntimeParamDynamicSourceTableSelectorCallsiteRecovered: [
      "dynamic-source-program-table-selector-caller-config-load",
      "dynamic-source-program-table-selector-caller-config-validate-call",
      "dynamic-source-program-table-selector-caller-valid-branch",
      "dynamic-source-program-table-selector-caller-parent-index-load",
      "dynamic-source-program-table-selector-caller-parent-create-call",
      "dynamic-source-program-table-selector-caller-child-index-load",
      "dynamic-source-program-table-selector-caller-child-create-call",
      "dynamic-source-program-table-selector-caller-child-attach-payload-load",
      "dynamic-source-program-table-selector-caller-child-attach-call",
      "dynamic-source-program-table-selector-caller-selector-arg-load",
      "dynamic-source-program-table-selector-caller-selector-object-move",
      "dynamic-source-program-table-selector-caller-selector-call",
      "dynamic-source-program-table-selector-caller-post-index-load",
      "dynamic-source-program-table-selector-caller-post-child-create-call",
      "dynamic-source-program-table-selector-caller-post-config-load",
      "dynamic-source-program-table-selector-caller-post-list-arg",
      "dynamic-source-program-table-selector-caller-post-apply-call",
    ].every((role) => instructionRecords.some((row) => row.role === role && row.opcodeMatchesExpected)),
    sceneEntityRuntimeParamDynamicSourceTableSelectorTypeIndicesRecovered: [
      "dynamic-source-program-table-selector-child-lazy-init-flag-load",
      "dynamic-source-program-table-selector-child-lazy-init-type-record-load",
      "dynamic-source-program-table-selector-child-lazy-init-flag-store",
      "dynamic-source-program-table-selector-child-lazy-init-global-store",
      "dynamic-source-program-table-post-child-lazy-init-flag-load",
      "dynamic-source-program-table-post-child-lazy-init-type-record-load",
      "dynamic-source-program-table-post-child-lazy-init-flag-store",
      "dynamic-source-program-table-post-child-lazy-init-global-store",
      "dynamic-source-program-table-parent-lazy-init-flag-load",
      "dynamic-source-program-table-parent-lazy-init-type-record-load",
      "dynamic-source-program-table-parent-lazy-init-flag-store",
      "dynamic-source-program-table-parent-lazy-init-global-store",
      "dynamic-source-program-table-parent-type-record-count-load",
      "dynamic-source-program-table-parent-type-callback-pair-store",
      "dynamic-source-program-table-parent-type-record-store",
      "dynamic-source-program-table-parent-type-global-store",
      "dynamic-source-program-table-selector-child-type-callback-pair-store",
      "dynamic-source-program-table-selector-child-type-size-literal",
      "dynamic-source-program-table-selector-child-type-record-store",
      "dynamic-source-program-table-selector-child-type-global-store",
      "dynamic-source-program-table-post-child-type-record-count-load",
      "dynamic-source-program-table-post-child-type-callback-pair-store",
      "dynamic-source-program-table-post-child-type-flag-literal",
      "dynamic-source-program-table-post-child-type-size-literal",
      "dynamic-source-program-table-post-child-type-record-store",
      "dynamic-source-program-table-post-child-type-global-store",
      "dynamic-source-program-table-post-child-setup-init-vslot-load",
      "dynamic-source-program-table-post-child-setup-init-vcall",
      "dynamic-source-program-table-post-child-setup-payload-clone-call",
      "dynamic-source-program-table-post-child-setup-payload-store-a",
      "dynamic-source-program-table-post-child-setup-payload-store-b",
      "dynamic-source-program-table-post-child-setup-primary-transform-call",
    ].every((role) => instructionRecords.some((row) => row.role === role && row.opcodeMatchesExpected)),
    sceneEntityRuntimeParamSourceTableProgramRecovered: [
      "scene-entity-runtime-param-source-table-load",
      "scene-entity-runtime-param-source-table-indexed-address",
      "scene-entity-runtime-param-sort-key-source-entry-load",
      "scene-entity-runtime-param-program-apply-source-object-load",
      "scene-entity-runtime-param-program-apply-source-index-load",
      "scene-entity-runtime-param-program-apply-source-table-load",
      "scene-entity-runtime-param-program-apply-source-entry-load",
      "scene-entity-runtime-param-program-pointer-load",
      "scene-entity-runtime-param-program-id-load",
      "scene-entity-runtime-param-gl-use-program-call",
      "scene-entity-runtime-param-program-param-load",
      "scene-entity-runtime-param-program-param-fallback-load",
      "scene-entity-runtime-param-program-param-apply-call",
    ].every((role) => instructionRecords.some((row) => row.role === role && row.opcodeMatchesExpected)),
    sceneEntityRuntimeParamSortKeyFormulaRecovered: [
      "scene-entity-runtime-param-source-table-load",
      "scene-entity-runtime-param-source-table-indexed-address",
      "scene-entity-runtime-param-sort-key-source-entry-load",
      "scene-entity-runtime-param-sort-key-source-flag-load",
      "scene-entity-runtime-param-sort-key-pointer-low-bits",
      "scene-entity-runtime-param-sort-key-mode-nibble",
      "scene-entity-runtime-param-sort-key-mode-insert",
      "scene-entity-runtime-param-sort-key-flag-shift",
      "scene-entity-runtime-param-sort-key-flag-test",
      "scene-entity-runtime-param-sort-key-flag-insert",
      "scene-entity-runtime-param-sort-key-category-bit-select",
      "scene-entity-runtime-param-sort-key-or",
      "scene-entity-runtime-param-sort-key-toggle",
      "scene-entity-runtime-param-sort-key-store",
      "scene-entity-runtime-param-sort-key-accessor",
    ].every((role) => instructionRecords.some((row) => row.role === role && row.opcodeMatchesExpected)),
    renderCommandQueueSortKeyRecovered:
      instructionRecords.some(
        (row) => row.role === "render-command-queue-sort-key-load" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "render-command-queue-sort-pair-store" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "render-command-queue-sort-call" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "render-command-queue-sort-reappend-call" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "render-command-queue-sort-pivot-key-load" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "render-command-queue-sort-left-key-compare" && row.opcodeMatchesExpected,
      ) &&
      instructionRecords.some(
        (row) => row.role === "render-command-queue-sort-right-key-compare" && row.opcodeMatchesExpected,
      ),
    renderCommandClassesWithTransformCopyEvidence: renderCommandTransformCopies.length,
    queueAppendCallsitesFromSamplerRenderCommands: instructionRecords.filter((row) =>
      row.role.endsWith("queue-append-call"),
    ).length,
  };
  const manifest = {
    generatedAt: new Date().toISOString(),
    binaryPath,
    policy:
      "diagnostic-only current-binary position sampler owner audit; it identifies the render-command position source but does not select a hero preview profile or change viewer rendering",
    addresses: Object.fromEntries(Object.entries(addresses).map(([key, value]) => [key, hex(value)])),
    summary,
    instructionEvidence: instructionRecords,
    relationships,
    ownerVtableEvidence,
    globalSlotTextReferences,
    helperDispatcherEvidence,
    resourceContextDispatchEvidence,
    resourceHandlerRegistrationEvidence,
    meshDataRuntimeHandoffEvidence,
    compositeTaskDispatchEvidence,
    sceneEntityEntryArrayEvidence,
    sceneEntityManagerLifecycleEvidence,
    sceneEntityRecordEntryEvidence,
    sceneEntityRuntimeParamEvidence,
    renderCommandTransformCopies,
    globalFactoryEvidence: {
      initCallsite: hex(addresses.rendererInitCaller),
      initFunction: hex(addresses.renderCommandFactoryInit),
      sceneProbeServiceGlobalInitCallsite: hex(addresses.sceneProbeServiceGlobalInitCall),
      globalSlots: [
        {
          slot: "render-factory-or-context",
          address: hex(addresses.globalRenderFactorySlot),
          evidence: "0x18905b8 stores the first allocated helper object into 0x311ae00.",
        },
        {
          slot: "render-command-b-owner",
          address: hex(addresses.globalRenderCommandBSlot),
          evidence:
            "0x18905cc constructs the 0x1893628 owner, writes owner vtable 0x2ab5230, and 0x18905d8 stores it into 0x311ae08.",
        },
        {
          slot: "render-command-a-owner",
          address: hex(addresses.globalRenderCommandASlot),
          evidence:
            "0x18905f0 constructs the 0x1891f8c owner, writes owner vtable 0x2ab5188, and 0x18905f8 stores it into 0x311ae10.",
        },
      ],
      interpretation:
        "0xe01d28 calls 0x1890584 from renderer/global initialization after the scene/probe service init at 0xe01cdc, so these sampler render-command owners are global render queue infrastructure rather than per-skin profile constants.",
    },
    interpretation: [
      "The current 0xe36efc callers are owned by queued render-command objects. They read command +0x50/+0x58, pack a 12-byte vec3-like position, and sample the scene probe service.",
      "The owner objects are initialized by the renderer/global factory path: 0xe01d28 -> 0x1890584, which stores owner B at 0x311ae08 and owner A at 0x311ae10. Their builder functions are vtable +0x10 entries, not direct calls.",
      "Both recovered command builders copy a 4x4 transform from a provider returned by virtual slot +0x18. The copied transform column at source +0x30 becomes command +0x50, which is the position later sampled by 0xe36efc.",
      "The global helper now shows an upstream dispatcher chain: helper +0x20 is set by 0x1890948, 0x1890958 calls that object's vtable +0x10, e02c80's vtable +0x10 is 0xe02c94, and 0xe02c94 forwards to 0xe28660.",
      "The e02c80 context pointer is resolved through d7f00c(1) -> e03474 -> e28418. The e28418 context primary vtable 0x272ed90 has +0x18 slot 0xe28674, so the previously unresolved e28660 indirect branch now lands in the shared resource dispatcher.",
      "The e28418 context handler table is now recovered for the core resource handlers. Renderer setup constructs animData, meshData, shaderData, and texData handlers, registers them through context vtable +0x10, and the meshData handler name slot returns the same resource string passed by e02c94.",
      "The meshData handler process function e02ac8 hashes the request path/name, calls 0x18918e4 to build or fetch the mesh resource object, then stores that result back onto the request object.",
      "The 0x18918e4 object handoff is now partially traced: it allocates a runtime object with primary vtable 0x2ab5148, stores request/resource-factory/hash fields, reaches setup 0x1891a70, and uses 0x1890e90/0x1890e98 plus 0x18942f8 to build payload blocks before the render owner builders enqueue commands.",
      "One upstream dispatch shape is now current-package evidence: composite-task vtable 0x2ab5590 slot +0x18 points to 0x18a13fc. Its dispatch loop calls each entry object's vtable +0x10 with x2 loaded from task +0x58 and x4 set to the current list entry, matching the argument roles seen inside the render owner builders.",
      "The composite-task entry source is constructor-owned: 0x18a1170 stores the caller's x2 as an inline entry at task +0x50, while 0x18a11e4 stores the caller's x2 as an entry-array pointer at task +0x50 and records x3 as the count with the external-array flag. Cloning through 0x18a1268 preserves task +0x58 and +0x50.",
      "Current direct constructor callsites are classified as menu mesh, scene entity, particle effects, ScreenNode, ViewNode/ViewRTNode, and shadow tasks. None of those labels alone proves a hero preview render owner; the next trace must inspect each callsite's x2 entry or entry-array contents.",
      "The Draw all scene entities entry array is now traced one layer deeper. 0x188e784 loads global manager slot 0x311a960 and forwards to 0x188f03c; 0x188f03c asks the manager for u16 indices, converts each index into manager +0x10 + index*16 +0x8, and writes those concrete entry pointers to the composite task entry array.",
      "The global scene/entity manager is now traced as a concrete fixed record-pool lifecycle. Initialization allocates 0x8020 bytes, calls 0x188eeb4, and stores the manager at 0x311a960. 0x188eeb4 stores the backing indexed object at manager +0x0, initializes 0x800 records from +0x10, and writes free-list metadata at +0x8010. Shutdown loads/deletes/clears the same global slot.",
      "Scene/entity records are also traced through mutation and dispatch. 0x188eee0 allocates a free record, calls the backing object's vtable +0x10, stores the returned id at record +0x2, and stores the caller-provided entry pointer at record +0x8. 0x188ef88 removes records through backing vtable +0x18, and 0x188f020 dispatches per-record payloads through backing vtable +0x20.",
      "The record +0x8 entries are now traced one layer deeper. Both add-record callsites pass x3 = object +0x30 into 0x188eee0, and one setup path stores global render-command owner B from 0x18906ec plus a 0x2726740-derived callback/table pointer into that entry subobject.",
      "The scene/entity x2 runtime-parameter object is now traced to the global runtime-parameter table accessor. Draw all scene entities calls 0x189d63c(0), passes the returned 0x311af50 slot 0 object as x4 to 0x18a11e4, and that constructor stores it at task +0x58 before composite dispatch passes it as x2 to render-owner builders.",
      "The x2 slot0 vtable is now linked too: 0x189f7ec writes vtable 0x2ab54a0, owner builders call slot +0x10 -> 0x189f850, 0x189f850 constructs a 0x2ab54f8 returned object, and render-command A/B store that returned object's +0x10 result at queued command +0x18.",
      "The source-object mapping in front of 0x189f850 is also current-binary bounded: 0x1891818(owner, entry) searches owner +0x18 for the active entry and returns owner +0x8[index]; 0x18916c8 builds those paired arrays by reading entry +0x28, walking the holder chain through chain node +0x58, and storing *(source holder +0) from *(chain node +0x8) as the small source object +0. Both vector append helpers now have matching internal count/store evidence. The fallback entry +0x8 path is therefore explicitly a fallback, not the primary proven source.",
      "The source/program table mount path feeding that mapping is no longer open-ended: 0xd8003c mounts x1 onto object +0x58 through 0x18907a8; two recovered callsites mount 0x189be5c clone/finalize results, and layout-B state-switch paths mount object +0x40/+0x48/+0x50 source/program table fields through the same wrapper.",
      "The mapped source object now reaches a proven source/program table: 0x189f8f8 indexes small source object +0 to select entry[index] +0x8, uses entry +0x10 for sort-key flags, and the later program-apply path calls glUseProgram from entry +0 and applies parameters from entry +0x8 through 0x189ca94.",
      "The command sort key's construction is no longer a black box: 0x189f8f8 builds it from the selected source/program entry pointer, runtime mode nibble, and source/program entry +0x10 flags, then 0x189fa40 returns it from object +0x10. This is runtime queue evidence, not shadergraph word2 evidence.",
      "Queued command +0x18 is now classified as a render queue sort key, not a hero profile pointer: 0x18a1698 collects [command+0x18, command] pairs, 0x18a1750 sorts by the first qword, and the queue is rebuilt through 0x18a15c8.",
      "This narrows the unresolved runtime link: the scene/entity entry to render-owner builder call, x4 transform-provider source, x2 global table slot source, x2 slot0 vtable path, and command sort key are now linked, so the next trace must identify which active profile payload is loaded into the scene probe service before these commands are drawn.",
      "This does not prove the active hero/model preview lighting profile and must not switch the character-lit shader path by itself.",
    ],
  };
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, reportRows(manifest), ["category", "subject", "address", "relationship", "detail"]);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativePositionSamplerOwnerAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  addresses,
  exportCurrentNativePositionSamplerOwnerAudit,
};
