#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64, scanTextReferences } = require("./current_native_anchor_audit");
const { findDirectBranchCallers } = require("./current_native_light_probe_chain_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-a-state-registration-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_a_state_registration_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_a_state_registration_audit.tsv";

const stateRegistrationAddress = 0xc80900;
const slotInstallerAddress = 0x188c2f4;
const offset2fcDispatchAddress = 0xc81338;
const typeRecord = {
  globalAddress: 0x3034b10,
  globalAddressHex: "0x3034b10",
  role: "layout-a-state-registration-type-index",
  typeLiteral: "0xc8",
  controlLiteral: "0x90",
  recordStride: "0x2e8",
  recordPointerSlotOffset: "0x13fb8",
  counterSlotOffset: "0x13fb0",
  initCallbackAddressHex: "0xc8191c",
  dispatchCallbackAddressHex: "0xc81968",
};

const typeGlobalCreateResolveReadAddresses = new Set([0xc5a034]);
const typeGlobalStateCallbackNeighborhoodReadAddresses = new Set([0xc80f2c]);

const opcodeSpecs = [
  {
    address: 0xc71748,
    role: "module-registration-calls-layout-a-state-registration",
    stage: "module-registration",
    expectedOpcodeHex: "94003c6e",
    expectedTarget: stateRegistrationAddress,
    evidence: "the current Android module registration hub calls the 0xc80900 state callback registration function",
  },
  {
    address: 0xc80900,
    role: "layout-a-state-registration-entry",
    stage: "state-registration",
    expectedOpcodeHex: "f81e0ff3",
    evidence: "registration function entry that stores callback function pointers through the shared slot installer",
  },
  {
    address: 0xc80918,
    role: "type-record-stride-literal-0x2e8",
    stage: "type-record-registration",
    expectedOpcodeHex: "52805d0a",
    evidence: "loads the 0x2e8 type-record stride before indexing the engine type-record array",
  },
  {
    address: 0xc80938,
    role: "type-record-stores-local-callback-slots",
    stage: "type-record-registration",
    expectedOpcodeHex: "a90b214b",
    evidence: "stores local record callbacks 0xc8191c and 0xc81968 into the type record",
  },
  {
    address: 0xc80940,
    role: "type-record-literal-0xc8",
    stage: "type-record-registration",
    expectedOpcodeHex: "5280190b",
    evidence: "loads type literal 0xc8 before packing it into the type record word at +0x2d8",
  },
  {
    address: 0xc80944,
    role: "type-record-control-literal-0x90",
    stage: "type-record-registration",
    expectedOpcodeHex: "5280120c",
    evidence: "loads control literal 0x90 before storing it with the assigned type index at record +0xa4",
  },
  {
    address: 0xc80958,
    role: "type-record-packed-literal-store",
    stage: "type-record-registration",
    expectedOpcodeHex: "b902d948",
    evidence: "stores the packed type literal into the type record",
  },
  {
    address: 0xc80960,
    role: "type-record-index-and-control-store",
    stage: "type-record-registration",
    expectedOpcodeHex: "2914b149",
    evidence: "stores the assigned type index and control literal 0x90 into the type record",
  },
  {
    address: 0xc80964,
    role: "type-record-pointer-engine-slot-store",
    stage: "type-record-registration",
    expectedOpcodeHex: "f82b680a",
    evidence: "stores the type-record pointer into engine slot x0+0x13fb8",
  },
  {
    address: 0xc80968,
    role: "type-record-global-index-store",
    stage: "type-record-registration",
    expectedOpcodeHex: "b90b1109",
    evidence: "stores the assigned type index into global 0x3034b10",
  },
  {
    address: 0xc8096c,
    role: "type-setup-guard-call",
    stage: "state-registration",
    expectedOpcodeHex: "97fdad12",
    expectedTarget: 0xbebdb4,
    evidence: "guard/setup call before conditional callback registration",
  },
  {
    address: 0xc80970,
    role: "conditional-state-callback-selector",
    stage: "state-registration",
    expectedOpcodeHex: "36000200",
    evidence: "conditional branch selecting the final callback pointer path",
  },
  {
    address: 0xc80988,
    role: "slot-installer-registers-first-callback",
    stage: "slot-installer",
    expectedOpcodeHex: "94302e5b",
    expectedTarget: slotInstallerAddress,
    evidence: "first direct slot-installer call after materializing callback 0xc809d0",
  },
  {
    address: 0xc809a0,
    role: "slot-installer-registers-second-callback",
    stage: "slot-installer",
    expectedOpcodeHex: "94302e55",
    expectedTarget: slotInstallerAddress,
    evidence: "second direct slot-installer call after materializing callback 0xc80ae4",
  },
  {
    address: 0xc809ac,
    role: "slot-installer-third-callback-fast-path",
    stage: "state-registration",
    expectedOpcodeHex: "14000003",
    expectedTarget: 0xc809b8,
    evidence: "falls through to the final slot installer after materializing callback 0xc80b6c",
  },
  {
    address: 0xc809cc,
    role: "slot-installer-registers-final-callback",
    stage: "slot-installer",
    expectedOpcodeHex: "14302e4a",
    expectedTarget: slotInstallerAddress,
    evidence: "tail-calls the shared slot installer after selecting callback 0xc80b6c or 0xc80c9c",
  },
  {
    address: 0xc80c9c,
    role: "offset-2fc-state-machine-callback-entry",
    stage: "registered-callback",
    expectedOpcodeHex: "f81e0ff3",
    evidence: "registered callback entry selected by the final slot registration path",
  },
  {
    address: 0xc80cac,
    role: "offset-2fc-dispatch-call",
    stage: "registered-callback",
    expectedOpcodeHex: "940001a3",
    expectedTarget: offset2fcDispatchAddress,
    evidence: "the registered 0xc80c9c callback calls the +0x2fc state-machine dispatch",
  },
  {
    address: 0xc81338,
    role: "offset-2fc-state-machine-dispatch",
    stage: "offset-2fc-dispatch",
    expectedOpcodeHex: "a9bd57f6",
    evidence: "state-machine dispatch entry whose writer variants update object +0x2fc",
  },
  {
    address: 0xc80eec,
    role: "typed-query-output-array-stack-slot",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "9101c3e1",
    evidence: "passes sp+0x70 as the output array for the typed object query",
  },
  {
    address: 0xc80ef0,
    role: "typed-query-type-literal-0xc8",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "52801902",
    evidence: "loads query type literal 0xc8, matching the type global registered at 0x3034b10",
  },
  {
    address: 0xc80efc,
    role: "typed-query-calls-object-query-helper",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "940086ec",
    expectedTarget: 0xca2aac,
    evidence: "calls the current object query helper with type 0xc8 and output array sp+0x70",
  },
  {
    address: 0xc80f1c,
    role: "typed-query-result-entry-load",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "f87c7b68",
    evidence: "iterates the typed query output entries",
  },
  {
    address: 0xc80f20,
    role: "typed-query-entry-linked-list-load",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "f9400d08",
    evidence: "loads each query entry's linked child/list pointer from +0x18",
  },
  {
    address: 0xc80f2c,
    role: "typed-query-loads-global-type-index",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "b94b1129",
    evidence: "loads the registered 0x3034b10 type index before matching child records",
  },
  {
    address: 0xc80f30,
    role: "typed-query-child-type-record-pointer-load",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "f940050a",
    evidence: "loads the child record type descriptor pointer from linked entry +0x8",
  },
  {
    address: 0xc80f34,
    role: "typed-query-child-type-index-load",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "b940a54a",
    evidence: "loads the child type index from type descriptor +0xa4",
  },
  {
    address: 0xc80f38,
    role: "typed-query-compares-global-type-index",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "6b09015f",
    evidence: "compares the linked child type index against the recovered 0x3034b10 global",
  },
  {
    address: 0xc80f70,
    role: "typed-query-state-byte-load-bit0-path",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "3940012a",
    evidence: "loads a local state byte selected from the matched type-0xc8 record before setting bit 0",
  },
  {
    address: 0xc80f78,
    role: "typed-query-state-byte-store-bit0",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "3900012a",
    evidence: "stores the matched record state byte after setting bit 0",
  },
  {
    address: 0xc80f9c,
    role: "typed-query-state-byte-orr-bit2",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "321e014a",
    evidence: "sets bit 2 in the matched record state byte when the stack flag is present",
  },
  {
    address: 0xc80fa0,
    role: "typed-query-state-byte-store-bit2",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "3900c12a",
    evidence: "stores the matched record +0x30 byte after setting bit 2",
  },
  {
    address: 0xc80fc4,
    role: "typed-query-state-byte-orr-bit1-active-branch",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "321f0129",
    evidence: "sets bit 1 in the active branch selected by the runtime condition",
  },
  {
    address: 0xc80fc8,
    role: "typed-query-state-byte-store-bit1-active-branch",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "3900e109",
    evidence: "stores the active-branch state byte after setting bit 1",
  },
  {
    address: 0xc80fd4,
    role: "typed-query-state-byte-orr-bit1-default-branch",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "321f0129",
    evidence: "sets bit 1 in the default branch selected by the runtime condition",
  },
  {
    address: 0xc80fd8,
    role: "typed-query-state-byte-store-bit1-default-branch",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "3900c109",
    evidence: "stores the default-branch state byte after setting bit 1",
  },
  {
    address: 0xc810f4,
    role: "typed-query-post-distance-state-byte-orr-bit0",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "32000129",
    evidence: "sets bit 0 in a second state-byte path after runtime distance checks",
  },
  {
    address: 0xc810f8,
    role: "typed-query-state-byte-store-post-distance-bit0",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "39000109",
    evidence: "stores the post-distance state byte after setting bit 0",
  },
  {
    address: 0xc81128,
    role: "typed-query-state-byte-store-post-distance-bit2",
    stage: "typed-query-state-update",
    expectedOpcodeHex: "3900c109",
    evidence: "stores the post-distance +0x30 state byte after setting bit 2",
  },
];

const callbackSpecs = [
  {
    callbackAddress: 0xc809d0,
    callbackRole: "first-registered-state-callback",
    xrefAddress: 0xc80978,
    xrefExpectedOpcodeHex: "91274042",
    baseAddress: 0xc80974,
    baseExpectedOpcodeHex: "90000002",
    slotInstallerBranchAddress: 0xc80988,
    evidence: "first callback pointer materialized with ADRP+ADD before the first 0x188c2f4 slot-installer call",
  },
  {
    callbackAddress: 0xc80ae4,
    callbackRole: "second-registered-state-callback",
    xrefAddress: 0xc80990,
    xrefExpectedOpcodeHex: "912b9042",
    baseAddress: 0xc8098c,
    baseExpectedOpcodeHex: "90000002",
    slotInstallerBranchAddress: 0xc809a0,
    evidence: "second callback pointer materialized with ADRP+ADD before the second 0x188c2f4 slot-installer call",
  },
  {
    callbackAddress: 0xc80b6c,
    callbackRole: "third-registered-state-callback",
    xrefAddress: 0xc809a8,
    xrefExpectedOpcodeHex: "912db042",
    baseAddress: 0xc809a4,
    baseExpectedOpcodeHex: "90000002",
    slotInstallerBranchAddress: 0xc809cc,
    evidence: "third callback pointer materialized on the fast path before the final 0x188c2f4 slot-installer tail call",
  },
  {
    callbackAddress: 0xc80c9c,
    callbackRole: "offset-2fc-state-machine-callback",
    xrefAddress: 0xc809b4,
    xrefExpectedOpcodeHex: "91327042",
    baseAddress: 0xc809b0,
    baseExpectedOpcodeHex: "90000002",
    slotInstallerBranchAddress: 0xc809cc,
    evidence: "alternate final callback pointer; its body calls 0xc81338 at 0xc80cac",
  },
];

const stateFamilyRanges = [
  { name: "state-registration", start: 0xc80900, end: 0xc809d0 },
  { name: "registered-callback-first", start: 0xc809d0, end: 0xc80ae4 },
  { name: "registered-callback-second", start: 0xc80ae4, end: 0xc80b6c },
  { name: "registered-callback-third", start: 0xc80b6c, end: 0xc80c9c },
  { name: "registered-callback-offset-2fc", start: 0xc80c9c, end: 0xc80cc0 },
  { name: "typed-query-state-update-neighborhood", start: 0xc80eb0, end: 0xc81160 },
];

const renderBoundaryTargets = new Map([
  [0x18a2418, "render-queue-append"],
  [0x18a11e4, "composite-task-constructor"],
  [0x188e784, "entry-array-forwarder"],
  [0x188f03c, "entry-array-builder"],
  [0x188eee0, "manager-add-record"],
  [0x188f020, "manager-refresh-record"],
]);

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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

function instructionAt(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 4);
  return fileOffset >= 0 ? buffer.readUInt32LE(fileOffset) : null;
}

