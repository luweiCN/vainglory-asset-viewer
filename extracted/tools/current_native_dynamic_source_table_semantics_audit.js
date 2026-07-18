#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultOwnerAuditPath = "extracted/viewer/current-native-position-sampler-owner-audit.json";
const defaultLevelOwnerAuditPath = "extracted/viewer/current-native-level-runtime-owner-audit.json";
const defaultLevelSchemaAuditPath = "extracted/reports/current_native_levelvisuals_schema_audit.json";
const defaultViewerOut = "extracted/viewer/current-native-dynamic-source-table-semantics-audit.json";
const defaultJsonOut = "extracted/reports/current_native_dynamic_source_table_semantics_audit.json";
const defaultTsvOut = "extracted/reports/current_native_dynamic_source_table_semantics_audit.tsv";

const typeIndexSpecs = [
  [0x8d543c, "parent-type-record-count-load", "b8686809", "parent runtime type registration reads the shared type-record count."],
  [0x8d5460, "parent-type-callback-pair-store", "a90b2d48", "parent runtime type registration stores callback pair 0x8d5554/0x8d556c."],
  [0x8d546c, "parent-type-index-and-size-store", "2914ad49", "parent runtime type record stores the runtime index and 0x30 object size."],
  [0x8d548c, "parent-type-index-global-store", "b900c909", "parent runtime type index is stored in global 0x30350c8."],
  [0xd7fc0c, "selector-child-type-record-count-load", "b8686809", "selector child type registration reads the shared type-record count."],
  [0xd7fc30, "selector-child-type-callback-pair-store", "a90b2d48", "selector child type registration stores callback pair 0xd7fc64/0xd7fc74."],
  [0xd7fc38, "selector-child-type-size-literal", "5280170b", "selector child type registration uses object size 0xb8."],
  [0xd7fc3c, "selector-child-type-index-and-size-store", "2914ad49", "selector child type record stores the runtime index and 0xb8 object size."],
  [0xd7fc5c, "selector-child-type-index-global-store", "b909e509", "selector child runtime type index is stored in global 0x30349e4."],
  [0x8b415c, "post-child-type-record-count-load", "b8686809", "post child type registration reads the shared type-record count."],
  [0x8b4180, "post-child-type-callback-pair-store", "a90b214b", "post child type registration stores callback pair 0x8b4c58/0x8b4c7c-family."],
  [0x8b4188, "post-child-type-control-literal", "52801f4b", "post child type registration writes control literal 0xfa into type metadata."],
  [0x8b4190, "post-child-type-size-literal", "5283a30c", "post child type registration uses object size 0x1d18."],
  [0x8b41b4, "post-child-type-index-and-size-store", "2914b149", "post child type record stores the runtime index and 0x1d18 object size."],
  [0x8b41bc, "post-child-type-index-global-store", "b909f109", "post child runtime type index is stored in global 0x30349f0."],
  [0x8b41c0, "post-child-type-register-tail-call", "143f604d", "post child registration tail-calls the shared type-registration helper."],
  [0x79e68c, "selector-child-lazy-init-flag-load", "3967a109", "selector child lazy initializer checks global 0x30349e8."],
  [0x79e698, "selector-child-lazy-init-type-record-load", "f9461929", "selector child lazy initializer loads the shared type-record pointer."],
  [0x79e6a4, "selector-child-lazy-init-flag-store", "f904f50b", "selector child lazy initializer marks global 0x30349e8 initialized."],
  [0x79e6ac, "selector-child-lazy-init-global-store", "b909e549", "selector child lazy initializer copies the type index into global 0x30349e4."],
  [0x79e6b8, "post-child-lazy-init-flag-load", "3967e109", "post child lazy initializer checks global 0x30349f8."],
  [0x79e6c4, "post-child-lazy-init-type-record-load", "f9461929", "post child lazy initializer loads the shared type-record pointer."],
  [0x79e6d0, "post-child-lazy-init-flag-store", "f904fd0b", "post child lazy initializer marks global 0x30349f8 initialized."],
  [0x79e6d8, "post-child-lazy-init-global-store", "b909f149", "post child lazy initializer copies the type index into global 0x30349f0."],
  [0x79f26c, "parent-lazy-init-flag-load", "39434109", "parent lazy initializer checks global 0x30350d0."],
  [0x79f278, "parent-lazy-init-type-record-load", "f9461929", "parent lazy initializer loads the shared type-record pointer."],
  [0x79f284, "parent-lazy-init-flag-store", "f900690b", "parent lazy initializer marks global 0x30350d0 initialized."],
  [0x79f28c, "parent-lazy-init-global-store", "b900c949", "parent lazy initializer copies the type index into global 0x30350c8."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ stage: "runtime-type-index", address, role, expectedOpcodeHex, evidence }));

