#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");
const { findDirectBranchCallers } = require("./current_native_light_probe_chain_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-levelvisuals-schema-audit.json";
const defaultJsonOut = "extracted/reports/current_native_levelvisuals_schema_audit.json";
const defaultTsvOut = "extracted/reports/current_native_levelvisuals_schema_audit.tsv";

const typeRegistryAddress = 0x189021c;
const levelRegistrationAddress = 0x7cd9e0;
const levelFieldInitAddress = 0x7cd7c0;
const levelTypeObjectAddress = 0x3047e90;
const levelFieldTableStart = 0x30506e0;
const levelFieldTableEnd = 0x3050858;
const levelVisualsRefFieldInitAddress = 0x7cc00c;
const levelVisualsRefRegistrationAddress = 0x7cc054;
const levelVisualsRefTypeObjectAddress = 0x3047a80;
const levelVisualsRefPointerTypeObjectAddress = 0x3047aa0;
const levelVisualsRefPointerPointerTypeObjectAddress = 0x3047ab8;
const levelVisualsRefFieldTableStart = 0x304ff78;
const levelVisualsRefFieldCountAddress = 0x304ff90;
const levelVisualsRegistrationAddress = 0x7ced14;
const levelVisualsFieldInitAddress = 0x7cebe0;
const levelVisualsTypeObjectAddress = 0x30481b0;
const levelVisualsFieldTableStart = 0x3050da0;
const levelVisualsFieldTableEnd = 0x3050e68;
const positionSampleUploadAddress = 0xe36efc;
const profilePayloadLoadAddress = 0xe36f38;
const levelVisualsRuntimeVtableBase = 0x26c8a40;
const levelVisualsRuntimeVtablePrimary = 0x26c8a50;
const levelRuntimeVisualsLoaderSlot = 0x26c8a70;
const levelRuntimeTailLoaderSlot = 0x26c8aa8;
const levelVisualsConstructorAddress = 0x8cbe40;
const levelVisualsDestructorAddress = 0x8cbe98;
const levelRuntimeModuleRegistrationAddress = 0x8cbedc;
const levelRuntimeVisualsLoaderAddress = 0x8cbf40;
const levelRuntimeTailLoaderThunkAddress = 0x8cc63c;
const levelRuntimeVisualsLoaderToApplyCallsite = 0x8cc02c;
const levelRuntimeVisualsRefPrepareCallsite = 0x8cbfd4;
const levelRuntimeVisualsRefReadCallsite = 0x8cbfdc;
const levelRuntimeVisualsRefResolveCallsite = 0x8cbfe0;
const levelRuntimeLevelVisualsObjectQueryCallsite = 0x8cbffc;
const levelRuntimeLevelVisualsTypeCheckCallsite = 0x8cc010;
const levelVisualsApplyProcessorAddress = 0x8cc27c;
const levelVisualsProfilePayloadLoadCallsite = 0x8cc568;
const levelVisualsRefResourcePrepareAddress = 0xc72dbc;
const levelVisualsRefResourceResolveAddress = 0xc72dc8;
const levelVisualsObjectQueryAddress = 0x188e540;
const levelVisualsObjectKindIndexAddress = 0x30350a8;
const kindredLensFlaresStringAddress = 0x1a9d908;

const levelFieldStores = [
  { fieldIndex: 0, fieldOffset: 0x0, typeAddressSource: "double-indirect-got", dataAddress: 0x2ae0570, storeOffset: 0x8, inferredRole: "raw/name-or-id-string" },
  { fieldIndex: 1, fieldOffset: 0x8, typeAddressSource: "direct-data", dataAddress: 0x2aefea8, storeOffset: 0x18, inferredRole: "unknown-level-field" },
  { fieldIndex: 2, fieldOffset: 0x10, typeAddressSource: "direct-data", dataAddress: 0x2af0bd0, storeOffset: 0x28, inferredRole: "LevelVisualsRef list consumed by 0x8cbf40" },
  { fieldIndex: 3, fieldOffset: 0x18, typeAddressSource: "direct-data", dataAddress: 0x2af0ba8, storeOffset: 0x38, inferredRole: "unknown-level-field" },
  { fieldIndex: 4, fieldOffset: 0xc0, typeAddressSource: "direct-data", dataAddress: 0x2af0b18, storeOffset: 0x48, inferredRole: "unknown-level-field" },
  { fieldIndex: 5, fieldOffset: 0xd8, typeAddressSource: "direct-data", dataAddress: 0x2af09f8, storeOffset: 0x58, inferredRole: "unknown-level-field" },
  { fieldIndex: 6, fieldOffset: 0xe8, typeAddressSource: "direct-data", dataAddress: 0x2af05f0, storeOffset: 0x68, inferredRole: "unknown-level-field" },
  { fieldIndex: 7, fieldOffset: 0x108, typeAddressSource: "direct-data", dataAddress: 0x2af05c0, storeOffset: 0x78, inferredRole: "unknown-level-field" },
  { fieldIndex: 8, fieldOffset: 0x120, typeAddressSource: "double-indirect-got", dataAddress: 0x2ae0570, storeOffset: 0x88, inferredRole: "raw/string slot" },
  { fieldIndex: 9, fieldOffset: 0x128, typeAddressSource: "double-indirect-got", dataAddress: 0x2ae0570, storeOffset: 0x98, inferredRole: "raw/string slot" },
  { fieldIndex: 10, fieldOffset: 0x130, typeAddressSource: "double-indirect-got", dataAddress: 0x2ae0570, storeOffset: 0xa8, inferredRole: "raw/string slot" },
  { fieldIndex: 11, fieldOffset: 0x138, typeAddressSource: "double-indirect-got", dataAddress: 0x2ae0570, storeOffset: 0xb8, inferredRole: "setup field mapper slot 0" },
  { fieldIndex: 12, fieldOffset: 0x140, typeAddressSource: "double-indirect-got", dataAddress: 0x2ae0570, storeOffset: 0xc8, inferredRole: "setup field mapper slot 3" },
  { fieldIndex: 13, fieldOffset: 0x148, typeAddressSource: "double-indirect-got", dataAddress: 0x2ae0570, storeOffset: 0xd8, inferredRole: "setup field mapper slot 2" },
  { fieldIndex: 14, fieldOffset: 0x150, typeAddressSource: "double-indirect-got", dataAddress: 0x2ae0570, storeOffset: 0xe8, inferredRole: "setup field mapper slot 1" },
  { fieldIndex: 15, fieldOffset: 0x158, typeAddressSource: "direct-data", dataAddress: 0x2af0cf0, storeOffset: 0xf8, inferredRole: "secondary callback payload dispatched inside 0xc79ad4" },
  { fieldIndex: 16, fieldOffset: 0x160, typeAddressSource: "direct-data", dataAddress: 0x2af04c8, storeOffset: 0x108, inferredRole: "primary per-entry handler list" },
  { fieldIndex: 17, fieldOffset: 0x168, typeAddressSource: "direct-data", dataAddress: 0x2af0870, storeOffset: 0x118, inferredRole: "unknown-level-field" },
  { fieldIndex: 18, fieldOffset: 0x170, typeAddressSource: "direct-data", dataAddress: 0x2af03d8, storeOffset: 0x128, inferredRole: "visuals loader lookup state" },
  { fieldIndex: 19, fieldOffset: 0x178, typeAddressSource: "direct-data", dataAddress: 0x2af0888, storeOffset: 0x138, inferredRole: "post-setup finalizer list" },
  { fieldIndex: 20, fieldOffset: 0x180, typeAddressSource: "direct-data", dataAddress: 0x2af08d0, storeOffset: 0x148, inferredRole: "unknown-level-field" },
  { fieldIndex: 21, fieldOffset: 0x188, typeAddressSource: "direct-data", dataAddress: 0x2af00c0, storeOffset: 0x158, inferredRole: "registered cleanup/scan callback list" },
  { fieldIndex: 22, fieldOffset: 0x190, typeAddressSource: "direct-data", dataAddress: 0x2af0648, storeOffset: 0x168, inferredRole: "conditional per-entry handler list" },
];

const levelVisualsRefFieldStores = [
  { fieldIndex: 0, fieldOffset: 0x0, typeAddressSource: "double-indirect-got", dataAddress: 0x2ae0570, storeOffset: 0x8, inferredRole: "raw LevelVisuals resource key string consumed by 0x8cbf40" },
];

const levelVisualsFieldStores = [
  { fieldIndex: 0, fieldOffset: 0x0, typeAddressSource: "direct-data", dataAddress: 0x2af02b8, storeOffset: 0x8 },
  { fieldIndex: 1, fieldOffset: 0x8, typeAddressSource: "direct-data", dataAddress: 0x2af0ac8, storeOffset: 0x18 },
  { fieldIndex: 2, fieldOffset: 0x10, typeAddressSource: "direct-data", dataAddress: 0x2af0ac8, storeOffset: 0x28 },
  { fieldIndex: 3, fieldOffset: 0x18, typeAddressSource: "direct-data", dataAddress: 0x2af0ac8, storeOffset: 0x38 },
  { fieldIndex: 4, fieldOffset: 0x20, typeAddressSource: "direct-data", dataAddress: 0x2af0de0, storeOffset: 0x48 },
  { fieldIndex: 5, fieldOffset: 0x28, typeAddressSource: "direct-data", dataAddress: 0x2af0de0, storeOffset: 0x58 },
  { fieldIndex: 6, fieldOffset: 0x30, typeAddressSource: "direct-data", dataAddress: 0x2af0de0, storeOffset: 0x68 },
  { fieldIndex: 7, fieldOffset: 0x38, typeAddressSource: "direct-data", dataAddress: 0x2af0510, storeOffset: 0x78 },
  { fieldIndex: 8, fieldOffset: 0x40, typeAddressSource: "direct-data", dataAddress: 0x2af0408, storeOffset: 0x88 },
  { fieldIndex: 9, fieldOffset: 0x48, typeAddressSource: "double-indirect-got", dataAddress: 0x2ae29a8, storeOffset: 0x98 },
  { fieldIndex: 10, fieldOffset: 0x50, typeAddressSource: "double-indirect-got", dataAddress: 0x2ae0570, storeOffset: 0xa8 },
  { fieldIndex: 11, fieldOffset: 0x58, typeAddressSource: "direct-data", dataAddress: 0x2af0b40, storeOffset: 0xb8 },
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

function sectionForVirtualAddress(sections, virtualAddress) {
  return (
    sections.find((section) => {
      if (!section.size) return false;
      return virtualAddress >= section.virtualAddress && virtualAddress < section.virtualAddress + section.size;
    }) || null
  );
}

function readU64(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf.loads, virtualAddress, 8);
  if (fileOffset < 0) return null;
  return Number(buffer.readBigUInt64LE(fileOffset));
}

function readCStringAtVirtualAddress(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf.loads, virtualAddress);
  if (fileOffset < 0) return "";
  const section = sectionForVirtualAddress(elf.sections, virtualAddress);
  if (section?.name !== ".rodata") return "";
  let end = fileOffset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  const value = buffer.subarray(fileOffset, end).toString("utf8");
  return /^[\x20-\x7e]+$/.test(value) ? value.slice(0, 180) : "";
}