function signExtend(value, bits) {
  const sign = 1 << (bits - 1);
  return value & sign ? value - (1 << bits) : value;
}

function decodeDirectBranchTarget(address, instruction) {
  const opcode = (instruction & 0xfc000000) >>> 0;
  if (opcode !== 0x94000000 && opcode !== 0x14000000) return null;
  return address + signExtend(instruction & 0x03ffffff, 26) * 4;
}

function directBranchCallsInRange(buffer, elf, range) {
  const rows = [];
  for (let address = range.start; address < range.end; address += 4) {
    const instruction = instructionAt(buffer, elf, address);
    if (instruction === null) continue;
    const target = decodeDirectBranchTarget(address, instruction);
    if (target === null) continue;
    const opcode = (instruction & 0xfc000000) >>> 0;
    rows.push({
      itemKind: "state-family-direct-branch",
      range: range.name,
      address,
      addressHex: hex(address),
      mode: opcode === 0x94000000 ? "bl" : "b-tail",
      target,
      targetHex: hex(target),
      targetRole: renderBoundaryTargets.get(target) || "",
      instructionHex: instruction.toString(16).padStart(8, "0"),
      evidence: renderBoundaryTargets.has(target)
        ? "direct branch reaches a known particle/render manager boundary"
        : "direct branch remains inside non-render helper/control flow for this state-registration family",
      renderPromotionAllowed: false,
    });
  }
  return rows;
}