const selectorBridgeSpecs = [
  [0x8d551c, "selector-wrapper-candidate-chain-load", "f9400c08", "selector wrapper loads parent object +0x18 as the candidate chain."],
  [0x8d5520, "selector-wrapper-resource-list-preserve", "aa0103e2", "selector wrapper preserves the incoming resource/list argument as x2 for the dynamic source-table producer."],
  [0x8d552c, "selector-wrapper-child-type-index-load", "b949e529", "selector wrapper loads global 0x30349e4 as the selector child runtime type index."],
  [0x8d5530, "selector-wrapper-candidate-payload-load", "f940050a", "selector wrapper reads candidate node +0x8 before checking its type metadata."],
  [0x8d5534, "selector-wrapper-candidate-class-load", "b940a54a", "selector wrapper reads candidate payload +0xa4 for type-index matching."],
  [0x8d5540, "selector-wrapper-next-candidate-load", "f9401108", "selector wrapper advances through candidate node +0x20 when the type index does not match."],
  [0x8d5548, "selector-wrapper-destination-pointer", "9100a001", "selector wrapper passes parent object +0x28 as the cloned source-table destination."],
  [0x8d5550, "selector-wrapper-dynamic-producer-tailcall", "140b5d21", "selector wrapper tail-calls the dynamic source-table producer 0xbac9d4."],
  [0x8ccaa4, "selector-caller-config-load", "f9401c28", "selector caller loads config/resource pointer from x19 +0x38."],
  [0x8ccaac, "selector-caller-config-validate-call", "9412830d", "selector caller validates x19 +0x38 through 0xd6d6e0 before using the selector path."],
  [0x8ccab8, "selector-caller-parent-index-load", "b940c901", "selector caller loads parent runtime type index global 0x30350c8."],
  [0x8ccac0, "selector-caller-parent-create-call", "943efb7e", "selector caller creates/resolves the parent object through 0x188b8b8."],
  [0x8ccac8, "selector-caller-child-index-load", "b949e501", "selector caller loads selector child runtime type index global 0x30349e4."],
  [0x8ccad0, "selector-caller-child-create-call", "943efb7a", "selector caller creates/resolves the selector child object through 0x188b8b8."],
  [0x8ccad8, "selector-caller-child-attach-payload-load", "f9401a61", "selector caller loads x19 +0x30 and attaches it to the selector child object."],
  [0x8ccae4, "selector-caller-child-attach-call", "d63f0100", "selector caller invokes the selector child object's vtable +0x20 attach path."],
  [0x8ccae8, "selector-caller-resource-list-load", "f9403661", "selector caller loads x19 +0x68 as the selector resource/list argument."],
  [0x8ccaf0, "selector-caller-selector-call", "9400228b", "selector caller invokes the 0x8d551c selector wrapper."],
  [0x8ccaf8, "selector-caller-post-child-index-load", "b949f101", "selector caller loads post child runtime type index global 0x30349f0."],
  [0x8ccb00, "selector-caller-post-child-create-call", "943efb6e", "selector caller creates/resolves the post child object through 0x188b8b8."],
  [0x8ccb04, "selector-caller-post-config-load", "f9401e61", "selector caller passes x19 +0x38 as the post child config/resource pointer."],
  [0x8ccb08, "selector-caller-post-transform-arg", "91010262", "selector caller passes x19 +0x40 as the post child transform/config block."],
  [0x8ccb0c, "selector-caller-post-setup-call", "97ff9f21", "selector caller initializes the post child through 0x8b4790."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ stage: "selector-bridge", address, role, expectedOpcodeHex, evidence }));