function parseAdrp(instruction, pc) {
  if (((instruction & 0x9f000000) >>> 0) !== 0x90000000) return null;
  const immlo = (instruction >>> 29) & 0x3;
  const immhi = (instruction >>> 5) & 0x7ffff;
  const signed = signExtend((immhi << 2) | immlo, 21);
  return {
    register: instruction & 0x1f,
    value: (pc & ~0xfff) + signed * 0x1000,
  };
}

function parseAddImmediate(instruction) {
  if (((instruction & 0xff000000) >>> 0) !== 0x91000000) return null;
  const shift = ((instruction >>> 22) & 0x3) === 1 ? 12 : 0;
  return {
    destination: instruction & 0x1f,
    source: (instruction >>> 5) & 0x1f,
    immediate: ((instruction >>> 10) & 0xfff) << shift,
  };
}

function parseMovRegister(instruction) {
  if (((instruction & 0xffe0ffe0) >>> 0) !== 0xaa0003e0) return null;
  if (((instruction >>> 5) & 0x1f) !== 0x1f) return null;
  return {
    destination: instruction & 0x1f,
    source: (instruction >>> 16) & 0x1f,
  };
}

function simulateRegistersBefore(buffer, elf, targetAddress, windowBytes = 0x100) {
  const registers = new Array(32).fill(null);
  const start = targetAddress - windowBytes;
  for (let address = start; address < targetAddress; address += 4) {
    const fileOffset = fileOffsetForVirtualAddress(elf.loads, address, 4);
    if (fileOffset < 0) continue;
    const instruction = buffer.readUInt32LE(fileOffset);
    const adrp = parseAdrp(instruction, address);
    if (adrp) {
      registers[adrp.register] = adrp.value;
      continue;
    }
    const add = parseAddImmediate(instruction);
    if (add && registers[add.source] != null) {
      registers[add.destination] = registers[add.source] + add.immediate;
      continue;
    }
    const move = parseMovRegister(instruction);
    if (move && registers[move.source] != null) {
      registers[move.destination] = registers[move.source];
    }
  }
  return registers;
}