function checkedOpcode(buffer, elf, spec) {
  const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
  const instruction = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset) : null;
  const actualOpcodeHex = instruction !== null ? instruction.toString(16).padStart(8, "0") : "";
  const actualTarget = instruction !== null ? decodeDirectBranchTarget(spec.address, instruction) : null;
  return {
    itemKind: "opcode",
    address: spec.address,
    addressHex: hex(spec.address),
    role: spec.role,
    stage: spec.stage,
    expectedOpcodeHex: spec.expectedOpcodeHex,
    actualOpcodeHex,
    opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
    expectedTargetHex: hex(spec.expectedTarget),
    actualTargetHex: hex(actualTarget),
    branchTargetMatches: spec.expectedTarget ? actualTarget === spec.expectedTarget : true,
    evidence: spec.evidence,
    renderPromotionAllowed: false,
  };
}

function buildCallbackReferences(buffer, elf) {
  const specsByAddress = new Map(callbackSpecs.map((spec) => [spec.callbackAddress, spec]));
  const targets = callbackSpecs.map((spec) => ({
    name: spec.callbackRole,
    kind: "code-pointer",
    virtualAddress: spec.callbackAddress,
    section: ".text",
  }));
  return scanTextReferences(buffer, elf, targets)
    .sort((left, right) => left.xrefAddress - right.xrefAddress)
    .map((reference) => {
      const spec = specsByAddress.get(reference.targetAddress);
      return {
        itemKind: "callback-reference",
        callbackAddress: reference.targetAddress,
        callbackAddressHex: hex(reference.targetAddress),
        callbackRole: spec?.callbackRole || reference.targetName,
        xrefAddress: reference.xrefAddress,
        xrefAddressHex: hex(reference.xrefAddress),
        xrefExpectedOpcodeHex: spec?.xrefExpectedOpcodeHex || "",
        xrefActualOpcodeHex: reference.useInstructionHex,
        xrefOpcodeMatches: !spec || reference.useInstructionHex === spec.xrefExpectedOpcodeHex,
        baseAddress: reference.baseAddress,
        baseAddressHex: hex(reference.baseAddress),
        baseExpectedOpcodeHex: spec?.baseExpectedOpcodeHex || "",
        baseActualOpcodeHex: reference.baseInstructionHex,
        baseOpcodeMatches: !spec || reference.baseInstructionHex === spec.baseExpectedOpcodeHex,
        mode: reference.mode,
        slotInstallerBranchAddress: spec?.slotInstallerBranchAddress || null,
        slotInstallerBranchAddressHex: hex(spec?.slotInstallerBranchAddress),
        evidence: spec?.evidence || "",
        renderPromotionAllowed: false,
      };
    });
}