const upstreamBatchDispatcherSpecs = [
  [0x8cc640, "upstream-wrapper-batch-loader-tailcall", "17fffe40", "one wrapper adjusts x0 and tail-calls the upstream source-table batch loader 0x8cbf40."],
  [0x8cbf6c, "upstream-loader-config-store", "f9001801", "upstream loader stores the config object x1 at owner object +0x30."],
  [0x8cbf80, "upstream-loader-scratch-list-source-load", "f940b834", "upstream loader reads config +0x170 as a list used to build the scratch resource list."],
  [0x8cbf8c, "upstream-loader-scratch-list-key-load", "f9400101", "upstream loader reads each config +0x170 list node key before scratch-list building."],
  [0x8cbfac, "upstream-loader-scratch-list-build-call", "94000042", "upstream loader calls 0x8cc0b4 to append/build the scratch resource list at sp+0x18."],
  [0x8cbfb8, "upstream-loader-resource-key-list-load", "f9400a68", "upstream loader reads config +0x10 as the resource-key list used for batch dispatch."],
  [0x8cbfd4, "upstream-loader-resource-context-call", "940e9b7a", "upstream loader enters the resource context resolver for each config +0x10 resource key."],
  [0x8cbfe0, "upstream-loader-resource-key-resolve-call", "940e9b7a", "upstream loader resolves the resource key through the shared lookup path."],
  [0x8cbfe8, "upstream-loader-batch-type-index-load", "b940aae2", "upstream loader loads global 0x30350a8 as the batch resource type index."],
  [0x8cbffc, "upstream-loader-batch-type-check-call", "943f0951", "upstream loader type-checks the resolved resource against global 0x30350a8."],
  [0x8cc010, "upstream-loader-candidate-class-load", "b940a529", "upstream loader validates candidate payload +0xa4 against the batch resource type index."],
  [0x8cc024, "upstream-loader-scratch-list-arg", "910063e2", "upstream loader passes the scratch resource list at sp+0x18 as x2 to the batch dispatcher."],
  [0x8cc028, "upstream-loader-resource-object-arg", "aa1403e1", "upstream loader passes the resolved resource object as x1 to the batch dispatcher."],
  [0x8cc02c, "upstream-loader-batch-dispatch-call", "94000094", "upstream loader calls 0x8cc27c with selected object, resolved resource object, and scratch list."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ stage: "upstream-batch-dispatcher", address, role, expectedOpcodeHex, evidence }));

const postChildSetupSpecs = [
  [0x8b47c4, "post-child-init-vcall", "d63f0100", "post child setup calls the object's vtable +0x10 initializer."],
  [0x8b47cc, "post-child-payload-clone-call", "943f9a63", "post child setup clones/builds payload data from x19 +0x38 through 0x189b158."],
  [0x8b47d0, "post-child-payload-store-a", "f90df660", "post child setup stores the cloned payload at object +0x1be8."],
  [0x8b47d4, "post-child-payload-store-b", "f9001660", "post child setup stores the cloned payload at object +0x28."],
  [0x8b47d8, "post-child-transform-pair-load", "a9400a81", "post child setup reads the first two transform/config pointers from x19 +0x40."],
  [0x8b47ec, "post-child-primary-transform-apply-call", "94000025", "post child setup applies the primary transform/config block through 0x8b4880."],
  [0x8b4818, "post-child-extra-transform-apply-call", "94000046", "post child setup applies extra transform/list entries through 0x8b4930."],
  [0x8b4854, "post-child-default-effect-apply-call", "94000126", "post child setup applies a default effect/config block through 0x8b4cec."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ stage: "post-child-setup", address, role, expectedOpcodeHex, evidence }));

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
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

function fileOffsetForVirtualAddress(elf, virtualAddress, byteLength = 4) {
  for (const segment of elf.loads) {
    if (virtualAddress >= segment.virtualAddress && virtualAddress + byteLength <= segment.virtualAddress + segment.fileSize) {
      return segment.fileOffset + (virtualAddress - segment.virtualAddress);
    }
  }
  return -1;
}