function buildCurrentTypeRegistrations(buffer, elf) {
  const rows = [];
  for (const caller of findDirectBranchCallers(buffer, elf, typeRegistryAddress)) {
    const registers = simulateRegistersBefore(buffer, elf, caller.callerAddress);
    const typeObjectAddress = registers[0];
    const nameAddress = registers[2];
    const typeName = readCStringAtVirtualAddress(buffer, elf, nameAddress);
    if (!typeObjectAddress || !typeName) continue;
    rows.push({
      registrationCallAddress: caller.callerAddress,
      registrationCallAddressHex: hex(caller.callerAddress),
      typeObjectAddress,
      typeObjectAddressHex: hex(typeObjectAddress),
      typeObjectSection: sectionForVirtualAddress(elf.sections, typeObjectAddress)?.name || "",
      typeName,
      nameAddressHex: hex(nameAddress),
    });
  }
  return rows;
}

function resolveTypeAddress(buffer, elf, store) {
  const first = readU64(buffer, elf, store.dataAddress);
  const second = first == null ? null : readU64(buffer, elf, first);
  const typeObjectAddress = store.typeAddressSource === "double-indirect-got" ? second : first;
  return {
    dataAddressHex: hex(store.dataAddress),
    dataSection: sectionForVirtualAddress(elf.sections, store.dataAddress)?.name || "",
    firstValueHex: hex(first),
    firstValueSection: sectionForVirtualAddress(elf.sections, first)?.name || "",
    secondValueHex: hex(second),
    secondValueSection: sectionForVirtualAddress(elf.sections, second)?.name || "",
    typeObjectAddress,
    typeObjectAddressHex: hex(typeObjectAddress),
    typeObjectSection: sectionForVirtualAddress(elf.sections, typeObjectAddress)?.name || "",
  };
}