function typeGlobalContextRole(xrefAddress) {
  if (typeGlobalCreateResolveReadAddresses.has(xrefAddress)) return "create-resolve-read";
  if (typeGlobalStateCallbackNeighborhoodReadAddresses.has(xrefAddress)) return "state-callback-neighborhood-read";
  return "type-index-lookup-read";
}

function typeGlobalContextEvidence(contextRole) {
  if (contextRole === "create-resolve-read") {
    return "passes the recovered type index into shared create/resolve helper 0x188b8b8";
  }
  if (contextRole === "state-callback-neighborhood-read") {
    return "reads the same type index inside the current 0xc80d4c callback neighborhood before local state-byte edits";
  }
  return "compares an owner/list record type index against the recovered 0x3034b10 global; this is lookup evidence, not renderer submission";
}

function buildTypeGlobalReads(buffer, elf) {
  const targets = [
    {
      name: typeRecord.role,
      kind: "global",
      virtualAddress: typeRecord.globalAddress,
      section: ".bss",
    },
  ];
  return scanTextReferences(buffer, elf, targets)
    .sort((left, right) => left.xrefAddress - right.xrefAddress)
    .map((reference) => {
      const contextRole = typeGlobalContextRole(reference.xrefAddress);
      return {
        itemKind: "type-global-read",
        globalAddress: reference.targetAddress,
        globalAddressHex: hex(reference.targetAddress),
        globalRole: typeRecord.role,
        typeLiteral: typeRecord.typeLiteral,
        xrefAddress: reference.xrefAddress,
        xrefAddressHex: hex(reference.xrefAddress),
        mode: reference.mode,
        baseAddressHex: hex(reference.baseAddress),
        baseInstructionHex: reference.baseInstructionHex,
        useInstructionHex: reference.useInstructionHex,
        useRegister: reference.useRegister,
        contextRole,
        contextEvidence: typeGlobalContextEvidence(contextRole),
        renderPromotionAllowed: false,
      };
    });
}