function opcodeRowsForSpecs(buffer, elf, specs) {
  return specs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      stage: spec.stage,
      role: spec.role,
      address: spec.address,
      addressHex: hex(spec.address),
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function buildCurrentNativeDynamicSourceTableSemanticsAudit(
  {
    binaryPath = defaultBinary,
    ownerAuditPath = defaultOwnerAuditPath,
    levelOwnerAuditPath = defaultLevelOwnerAuditPath,
    levelSchemaAuditPath = defaultLevelSchemaAuditPath,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const typeIndexRows = opcodeRowsForSpecs(buffer, elf, typeIndexSpecs);
  const selectorBridgeRows = opcodeRowsForSpecs(buffer, elf, selectorBridgeSpecs);
  const upstreamBatchDispatcherRows = opcodeRowsForSpecs(buffer, elf, upstreamBatchDispatcherSpecs);
  const postChildSetupRows = opcodeRowsForSpecs(buffer, elf, postChildSetupSpecs);
  const opcodeRows = [...typeIndexRows, ...selectorBridgeRows, ...upstreamBatchDispatcherRows, ...postChildSetupRows];
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const ownerAudit = readJson(ownerAuditPath, { summary: {} });
  const levelOwnerAudit = readJson(levelOwnerAuditPath, { summary: {} });
  const levelSchemaAudit = readJson(levelSchemaAuditPath, { summary: {} });
  const ownerSummary = ownerAudit.summary || {};
  const levelOwnerSummary = levelOwnerAudit.summary || {};
  const levelSchemaSummary = levelSchemaAudit.summary || {};
  const levelCriticalFields = Array.isArray(levelSchemaSummary.levelCriticalFieldOffsets)
    ? levelSchemaSummary.levelCriticalFieldOffsets
    : [];
  const hasLevelVisualsRefListField = levelCriticalFields.some(
    (row) => row.fieldOffset === "0x10" && row.typeName === "LevelVisualsRef**",
  );
  const hasStructureAttachPointField = levelCriticalFields.some(
    (row) => row.fieldOffset === "0x170" && row.typeName === "StructureAttachPoint**",
  );
  const sourceTableProducerAgrees =
    Boolean(ownerSummary.sceneEntityRuntimeParamDynamicSourceTableProducerRecovered) &&
    Boolean(ownerSummary.sceneEntityRuntimeParamDynamicSourceTableSelectorCallsiteRecovered) &&
    Boolean(ownerSummary.sceneEntityRuntimeParamDynamicSourceTableSelectorTypeIndicesRecovered);
  const summary = {
    typeIndexRows: typeIndexRows.length,
    selectorBridgeRows: selectorBridgeRows.length,
    upstreamBatchDispatcherRows: upstreamBatchDispatcherRows.length,
    postChildSetupRows: postChildSetupRows.length,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
    sourceTableTypeIndexChainRecovered: opcodeMismatchRows === 0,
    selectorChildClassMatchRecovered:
      opcodeMismatchRows === 0 &&
      selectorBridgeRows.some((row) => row.role === "selector-wrapper-candidate-class-load" && row.opcodeMatches),
    selectorCallerObjectCreationRecovered:
      opcodeMismatchRows === 0 &&
      selectorBridgeRows.some((row) => row.role === "selector-caller-parent-create-call" && row.opcodeMatches) &&
      selectorBridgeRows.some((row) => row.role === "selector-caller-child-create-call" && row.opcodeMatches) &&
      selectorBridgeRows.some((row) => row.role === "selector-caller-post-child-create-call" && row.opcodeMatches),
    upstreamConfigFieldChainRecovered:
      opcodeMismatchRows === 0 &&
      upstreamBatchDispatcherRows.some((row) => row.role === "upstream-loader-scratch-list-source-load" && row.opcodeMatches) &&
      upstreamBatchDispatcherRows.some((row) => row.role === "upstream-loader-resource-key-list-load" && row.opcodeMatches),
    batchDispatcherToSelectorRecovered:
      opcodeMismatchRows === 0 &&
      upstreamBatchDispatcherRows.some((row) => row.role === "upstream-loader-batch-dispatch-call" && row.opcodeMatches) &&
      selectorBridgeRows.some((row) => row.role === "selector-caller-selector-call" && row.opcodeMatches),
    levelConfigFieldNamesRecovered:
      Boolean(levelSchemaSummary.currentLevelTypeConfirmed) &&
      Boolean(levelSchemaSummary.levelRuntimeVisualsLoaderConfirmed) &&
      hasLevelVisualsRefListField &&
      hasStructureAttachPointField,
    levelVisualsApplyProcessorFieldRoutingRecovered: Boolean(
      levelOwnerSummary.levelVisualsApplyProcessorFieldRoutingRecovered,
    ),
    postChildPayloadSetupRecovered:
      opcodeMismatchRows === 0 &&
      postChildSetupRows.some((row) => row.role === "post-child-payload-clone-call" && row.opcodeMatches) &&
      postChildSetupRows.some((row) => row.role === "post-child-primary-transform-apply-call" && row.opcodeMatches),
    sourceTableProducerAgrees,
    resourceFieldNamesRecovered: false,
    activeResourceSemanticsRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    ownerAuditPath,
    levelOwnerAuditPath,
    levelSchemaAuditPath,
    policy:
      "diagnostic-only dynamic source/program table resource semantics; proves runtime type-index and selector structure without naming resource fields or enabling rendering",
    summary,
    typeRoles: [
      {
        role: "level-config",
        source: "current_native_levelvisuals_schema_audit",
        fields: [
          "Level +0x10: LevelVisualsRef**",
          "Level +0x170: StructureAttachPoint**",
        ],
      },
      {
        role: "parent",
        global: "0x30350c8",
        objectSize: "0x30",
        callbackPair: "0x8d5554/0x8d556c",
      },
      {
        role: "selector-child",
        global: "0x30349e4",
        objectSize: "0xb8",
        callbackPair: "0xd7fc64/0xd7fc74",
        matchField: "candidate payload +0xa4",
      },
      {
        role: "post-child",
        global: "0x30349f0",
        objectSize: "0x1d18",
        setupFunction: "0x8b4790",
        payloadFields: "object +0x1be8 and +0x28",
      },
    ],
    interpretation: {
      recovered:
        "The upstream loader reads Level +0x170 and Level +0x10, resolves LevelVisualsRef keys, filters candidates by LevelVisuals type index 0x30350a8, and calls the batch dispatcher. The selector path then creates parent, selector-child, and post-child runtime objects from three global type indices; the selector wrapper matches candidate payload +0xa4 against the selector-child index and tail-calls the dynamic source-table producer; the post child receives config/resource pointer x19+0x38 and transform/config block x19+0x40.",
      boundary:
        "This does not name the original resource-list fields, does not prove active model/profile semantics, and does not recover concrete sampler/resource ownership for shader parameters.",
      nextRequiredEvidence:
        "Trace the resource/config object fields feeding x19+0x30, x19+0x38, x19+0x40, and x19+0x68 back to typed CFF0/resource definitions or runtime capture before changing viewer rendering.",
    },
    items: opcodeRows,
  };
}

function exportCurrentNativeDynamicSourceTableSemanticsAudit({
  binaryPath = defaultBinary,
  ownerAuditPath = defaultOwnerAuditPath,
  levelOwnerAuditPath = defaultLevelOwnerAuditPath,
  levelSchemaAuditPath = defaultLevelSchemaAuditPath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeDynamicSourceTableSemanticsAudit({
    binaryPath,
    ownerAuditPath,
    levelOwnerAuditPath,
    levelSchemaAuditPath,
  });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "stage",
    "role",
    "addressHex",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeDynamicSourceTableSemanticsAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    ownerAuditPath: optionValue(args, "--owner-audit", defaultOwnerAuditPath),
    levelOwnerAuditPath: optionValue(args, "--level-owner-audit", defaultLevelOwnerAuditPath),
    levelSchemaAuditPath: optionValue(args, "--level-schema-audit", defaultLevelSchemaAuditPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeDynamicSourceTableSemanticsAudit,
  exportCurrentNativeDynamicSourceTableSemanticsAudit,
};