function disassemblyEvidenceForPositionSampleUpload(buffer, elf) {
  return findDirectBranchCallers(buffer, elf, positionSampleUploadAddress).map((caller) => ({
    callerAddress: caller.callerAddress,
    callerAddressHex: caller.callerAddressHex,
    mode: caller.mode,
    evidence:
      caller.callerAddress === 0x1891cb8 || caller.callerAddress === 0x18934f4
        ? "caller packs a 12-byte vec3-like position record from object +0x50/+0x58 into stack memory, passes it as the sampler position, and calls current scene-probe position sample/upload entry 0xe36efc"
        : "direct current-binary caller of scene-probe position sample/upload entry",
  }));
}

function u64References(buffer, elf, value) {
  const needle = Buffer.alloc(8);
  needle.writeBigUInt64LE(BigInt(value), 0);
  const references = [];
  let fileOffset = buffer.indexOf(needle);
  while (fileOffset >= 0) {
    const virtualAddress = virtualAddressForFileOffset(elf.loads, fileOffset);
    references.push({
      virtualAddress,
      virtualAddressHex: hex(virtualAddress),
      section: sectionForVirtualAddress(elf.sections, virtualAddress)?.name || "",
    });
    fileOffset = buffer.indexOf(needle, fileOffset + 1);
  }
  return references;
}

function codePointer(buffer, elf, virtualAddress) {
  const value = readU64(buffer, elf, virtualAddress);
  return {
    slotAddress: virtualAddress,
    slotAddressHex: hex(virtualAddress),
    value,
    valueHex: hex(value),
    section: sectionForVirtualAddress(elf.sections, value)?.name || "",
  };
}