function mapDirectCallers(rows) {
  return rows.map((row) => ({
    ...row,
    renderPromotionAllowed: false,
  }));
}

function buildCurrentNativeLayoutAStateRegistrationAudit({ binaryPath = defaultBinary } = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const opcodeItems = opcodeSpecs.map((spec) => checkedOpcode(buffer, elf, spec));
  const callbackReferences = buildCallbackReferences(buffer, elf);
  const typeGlobalReads = buildTypeGlobalReads(buffer, elf);
  const moduleRegistrationCallers = mapDirectCallers(findDirectBranchCallers(buffer, elf, stateRegistrationAddress));
  const typedQueryOpcodeRows = opcodeItems.filter((row) => row.stage === "typed-query-state-update");
  const stateFamilyDirectBranchCalls = stateFamilyRanges.flatMap((range) => directBranchCallsInRange(buffer, elf, range));
  const stateFamilyDirectRenderBoundaryCalls = stateFamilyDirectBranchCalls.filter((row) => row.targetRole);
  const offset2fcDirectCallers = findDirectBranchCallers(buffer, elf, offset2fcDispatchAddress);
  const offset2fcDispatchCalls = offset2fcDirectCallers.map((row) => ({
    address: row.callerAddress,
    addressHex: row.callerAddressHex,
    mode: row.mode,
    instructionHex: row.instructionHex,
    targetAddressHex: hex(offset2fcDispatchAddress),
    renderPromotionAllowed: false,
  }));
  const callbackReferenceMismatchRows = callbackReferences.filter((row) => !row.xrefOpcodeMatches || !row.baseOpcodeMatches).length;
  const opcodeMismatchRows = opcodeItems.filter((row) => !row.opcodeMatches || !row.branchTargetMatches).length;
  const summary = {
    moduleRegistrationCallerRows: moduleRegistrationCallers.length,
    typeSetupGuardCallRows: opcodeItems.filter((row) => row.role === "type-setup-guard-call").length,
    slotInstallerBranchRows: opcodeItems.filter((row) => row.stage === "slot-installer").length,
    callbackReferenceRows: callbackReferences.length,
    callbackReferenceMismatchRows,
    stateMachineCallbackReferenceRows: callbackReferences.filter(
      (row) => row.callbackRole === "offset-2fc-state-machine-callback",
    ).length,
    offset2fcDispatchCallRows: offset2fcDispatchCalls.length,
    typeGlobalReadRows: typeGlobalReads.length,
    typeGlobalCreateResolveReadRows: typeGlobalReads.filter((row) => row.contextRole === "create-resolve-read").length,
    typeGlobalStateCallbackNeighborhoodReadRows: typeGlobalReads.filter(
      (row) => row.contextRole === "state-callback-neighborhood-read",
    ).length,
    typedQueryEvidenceRows: typedQueryOpcodeRows.length,
    typedQueryTypeLiteralRows: typedQueryOpcodeRows.filter((row) => row.role === "typed-query-type-literal-0xc8").length,
    typedQueryCallRows: typedQueryOpcodeRows.filter((row) => row.role === "typed-query-calls-object-query-helper").length,
    typedQueryTypeGlobalCompareRows: typedQueryOpcodeRows.filter(
      (row) => row.role === "typed-query-compares-global-type-index",
    ).length,
    typedQueryStateByteWriteRows: typedQueryOpcodeRows.filter((row) => row.role.includes("state-byte-store")).length,
    stateFamilyDirectBranchCallRows: stateFamilyDirectBranchCalls.length,
    stateFamilyDirectRenderBoundaryCallRows: stateFamilyDirectRenderBoundaryCalls.length,
    opcodeRows: opcodeItems.length,
    opcodeMismatchRows,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt: new Date().toISOString(),
    binaryPath,
    policy:
      "diagnostic-only layout A state callback registration evidence; callback registration proves state-machine provenance, not particle draw permission or shader runtime semantics",
    summary,
    interpretation: {
      registration:
        "The current module registration hub calls 0xc80900 once. That function materializes four .text callback pointers and installs them through the shared 0x188c2f4 slot installer.",
      typeRecord:
        "The same registration function assigns type literal 0xc8, writes the type index to global 0x3034b10, and stores local type-record callbacks 0xc8191c/0xc81968.",
      stateCallback:
        "The final alternate callback 0xc80c9c contains the 0xc80cac call into 0xc81338, which is the already recovered +0x2fc state-machine dispatch.",
      typedQuery:
        "The 0xc80ef0 block queries objects by type 0xc8 through 0xca2aac, walks linked child records, compares child type +0xa4 against global 0x3034b10, and writes local state bytes. This is state propagation evidence, not particle draw submission.",
      boundary:
        "The callbacks are reached by function-pointer registration, so they have no normal direct BL callers. The scanned state-registration family has no direct branch to the known particle queue, composite task, entry-array builder, manager add-record, or manager refresh boundaries.",
    },
    unresolved: [
      "the semantic type/action name represented by the 0xc80900 registration function",
      "the slot names installed by shared installer 0x188c2f4",
      "the runtime owner path that decides when the 0xc80c9c callback should run",
      "whether any +0x2fc state result reaches a particle draw manager or only toggles non-render state",
    ],
    typeRecord,
    typeGlobalReads,
    moduleRegistrationCallers,
    slotInstallerBranches: opcodeItems.filter((row) => row.stage === "slot-installer"),
    typedQueryOpcodeRows,
    stateFamilyDirectBranchCalls,
    stateFamilyDirectRenderBoundaryCalls,
    callbackReferences,
    offset2fcDispatchCalls,
    items: [...opcodeItems, ...callbackReferences, ...typeGlobalReads, ...stateFamilyDirectBranchCalls],
  };
}

function exportCurrentNativeLayoutAStateRegistrationAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutAStateRegistrationAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "itemKind",
    "addressHex",
    "callbackAddressHex",
    "role",
    "callbackRole",
    "stage",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "expectedTargetHex",
    "actualTargetHex",
    "branchTargetMatches",
    "range",
    "targetHex",
    "targetRole",
    "instructionHex",
    "globalAddressHex",
    "globalRole",
    "typeLiteral",
    "xrefAddressHex",
    "xrefExpectedOpcodeHex",
    "xrefActualOpcodeHex",
    "xrefOpcodeMatches",
    "baseAddressHex",
    "baseExpectedOpcodeHex",
    "baseActualOpcodeHex",
    "baseOpcodeMatches",
    "baseInstructionHex",
    "useInstructionHex",
    "useRegister",
    "slotInstallerBranchAddressHex",
    "contextRole",
    "contextEvidence",
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutAStateRegistrationAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutAStateRegistrationAudit,
  exportCurrentNativeLayoutAStateRegistrationAudit,
};