function buildRuntimeProcessorEvidence(buffer, elf) {
  const loaderRefs = u64References(buffer, elf, levelRuntimeVisualsLoaderAddress);
  const loaderCallers = findDirectBranchCallers(buffer, elf, levelRuntimeVisualsLoaderAddress);
  const applyCallers = findDirectBranchCallers(buffer, elf, levelVisualsApplyProcessorAddress);
  const profilePayloadLoadCallers = findDirectBranchCallers(buffer, elf, profilePayloadLoadAddress);
  const lensFlareString = readCStringAtVirtualAddress(buffer, elf, kindredLensFlaresStringAddress);
  return {
    addresses: {
      levelVisualsRuntimeVtableBase: hex(levelVisualsRuntimeVtableBase),
      levelVisualsRuntimeVtablePrimary: hex(levelVisualsRuntimeVtablePrimary),
      levelRuntimeVisualsLoaderSlot: hex(levelRuntimeVisualsLoaderSlot),
      levelRuntimeTailLoaderSlot: hex(levelRuntimeTailLoaderSlot),
      levelVisualsConstructor: hex(levelVisualsConstructorAddress),
      levelVisualsDestructor: hex(levelVisualsDestructorAddress),
      levelRuntimeModuleRegistration: hex(levelRuntimeModuleRegistrationAddress),
      levelRuntimeVisualsLoader: hex(levelRuntimeVisualsLoaderAddress),
      levelRuntimeTailLoaderThunk: hex(levelRuntimeTailLoaderThunkAddress),
      levelRuntimeVisualsLoaderToApplyCallsite: hex(levelRuntimeVisualsLoaderToApplyCallsite),
      levelRuntimeVisualsRefPrepareCallsite: hex(levelRuntimeVisualsRefPrepareCallsite),
      levelRuntimeVisualsRefReadCallsite: hex(levelRuntimeVisualsRefReadCallsite),
      levelRuntimeVisualsRefResolveCallsite: hex(levelRuntimeVisualsRefResolveCallsite),
      levelRuntimeLevelVisualsObjectQueryCallsite: hex(levelRuntimeLevelVisualsObjectQueryCallsite),
      levelRuntimeLevelVisualsTypeCheckCallsite: hex(levelRuntimeLevelVisualsTypeCheckCallsite),
      levelVisualsApplyProcessor: hex(levelVisualsApplyProcessorAddress),
      levelVisualsProfilePayloadLoadCallsite: hex(levelVisualsProfilePayloadLoadCallsite),
      levelVisualsRefResourcePrepare: hex(levelVisualsRefResourcePrepareAddress),
      levelVisualsRefResourceResolve: hex(levelVisualsRefResourceResolveAddress),
      levelVisualsObjectQuery: hex(levelVisualsObjectQueryAddress),
      levelVisualsObjectKindIndex: hex(levelVisualsObjectKindIndexAddress),
      sceneProbeProfilePayloadLoad: hex(profilePayloadLoadAddress),
      kindredLensFlaresString: hex(kindredLensFlaresStringAddress),
    },
    vtableSlots: [
      codePointer(buffer, elf, levelVisualsRuntimeVtablePrimary),
      codePointer(buffer, elf, levelRuntimeVisualsLoaderSlot),
      codePointer(buffer, elf, levelRuntimeTailLoaderSlot),
    ],
    levelRuntimeLoaderReferences: loaderRefs.map((reference) => ({
      virtualAddress: reference.virtualAddressHex,
      section: reference.section,
    })),
    levelRuntimeLoaderDirectCallers: loaderCallers.map((caller) => ({
      callerAddress: caller.callerAddressHex,
      mode: caller.mode,
    })),
    levelVisualsApplyProcessorDirectCallers: applyCallers.map((caller) => ({
      callerAddress: caller.callerAddressHex,
      mode: caller.mode,
      role:
        caller.callerAddress === levelRuntimeVisualsLoaderToApplyCallsite
          ? "level-runtime-loader-resolved-visuals-to-levelvisuals-apply"
          : "other-levelvisuals-apply-caller",
    })),
    profilePayloadLoadDirectCallers: profilePayloadLoadCallers.map((caller) => ({
      callerAddress: caller.callerAddressHex,
      mode: caller.mode,
      role:
        caller.callerAddress === levelVisualsProfilePayloadLoadCallsite
          ? "levelvisuals-profile-string-to-scene-probe-profile-payload-load"
          : "other-scene-probe-profile-payload-load-caller",
    })),
    fieldAccessEvidence: [
      "0x8cbf40 is the current Level runtime visuals loader: it stores the active Level at owner +0x30, reads Level +0x170 for local lookup state, then iterates Level +0x10 visuals references.",
      "For each Level +0x10 entry, 0x8cbf40 reads LevelVisualsRef +0x0 as a char* resource key at 0x8cbfdc, resolves it through 0xc72dbc/0xc72dc8, queries an object through 0x188e540, checks kind index 0x30350a8, and only then calls 0x8cc27c at 0x8cc02c with the resolved LevelVisuals object plus the accumulated lookup state.",
      "0x8cc27c reads LevelVisuals object lists at +0x10/+0x18/+0x20/+0x28/+0x30 and dispatches mesh/PFX handlers.",
      "0x8cc27c reads +0x38/+0x40 and dispatches sound-related handlers.",
      "0x8cc27c reads +0x58 and resolves *KindredLensFlares* before processing StaticLensFlare records.",
      "0x8cc27c reads +0x50, converts the char* profile payload through string helpers, then calls 0xe36f38 at 0x8cc568.",
      "0xe36f38 forwards through the scene/probe inner service vtable +0x40, so this is profile/lightfield payload loading evidence, not final Probe.Samples position sampling.",
    ],
    levelVisualsRefLoaderEvidence: {
      refListSource: "Level +0x10",
      refFieldRead: {
        callsite: hex(levelRuntimeVisualsRefReadCallsite),
        instruction: "ldr x1, [x8]",
        meaning: "x8 is the current LevelVisualsRef entry, so x1 receives LevelVisualsRef +0x0 char*",
      },
      resourceResolution: [
        {
          callsite: hex(levelRuntimeVisualsRefPrepareCallsite),
          callee: hex(levelVisualsRefResourcePrepareAddress),
          meaning: "prepare or select the resource-key table before reading the ref key",
        },
        {
          callsite: hex(levelRuntimeVisualsRefResolveCallsite),
          callee: hex(levelVisualsRefResourceResolveAddress),
          meaning: "resolve the LevelVisualsRef +0x0 char* key into a runtime resource/object handle",
        },
      ],
      levelVisualsObjectMaterialization: {
        queryCallsite: hex(levelRuntimeLevelVisualsObjectQueryCallsite),
        queryCallee: hex(levelVisualsObjectQueryAddress),
        expectedKindIndexAddress: hex(levelVisualsObjectKindIndexAddress),
        typeCheckCallsite: hex(levelRuntimeLevelVisualsTypeCheckCallsite),
        meaning: "the resolved resource is queried and checked against the LevelVisuals runtime kind before the apply processor receives it",
      },
    },
    resourceStrings: [{ address: hex(kindredLensFlaresStringAddress), value: lensFlareString }],
    interpretation:
      "Current-binary runtime evidence now separates the Level loader from the LevelVisuals apply processor: 0x8cbf40 walks Level +0x10 LevelVisualsRef entries, reads each ref +0x0 char* key, resolves the key through the resource table, type-checks the resolved object as LevelVisuals, and calls 0x8cc27c. 0x8cc27c handles the confirmed LevelVisuals field layout and sends +0x50 into the scene/probe profile/lightfield payload load entry at 0xe36f38. This still does not prove which LevelVisuals instance is active for hero/model preview or which world/model position is later sampled.",
  };
}

function buildManifest({ binaryPath = defaultBinary } = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const registrations = buildCurrentTypeRegistrations(buffer, elf);
  const registrationsByAddress = new Map(registrations.map((registration) => [registration.typeObjectAddress, registration]));
  const buildFields = (stores, finalOffset, tableStart) =>
    stores.map((store, index, allStores) => {
      const resolved = resolveTypeAddress(buffer, elf, store);
      const registration = registrationsByAddress.get(resolved.typeObjectAddress) || null;
      const nextFieldOffset = allStores[index + 1]?.fieldOffset ?? finalOffset;
      return {
        fieldIndex: store.fieldIndex,
        fieldOffset: store.fieldOffset,
        fieldOffsetHex: hex(store.fieldOffset),
        nextFieldOffset,
        nextFieldOffsetHex: hex(nextFieldOffset),
        fieldSpan: nextFieldOffset - store.fieldOffset,
        fieldSpanHex: hex(nextFieldOffset - store.fieldOffset),
        descriptorAddress: tableStart + store.fieldIndex * 0x10,
        descriptorAddressHex: hex(tableStart + store.fieldIndex * 0x10),
        descriptorTypePointerStoreOffsetHex: hex(store.storeOffset),
        typeAddressSource: store.typeAddressSource,
        inferredRole: store.inferredRole || "",
        ...resolved,
        typeName: registration?.typeName || "",
        registrationCallAddressHex: registration?.registrationCallAddressHex || "",
      };
    });
  const levelVisualsRefFields = buildFields(levelVisualsRefFieldStores, 0x8, levelVisualsRefFieldTableStart);
  const levelVisualsRefKeyField = levelVisualsRefFields.find((field) => field.fieldOffset === 0x0);
  const levelFields = buildFields(levelFieldStores, 0x198, levelFieldTableStart);
  const fields = levelVisualsFieldStores.map((store, index, stores) => {
    const resolved = resolveTypeAddress(buffer, elf, store);
    const registration = registrationsByAddress.get(resolved.typeObjectAddress) || null;
    const nextFieldOffset = stores[index + 1]?.fieldOffset ?? 0x60;
    return {
      fieldIndex: store.fieldIndex,
      fieldOffset: store.fieldOffset,
      fieldOffsetHex: hex(store.fieldOffset),
      nextFieldOffset,
      nextFieldOffsetHex: hex(nextFieldOffset),
      fieldSpan: nextFieldOffset - store.fieldOffset,
      fieldSpanHex: hex(nextFieldOffset - store.fieldOffset),
      descriptorAddress: levelVisualsFieldTableStart + store.fieldIndex * 0x10,
      descriptorAddressHex: hex(levelVisualsFieldTableStart + store.fieldIndex * 0x10),
      descriptorTypePointerStoreOffsetHex: hex(store.storeOffset),
      typeAddressSource: store.typeAddressSource,
      ...resolved,
      typeName: registration?.typeName || "",
      registrationCallAddressHex: registration?.registrationCallAddressHex || "",
    };
  });
  const positionSampleUploadCallers = disassemblyEvidenceForPositionSampleUpload(buffer, elf);
  const runtimeProcessor = buildRuntimeProcessorEvidence(buffer, elf);
  const profileField = fields.find((field) => field.fieldOffset === 0x50);
  const lightPlacementField = fields.find((field) => field.fieldOffset === 0x48);
  const lensFlareField = fields.find((field) => field.fieldOffset === 0x58);
  const summary = {
    typeRegistrations: registrations.length,
    levelVisualsRefFields: levelVisualsRefFields.length,
    levelVisualsRefFieldCountIncrement: 1,
    currentLevelVisualsRefTypeConfirmed:
      registrationsByAddress.get(levelVisualsRefTypeObjectAddress)?.typeName === "LevelVisualsRef",
    currentLevelVisualsRefPointerTypeConfirmed:
      registrationsByAddress.get(levelVisualsRefPointerTypeObjectAddress)?.typeName === "LevelVisualsRef*",
    currentLevelVisualsRefPointerPointerTypeConfirmed:
      registrationsByAddress.get(levelVisualsRefPointerPointerTypeObjectAddress)?.typeName === "LevelVisualsRef**",
    levelVisualsRefKeyFieldConfirmedAsCharPointer: levelVisualsRefKeyField?.typeName === "char*",
    levelFields: levelFields.length,
    levelFieldCountIncrement: 23,
    currentLevelTypeConfirmed: registrationsByAddress.get(levelTypeObjectAddress)?.typeName === "Level",
    levelFieldOffsetsRecovered:
      levelFields.length === 23 &&
      levelFields[0]?.fieldOffset === 0x0 &&
      levelFields[2]?.fieldOffset === 0x10 &&
      levelFields[15]?.fieldOffset === 0x158 &&
      levelFields[22]?.fieldOffset === 0x190,
    levelCriticalFieldOffsets: levelFields
      .filter((field) => [0x10, 0x138, 0x140, 0x148, 0x150, 0x158, 0x160, 0x170, 0x178, 0x188, 0x190].includes(field.fieldOffset))
      .map((field) => ({
        fieldIndex: field.fieldIndex,
        fieldOffset: field.fieldOffsetHex,
        inferredRole: field.inferredRole,
        typeName: field.typeName,
      })),
    levelVisualsFields: fields.length,
    levelVisualsFieldCountIncrement: 12,
    currentLevelVisualsTypeConfirmed: registrationsByAddress.get(levelVisualsTypeObjectAddress)?.typeName === "LevelVisuals",
    currentLightPlacementFieldType: lightPlacementField?.typeName || "",
    currentProfilePayloadFieldType: profileField?.typeName || "",
    currentLensFlareFieldType: lensFlareField?.typeName || "",
    positionSampleUploadDirectCallers: positionSampleUploadCallers.length,
    sceneProbeProfilePayloadLoadDirectCallers: runtimeProcessor.profilePayloadLoadDirectCallers.length,
    levelVisualsProfileFieldConfirmedAsCharPointer: profileField?.typeName === "char*",
    levelRuntimeLoaderResolvesLevelVisualsRefKey:
      levelVisualsRefKeyField?.typeName === "char*" &&
      runtimeProcessor.levelVisualsRefLoaderEvidence?.refFieldRead?.callsite === hex(levelRuntimeVisualsRefReadCallsite),
    levelRuntimeLoaderTypeChecksResolvedLevelVisuals:
      runtimeProcessor.levelVisualsRefLoaderEvidence?.levelVisualsObjectMaterialization?.expectedKindIndexAddress ===
      hex(levelVisualsObjectKindIndexAddress),
    levelRuntimeVisualsLoaderConfirmed: runtimeProcessor.levelRuntimeLoaderReferences.some(
      (reference) => reference.virtualAddress === hex(levelRuntimeVisualsLoaderSlot),
    ),
    levelRuntimeLoaderCallsLevelVisualsApply: runtimeProcessor.levelVisualsApplyProcessorDirectCallers.some(
      (caller) => caller.callerAddress === hex(levelRuntimeVisualsLoaderToApplyCallsite),
    ),
    levelVisualsRuntimeProcessorConfirmed: runtimeProcessor.profilePayloadLoadDirectCallers.some(
      (caller) => caller.callerAddress === hex(levelVisualsProfilePayloadLoadCallsite),
    ),
  };
  return {
    generatedAt: new Date().toISOString(),
    binaryPath,
    policy:
      "diagnostic-only current-binary LevelVisuals schema audit; this confirms field layout/type registration evidence but does not apply lighting or shader changes",
    currentAnchors: {
      typeRegistryAddressHex: hex(typeRegistryAddress),
      levelRegistrationAddressHex: hex(levelRegistrationAddress),
      levelFieldInitAddressHex: hex(levelFieldInitAddress),
      levelTypeObjectAddressHex: hex(levelTypeObjectAddress),
      levelFieldTableStartHex: hex(levelFieldTableStart),
      levelFieldTableEndHex: hex(levelFieldTableEnd),
      levelVisualsRefRegistrationAddressHex: hex(levelVisualsRefRegistrationAddress),
      levelVisualsRefFieldInitAddressHex: hex(levelVisualsRefFieldInitAddress),
      levelVisualsRefTypeObjectAddressHex: hex(levelVisualsRefTypeObjectAddress),
      levelVisualsRefPointerTypeObjectAddressHex: hex(levelVisualsRefPointerTypeObjectAddress),
      levelVisualsRefPointerPointerTypeObjectAddressHex: hex(levelVisualsRefPointerPointerTypeObjectAddress),
      levelVisualsRefFieldTableStartHex: hex(levelVisualsRefFieldTableStart),
      levelVisualsRefFieldCountAddressHex: hex(levelVisualsRefFieldCountAddress),
      levelVisualsRegistrationAddressHex: hex(levelVisualsRegistrationAddress),
      levelVisualsFieldInitAddressHex: hex(levelVisualsFieldInitAddress),
      levelVisualsTypeObjectAddressHex: hex(levelVisualsTypeObjectAddress),
      levelVisualsFieldTableStartHex: hex(levelVisualsFieldTableStart),
      levelVisualsFieldTableEndHex: hex(levelVisualsFieldTableEnd),
      sceneProbePositionSampleUploadAddressHex: hex(positionSampleUploadAddress),
      sceneProbeProfilePayloadLoadAddressHex: hex(profilePayloadLoadAddress),
    },
    summary,
    levelVisualsRefFields,
    levelFields,
    fields,
    positionSampleUploadCallers,
    runtimeProcessor,
    interpretation:
      "The current package initializes LevelVisualsRef as a one-field 0x8-byte type whose +0x0 field is char*, Level as a 0x198-byte type with 23 descriptors, and LevelVisuals as a 0x60-byte type with 12 descriptors. Level field +0x10 is the visuals reference list consumed by 0x8cbf40; the setup callback also consumes Level +0x138/+0x140/+0x148/+0x150, dispatches Level +0x158, iterates Level +0x160, reads loader state at +0x170, finalizer data at +0x178, cleanup/scan data at +0x188, and conditional per-entry data at +0x190. Field +0x48 in LevelVisuals is LightPlacement**, field +0x50 is char*, and field +0x58 is StaticLensFlare**. The current Level runtime visuals loader at 0x8cbf40 walks Level +0x10 LevelVisualsRef entries, reads each ref +0x0 char* key, resolves that key through 0xc72dbc/0xc72dc8, queries and type-checks the resulting LevelVisuals object through 0x188e540 and kind index 0x30350a8, then calls the LevelVisuals apply processor at 0x8cc27c. That processor routes the +0x50 char* payload into 0xe36f38, and current disassembly shows 0xe36f38 forwards to inner vtable +0x40, so this strengthens the Level -> LevelVisualsRef -> LevelVisuals -> profile/lightfield payload load path. Separately, current callers of 0xe36efc pack a vec3-like position from object +0x50/+0x58 and reach the inner +0x38 position sampler; those callers are position-sample evidence, not LevelVisuals profile-field evidence. Active hero/model preview profile and sample position are still unresolved.",
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

function reportRowsForManifest(manifest) {
  const schemaRows = [
    ...((manifest.levelVisualsRefFields || []).map((field) => ({ schemaName: "LevelVisualsRef", field }))),
    ...((manifest.levelFields || []).map((field) => ({ schemaName: "Level", field }))),
    ...((manifest.fields || []).map((field) => ({ schemaName: "LevelVisuals", field }))),
  ];
  return schemaRows.map(({ schemaName, field }) => ({
    schemaName,
    fieldIndex: field.fieldIndex,
    fieldOffset: field.fieldOffsetHex,
    fieldSpan: field.fieldSpanHex,
    typeName: field.typeName,
    inferredRole: field.inferredRole,
    typeObjectAddress: field.typeObjectAddressHex,
    typeAddressSource: field.typeAddressSource,
    dataAddress: field.dataAddressHex,
    firstValue: field.firstValueHex,
    secondValue: field.secondValueHex,
    registrationCallAddress: field.registrationCallAddressHex,
  }));
}

function exportCurrentNativeLevelVisualsSchemaAudit({
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
    "schemaName",
    "fieldIndex",
    "fieldOffset",
    "fieldSpan",
    "typeName",
    "inferredRole",
    "typeObjectAddress",
    "typeAddressSource",
    "dataAddress",
    "firstValue",
    "secondValue",
    "registrationCallAddress",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLevelVisualsSchemaAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildManifest,
  exportCurrentNativeLevelVisualsSchemaAudit,
};
