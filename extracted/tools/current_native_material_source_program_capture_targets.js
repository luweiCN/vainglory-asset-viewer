#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-material-source-program-capture-targets.json";
const defaultJsonOut = "extracted/reports/current_native_material_source_program_capture_targets.json";
const defaultTsvOut = "extracted/reports/current_native_material_source_program_capture_targets.tsv";
const defaultFridaOut = "extracted/reports/frida_capture_current_material_source_program.js";

const hookTargets = [
  {
    name: "dynamic-source-program-producer-entry",
    offset: 0xbac9d4,
    expectedOpcodeHex: "d101c3ff",
    captureKind: "dynamic-producer-entry",
    reason: "capture x0 scene/entity holder, x1 destination table slot, and x2 resource-list head before 0xbac9d4 builds a source/program table",
  },
  {
    name: "dynamic-source-program-entry-writer-callsite",
    offset: 0xbacac0,
    expectedOpcodeHex: "9433bcc9",
    captureKind: "entry-writer-callsite",
    reason: "capture the exact arguments passed to 0x189bde4 for each accepted 1..4-id resource-list entry",
  },
  {
    name: "dynamic-source-program-clone-finalize-callsite",
    offset: 0xbacad8,
    expectedOpcodeHex: "9433bce1",
    captureKind: "clone-finalize-callsite",
    reason: "capture the temporary table before it is cloned/finalized through 0x189be5c",
  },
  {
    name: "dynamic-source-program-mount-callsite",
    offset: 0xbacae8,
    expectedOpcodeHex: "94074d55",
    captureKind: "mount-callsite",
    reason: "capture the cloned source/program table at the point it is mounted through 0xd8003c",
  },
  {
    name: "dynamic-source-program-upstream-entry",
    offset: 0x8abe6c,
    expectedOpcodeHex: "d10583ff",
    captureKind: "upstream-selection-entry",
    reason: "capture the resource-slot base and owner/config object that choose the resource-list passed to 0xbac9d4",
  },
  {
    name: "dynamic-source-program-upstream-direct-callsite",
    offset: 0x8abfcc,
    expectedOpcodeHex: "940c0282",
    captureKind: "producer-direct-callsite",
    reason: "capture the non-selector caller that passes scene object [x19+0x48], destination x19+0x50, and selected resource slot +0x28",
  },
  {
    name: "dynamic-source-program-selector-tail-callsite",
    offset: 0x8d5550,
    expectedOpcodeHex: "140b5d21",
    captureKind: "selector-tail-callsite",
    reason: "capture the selector route that tail-calls 0xbac9d4 after matching candidate nodes by class/id",
  },
  {
    name: "source-program-entry-builder-entry",
    offset: 0x189bde4,
    expectedOpcodeHex: "a9bc5ff8",
    captureKind: "entry-builder-entry",
    reason: "capture every source/program entry build request after resource-list ids have been packed into arguments",
  },
  {
    name: "source-program-entry-packer-entry",
    offset: 0x189bcf8,
    expectedOpcodeHex: "f9400008",
    captureKind: "entry-packer-entry",
    reason: "capture final source/program entry packing before table header/value arrays are updated",
  },
  {
    name: "scene-entity-source-table-mount-wrapper",
    offset: 0xd8003c,
    expectedOpcodeHex: "91016000",
    captureKind: "table-mount-wrapper",
    reason: "capture source/program table mounts onto scene/entity holder +0x58",
  },
  {
    name: "external-texture-resource-register-entry",
    offset: 0x189dd40,
    expectedOpcodeHex: "d10183ff",
    captureKind: "external-texture-register-entry",
    reason: "capture shaderData external texture key registration before the texture runtime lookup tree owns it",
  },
  {
    name: "external-texture-runtime-lookup-entry",
    offset: 0x189df90,
    expectedOpcodeHex: "a9bc5ff8",
    captureKind: "external-texture-lookup-entry",
    reason: "capture external texture resource key lookup and returned runtime texture object",
  },
  {
    name: "runtime-type4-texture-patch-entry",
    offset: 0x189cf2c,
    expectedOpcodeHex: "d10043ff",
    captureKind: "runtime-type4-texture-patch-entry",
    reason: "capture sampler unit, texture object, and source/program table before/after type4 runtime patch",
  },
  {
    name: "inline-texture-object-builder-entry",
    offset: 0x189e4ec,
    expectedOpcodeHex: "d10443ff",
    captureKind: "inline-texture-object-builder-entry",
    reason: "capture inline lookup texture payload object creation and returned runtime texture object",
  },
];

const opcodeEvidence = [
  [0xbaca10, "producer-list-head-load", "f94002a8", "0xbac9d4 loads the top-level resource-list head before walking entries."],
  [0xbaca28, "producer-top-node-nested-list-load", "f940050a", "each top-level node contributes a nested source/resource list from node +0x8."],
  [0xbaca3c, "producer-nested-resource-id-load", "b9400129", "0xbac9d4 reads a 32-bit resource/program id from each nested node."],
  [0xbaca40, "producer-resource-id-scratch-store", "b82b7b09", "extracted ids are stored into the stack scratch array passed to 0x189bde4."],
  [0xbaca50, "producer-resource-count-mask", "12007969", "0xbac9d4 bounds the nested id count before selecting an entry mode."],
  [0xbaca58, "producer-resource-count-max-check", "71000d3f", "only 1..4 extracted ids are accepted."],
  [0xbaca6c, "producer-mode1", "f9400105", "one extracted id selects 0x189bde4 mode 1 with payload from top-level node +0."],
  [0xbacaa8, "producer-mode2", "f9400105", "two extracted ids select 0x189bde4 mode 2 with payload from top-level node +0."],
  [0xbaca80, "producer-mode3", "f9400105", "three extracted ids select 0x189bde4 mode 3 with payload from top-level node +0."],
  [0xbaca94, "producer-mode4", "f9400105", "four extracted ids select 0x189bde4 mode 4 with payload from top-level node +0."],
  [0xbacac4, "producer-next-top-node-load", "f8408ea8", "0xbac9d4 advances the top-level list and repeats entry construction."],
  [0xbacae0, "producer-destination-store", "f9000280", "0xbac9d4 stores the cloned source/program table into the caller-provided destination pointer."],
  [0x189bd18, "entry-packer-header-store", "b82a690b", "0x189bcf8 stores the packed source/program entry header into the table +0 array."],
  [0x189bd7c, "entry-packer-resource-id-store", "b9000525", "0x189bcf8 stores the resolved resource/program id value at entry +0x4."],
  [0x189bd88, "entry-packer-count-increment", "79002149", "0x189bcf8 increments the source/program entry count in table +0x10."],
  [0x189bdcc, "entry-packer-payload-pointer-store", "f8286922", "0x189bcf8 stores an entry payload pointer into table +0x8 payload array when pointer-backed."],
  [0x8abed0, "upstream-primary-slot-load", "f8408f00", "0x8abe6c loads caller resource slot x2+0x8 before choosing source/program table inputs."],
  [0x8abeec, "upstream-secondary-slot-load", "f9400aa0", "0x8abe6c checks the caller resource-slot secondary pointer at x2+0x10."],
  [0x8abf24, "upstream-scene-object-create", "943f7e65", "after selecting a valid resource input, 0x8abe6c creates/resolves the scene/entity object."],
  [0x8abfa4, "direct-caller-resource-list-a", "f94016e2", "one direct branch passes [x23+0x28] as resource-list x2 to 0xbac9d4."],
  [0x8abfc4, "direct-caller-resource-list-b", "f9401702", "the alternate branch passes [x24+0x28] as resource-list x2 to 0xbac9d4."],
  [0x8abfc8, "direct-caller-destination", "91014261", "the direct caller passes x19+0x50 as the cloned table destination."],
  [0x8d551c, "selector-list-load", "f9400c08", "selector wrapper loads object+0x18 as a candidate node chain before tail-calling 0xbac9d4."],
  [0x8d5534, "selector-node-class-load", "b940a54a", "selector wrapper compares candidate payload +0xa4 against the current class/id value."],
  [0x8d5548, "selector-destination", "9100a001", "selector wrapper passes object+0x28 as the cloned-table destination pointer."],
  [0xd80040, "mount-wrapper-tail-call", "142c41da", "0xd8003c derives object+0x58 and tail-calls 0x18907a8."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({
  source: "opcode-evidence",
  address,
  role,
  expectedOpcodeHex,
  evidence,
}));

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

function instructionHexAt(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 4);
  return fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
}

function rowForSpec(buffer, elf, spec, source) {
  const address = spec.offset ?? spec.address;
  const actualOpcodeHex = instructionHexAt(buffer, elf, address);
  return {
    source,
    name: spec.name || "",
    role: spec.role || "",
    addressHex: hex(address),
    expectedOpcodeHex: spec.expectedOpcodeHex,
    actualOpcodeHex,
    opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
    captureKind: spec.captureKind || "",
    reason: spec.reason || "",
    evidence: spec.evidence || "",
    renderPromotionAllowed: false,
  };
}

const scriptEvidenceSpecs = [
  ["script-start-event", "material-source-program-capture-start", "capture script announces startup and target count"],
  ["script-target-event", "material-source-program-capture-event", "capture script emits per-target JSONL events"],
  ["script-error-event", "material-source-program-capture-error", "capture script reports missing module errors explicitly"],
  ["script-diagnostic-policy", "diagnostic-only capture", "capture output remains diagnostic-only"],
  ["script-no-renderer-takeover-policy", "no renderer takeover is implied", "capture output must not promote viewer rendering"],
  ["script-capture-event-limit", "maxEventsPerHook: 256", "capture script has an explicit per-hook event limit"],
  ["script-capture-limit-event", "material-source-program-capture-limit", "capture script emits a diagnostic event when per-hook capture is truncated"],
  ["script-resource-list-reader", "resourceListSnapshot", "capture script snapshots source/program resource lists"],
  ["script-resource-list-capture-limit", "maxListItems: 64", "capture script captures enough top-level resource-list nodes for broad material source/program coverage"],
  ["script-nested-resource-id-capture-limit", "maxNestedItems: 32", "capture script captures enough nested resource ids for broad source/program coverage"],
  ["script-resource-list-truncation-field", "resourceListCaptureTruncated", "capture script reports top-level resource-list truncation explicitly"],
  ["script-nested-resource-id-truncation-field", "nestedCaptureTruncated", "capture script reports nested resource-id truncation explicitly"],
  ["script-source-program-table-reader", "sourceProgramTableSnapshot", "capture script decodes source/program tables"],
  ["script-source-table-entry-limit", "maxSourceTableEntries: 128", "capture script snapshots enough source/program table entries for broad material sampler coverage"],
  ["script-source-table-truncation-field", "entryCaptureTruncated", "capture script reports when a source/program table exceeds the capture limit"],
  ["script-source-program-table-field", "sourceProgramTable", "mount and type4 patch events carry the source/program table pointer"],
  ["script-resource-list-field", "resourceList", "events include decoded resource-list rows"],
  ["script-table-decoded-field", "tableDecoded", "events include decoded table fields"],
  ["script-temp-table-decoded-field", "tempTableDecoded", "clone/finalize events include temporary table decode"],
  ["script-texture-registration-field", "textureRegistration", "external texture registration events are covered"],
  ["script-texture-lookup-field", "textureLookup", "external texture lookup events are covered"],
  ["script-resource-key-cstring-field", "resourceKeyCString", "texture lookup/register events carry resource keys for shadergraph resource matching"],
  ["script-texture-patch-field", "texturePatch", "runtime type4 texture patch events are covered"],
  ["script-inline-texture-builder-field", "inlineTextureBuilder", "inline texture object builder events are covered"],
  ["script-returned-texture-object-field", "returnedTextureObject", "leave events capture returned texture objects"],
  ["script-table-after-decoded-field", "tableAfterDecoded", "type4 patch leave events capture post-patch table state"],
  ["script-sampler-unit-field", "samplerUnitU32", "type4 patch events capture sampler units"],
  ["script-event-id-field", "eventId", "events include a monotonic sequence id for ordering"],
  ["script-thread-id-field", "threadId", "events include the runtime thread id for same-thread grouping"],
  ["script-leave-hook-field", "capturesOnLeave", "return-value-dependent hooks are captured on leave"],
].map(([role, pattern, evidence]) => ({ role, pattern, evidence }));

function captureScriptTargets() {
  return hookTargets.map(({ name, offset, captureKind, reason }) => ({ name, offset, captureKind, reason }));
}

function scriptCoverageRows(script, hookRows) {
  const targetRows = hookRows.map((row) => {
    const scriptMatches = script.includes(row.name) && script.includes(row.captureKind);
    return {
      source: "frida-script-target",
      name: row.name,
      role: "hook-target-present-in-script",
      addressHex: row.addressHex,
      expectedOpcodeHex: "",
      actualOpcodeHex: "",
      opcodeMatches: true,
      captureKind: row.captureKind,
      reason: row.reason,
      evidence: "script contains hook target name and capture kind",
      scriptMatches,
      renderPromotionAllowed: false,
    };
  });
  const evidenceRows = scriptEvidenceSpecs.map((spec) => {
    const scriptMatches = script.includes(spec.pattern);
    return {
      source: "frida-script-evidence",
      name: spec.role,
      role: spec.role,
      addressHex: "",
      expectedOpcodeHex: "",
      actualOpcodeHex: "",
      opcodeMatches: true,
      captureKind: "",
      reason: spec.evidence,
      evidence: spec.pattern,
      scriptMatches,
      renderPromotionAllowed: false,
    };
  });
  return [...targetRows, ...evidenceRows];
}

function fridaScriptForTargets(targets) {
  return `"use strict";
const CONFIG = {
  includeBacktrace: false,
  maxEventsPerHook: 256,
  maxListItems: 64,
  maxNestedItems: 32,
  maxPrefixBytes: 96,
  maxSourceTableEntries: 128,
  maxValueWordsPerEntry: 4,
};

const MODULE_NAMES = ["libGameKindred.so", "GameKindred"];
const HOOK_TARGETS = ${JSON.stringify(targets, null, 2)};
let EVENT_COUNTER = 0;

function findGameModule() {
  for (const name of MODULE_NAMES) {
    const module = Process.findModuleByName(name);
    if (module) return module;
  }
  return Process.enumerateModules().find((module) => /GameKindred/i.test(module.name));
}

function toHex(value) {
  try {
    if (value === null || value === undefined) return "";
    return ptr(value).toString();
  } catch {
    return String(value);
  }
}

function safe(label, fn, fallback = null) {
  try {
    return fn();
  } catch (error) {
    return fallback ?? { error: label + ": " + String(error) };
  }
}

function reg(context, name) {
  return context && context[name] !== undefined ? ptr(context[name]) : ptr(0);
}

function u32(address) {
  return safe("u32", () => ptr(address).readU32(), null);
}

function u16(address) {
  return safe("u16", () => ptr(address).readU16(), null);
}

function pointer(address) {
  return safe("pointer", () => ptr(address).readPointer(), ptr(0));
}

function pointerAddUnlessNull(address, offset) {
  return safe("pointerAddUnlessNull", () => {
    const value = ptr(address);
    return value.isNull() ? ptr(0) : value.add(offset);
  }, ptr(0));
}

function prefix(address, byteLength = CONFIG.maxPrefixBytes) {
  return safe("prefix", () => {
    const value = ptr(address);
    if (value.isNull()) return "";
    return Array.from(new Uint8Array(value.readByteArray(byteLength)))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }, "");
}

function maybeCString(address) {
  return safe("cstring", () => {
    const value = ptr(address);
    if (value.isNull()) return "";
    return value.readCString(256) || "";
  }, "");
}

function nestedIds(nestedHead) {
  const rows = [];
  let node = ptr(nestedHead);
  for (let index = 0; index < CONFIG.maxNestedItems && !node.isNull(); index += 1) {
    rows.push({
      index,
      node: toHex(node),
      idU32: u32(node),
      nextAssumingPlus8: toHex(pointer(node.add(8))),
      prefix: prefix(node, 32),
    });
    node = pointer(node.add(8));
  }
  return {
    nestedCaptureLimit: CONFIG.maxNestedItems,
    nestedCaptureTruncated: !node.isNull(),
    nextNodeAfterLimit: toHex(node),
    rows,
  };
}

function valueWordsAt(valueArray, valueOffset, valueWordCount) {
  const rows = [];
  const base = ptr(valueArray);
  if (base.isNull() || valueOffset === null || valueOffset === undefined) return rows;
  const maxWords = Math.min(CONFIG.maxValueWordsPerEntry, Math.max(0, valueWordCount - valueOffset));
  for (let index = 0; index < maxWords; index += 1) {
    const word = u32(base.add((valueOffset + index) * 4));
    if (word === null) break;
    rows.push({ index, valueOffset: valueOffset + index, u32: word, hex: "0x" + word.toString(16) });
  }
  return rows;
}

function sourceProgramTableSnapshot(tableAddress) {
  return safe("sourceProgramTable", () => {
    const table = ptr(tableAddress);
    if (table.isNull()) return null;
    const entryArray = pointer(table);
    const valueArray = pointer(table.add(8));
    const countWord = u32(table.add(0x10));
    const entryCount = countWord === null ? null : (countWord & 0xffff);
    const valueWordCount = countWord === null ? null : ((countWord >>> 16) & 0xffff);
    const entries = [];
    const boundedEntryCount = Math.min(entryCount || 0, CONFIG.maxSourceTableEntries);
    for (let index = 0; index < boundedEntryCount && !entryArray.isNull(); index += 1) {
      const entryAddress = entryArray.add(index * 8);
      const header = u32(entryAddress);
      const sourceKeyHash = u32(entryAddress.add(4));
      if (header === null || sourceKeyHash === null) break;
      const valueOffset = (header >>> 12) & 0xffff;
      entries.push({
        index,
        address: toHex(entryAddress),
        header,
        headerHex: "0x" + header.toString(16),
        sourceIndex: header & 0xfff,
        valueOffset,
        typeBits: (header >>> 28) & 0x7,
        directValueFlag: Boolean(header & 0x80000000),
        sourceKeyHash,
        sourceKeyHashHex: "0x" + sourceKeyHash.toString(16),
        valueWords: valueWordsAt(valueArray, valueOffset, valueWordCount || 0),
      });
    }
    return {
      table: toHex(table),
      entryArray: toHex(entryArray),
      valueArray: toHex(valueArray),
      countWord,
      countWordHex: countWord === null ? "" : "0x" + countWord.toString(16),
      entryCount,
      valueWordCount,
      entryCountU16: u16(table.add(0x10)),
      valueWordCountU16: u16(table.add(0x12)),
      entryCaptureLimit: CONFIG.maxSourceTableEntries,
      entryCaptureTruncated: Boolean((entryCount || 0) > boundedEntryCount),
      missingEntryRows: Math.max(0, (entryCount || 0) - boundedEntryCount),
      capturedEntryRows: entries.length,
      entries,
      layoutEvidence: "opcode-bounded: table +0 entry array, +0x8 value array, +0x10 packed entry/value counts",
    };
  }, null);
}

function resourceListSnapshot(head) {
  const rows = [];
  let node = ptr(head);
  for (let index = 0; index < CONFIG.maxListItems && !node.isNull(); index += 1) {
    const payload = pointer(node);
    const nestedHead = pointer(node.add(8));
    rows.push({
      index,
      node: toHex(node),
      payload: toHex(payload),
      payloadCString: maybeCString(payload),
      nestedHead: toHex(nestedHead),
      prefix: prefix(node),
      nestedIds: nestedIds(nestedHead),
    });
    node = pointer(node.add(8));
  }
  return {
    resourceListCaptureLimit: CONFIG.maxListItems,
    resourceListCaptureTruncated: !node.isNull(),
    nextNodeAfterLimit: toHex(node),
    rows,
  };
}

function registerSnapshot(context) {
  const names = ["x0", "x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8", "x19", "x20", "x21", "x22", "x23", "x24"];
  const out = {};
  for (const name of names) out[name] = toHex(reg(context, name));
  return out;
}

function u32Register(context, name) {
  return safe("u32Register", () => Number(ptr(reg(context, name)).and(0xffffffff)), null);
}

function currentThreadId() {
  return safe("threadId", () => Process.getCurrentThreadId(), null);
}

function eventForTarget(target, context) {
  const registers = registerSnapshot(context);
  const event = {
    event: "material-source-program-capture-event",
    eventId: ++EVENT_COUNTER,
    threadId: currentThreadId(),
    timestampMs: Date.now(),
    target: target.name,
    captureKind: target.captureKind,
    offset: "0x" + target.offset.toString(16),
    registers,
    note: "diagnostic-only capture; do not use as renderer permission",
  };
  if (target.captureKind === "dynamic-producer-entry") {
    event.sceneHolder = registers.x0;
    event.destinationPointer = registers.x1;
    event.resourceListHead = registers.x2;
    event.resourceList = resourceListSnapshot(reg(context, "x2"));
  } else if (target.captureKind === "entry-writer-callsite" || target.captureKind === "entry-builder-entry" || target.captureKind === "entry-packer-entry") {
    event.entryArgs = {
      table: registers.x0,
      modeOrCount: registers.x1,
      scratchOrValues: registers.x2,
      maybeMode: registers.x3,
      maybeCount: registers.x4,
      payload: registers.x5,
      scratchPrefix: prefix(reg(context, "x2"), 64),
      payloadCString: maybeCString(reg(context, "x5")),
      tableDecoded: sourceProgramTableSnapshot(reg(context, "x0")),
    };
  } else if (target.captureKind === "producer-direct-callsite") {
    event.directCaller = {
      sceneObject: registers.x0,
      destinationPointer: registers.x1,
      resourceListHead: registers.x2,
      resourceList: resourceListSnapshot(reg(context, "x2")),
    };
  } else if (target.captureKind === "selector-tail-callsite") {
    event.selectorRoute = {
      selectedNode: registers.x0,
      destinationPointer: registers.x1,
      resourceListHead: registers.x2,
      resourceList: resourceListSnapshot(reg(context, "x2")),
    };
  } else if (target.captureKind === "mount-callsite" || target.captureKind === "table-mount-wrapper") {
    event.mount = {
      sceneHolder: registers.x0,
      sourceProgramTable: registers.x1,
      tablePrefix: prefix(reg(context, "x1"), 96),
      tableDecoded: sourceProgramTableSnapshot(reg(context, "x1")),
    };
  } else if (target.captureKind === "clone-finalize-callsite") {
    event.clone = {
      tempTable: registers.x0,
      tempTablePrefix: prefix(reg(context, "x0"), 96),
      tempTableDecoded: sourceProgramTableSnapshot(reg(context, "x0")),
    };
  } else if (target.captureKind === "upstream-selection-entry") {
    event.upstream = {
      object: registers.x0,
      ownerConfig: registers.x1,
      callerResourceSlotBase: registers.x2,
      resourceSlotPrefix: prefix(reg(context, "x2"), 96),
    };
  } else if (target.captureKind === "external-texture-register-entry") {
    event.textureRegistration = {
      textureRuntime: registers.x0,
      resourceKey: registers.x1,
      resourceKeyCString: maybeCString(reg(context, "x1")),
      stateOrRecord: registers.x2,
      resourceKeyPrefix: prefix(reg(context, "x1"), 96),
    };
  } else if (target.captureKind === "external-texture-lookup-entry") {
    event.textureLookup = {
      textureRuntime: registers.x0,
      resourceKey: registers.x1,
      resourceKeyCString: maybeCString(reg(context, "x1")),
      stateOrRecord: registers.x2,
      resourceKeyPrefix: prefix(reg(context, "x1"), 96),
    };
  } else if (target.captureKind === "runtime-type4-texture-patch-entry") {
    event.texturePatch = {
      sourceProgramTable: registers.x0,
      samplerUnit: registers.x1,
      samplerUnitU32: u32Register(context, "x1"),
      textureObject: registers.x2,
      textureObjectRecord: toHex(pointerAddUnlessNull(reg(context, "x2"), 0x30)),
      textureObjectRecordPrefix: prefix(pointerAddUnlessNull(reg(context, "x2"), 0x30), 64),
      tableBeforeDecoded: sourceProgramTableSnapshot(reg(context, "x0")),
    };
  } else if (target.captureKind === "inline-texture-object-builder-entry") {
    event.inlineTextureBuilder = {
      textureRuntime: registers.x0,
      inlinePayload: registers.x1,
      inlinePayloadPrefix: prefix(reg(context, "x1"), 128),
    };
  }
  if (CONFIG.includeBacktrace) {
    event.backtrace = Thread.backtrace(context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).map(String);
  }
  return event;
}

function capturesOnLeave(captureKind) {
  return [
    "external-texture-register-entry",
    "external-texture-lookup-entry",
    "runtime-type4-texture-patch-entry",
    "inline-texture-object-builder-entry",
  ].includes(captureKind);
}

function attachLeaveEvidence(event, target, retval, enterState = {}) {
  event.phase = "leave";
  event.returnValue = toHex(retval);
  if (target.captureKind === "external-texture-register-entry" && event.textureRegistration) {
    event.textureRegistration.returnValue = toHex(retval);
  } else if (target.captureKind === "external-texture-lookup-entry" && event.textureLookup) {
    event.textureLookup.returnedTextureObject = toHex(retval);
    event.textureLookup.returnedTextureObjectRecord = toHex(pointerAddUnlessNull(retval, 0x30));
    event.textureLookup.returnedTextureObjectRecordPrefix = prefix(pointerAddUnlessNull(retval, 0x30), 64);
  } else if (target.captureKind === "runtime-type4-texture-patch-entry" && event.texturePatch) {
    event.texturePatch.returnValue = toHex(retval);
    event.texturePatch.tableAfterDecoded = sourceProgramTableSnapshot(enterState.tableAddress);
  } else if (target.captureKind === "inline-texture-object-builder-entry" && event.inlineTextureBuilder) {
    event.inlineTextureBuilder.returnedTextureObject = toHex(retval);
    event.inlineTextureBuilder.returnedTextureObjectRecord = toHex(pointerAddUnlessNull(retval, 0x30));
    event.inlineTextureBuilder.returnedTextureObjectRecordPrefix = prefix(pointerAddUnlessNull(retval, 0x30), 64);
  }
  return event;
}

function installHook(module, target) {
  const address = module.base.add(target.offset);
  let seen = 0;
  let limitReported = false;
  Interceptor.attach(address, {
    onEnter() {
      seen += 1;
      if (seen > CONFIG.maxEventsPerHook) {
        if (!limitReported) {
          limitReported = true;
          console.log(JSON.stringify({
            event: "material-source-program-capture-limit",
            target: target.name,
            captureKind: target.captureKind,
            offset: "0x" + target.offset.toString(16),
            seen,
            maxEventsPerHook: CONFIG.maxEventsPerHook,
            droppedEventRowsAtLeast: seen - CONFIG.maxEventsPerHook,
            note: "diagnostic-only capture limit reached; captured stream is incomplete",
          }));
        }
        return;
      }
      const event = eventForTarget(target, this.context);
      if (capturesOnLeave(target.captureKind)) {
        this.materialSourceProgramCaptureEvent = event;
        this.materialSourceProgramCaptureEnterState = { tableAddress: reg(this.context, "x0") };
        return;
      }
      console.log(JSON.stringify(event));
    },
    onLeave(retval) {
      if (!capturesOnLeave(target.captureKind)) return;
      const event = this.materialSourceProgramCaptureEvent;
      if (!event) return;
      console.log(JSON.stringify(attachLeaveEvidence(event, target, retval, this.materialSourceProgramCaptureEnterState)));
    },
  });
}

const gameModule = findGameModule();
if (!gameModule) {
  console.log(JSON.stringify({ event: "material-source-program-capture-error", error: "GameKindred module not found" }));
} else {
  for (const target of HOOK_TARGETS) installHook(gameModule, target);
  console.log(JSON.stringify({
    event: "material-source-program-capture-start",
    module: gameModule.name,
    base: toHex(gameModule.base),
    targetCount: HOOK_TARGETS.length,
    policy: "diagnostic-only material source/program capture; no renderer takeover is implied",
  }));
}
`;
}

function buildCurrentNativeMaterialSourceProgramCaptureTargets(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const hookRows = hookTargets.map((spec) => rowForSpec(buffer, elf, spec, "hook-target"));
  const opcodeRows = opcodeEvidence.map((spec) => rowForSpec(buffer, elf, spec, "opcode-evidence"));
  const script = fridaScriptForTargets(captureScriptTargets());
  const scriptRows = scriptCoverageRows(script, hookRows);
  const rows = [...hookRows, ...opcodeRows, ...scriptRows];
  const opcodeMismatchRows = rows.filter((row) => !row.opcodeMatches).length;
  const captureScriptTargetRows = scriptRows.filter((row) => row.source === "frida-script-target").length;
  const captureScriptEventRows = scriptRows.filter((row) => row.source === "frida-script-evidence").length;
  const captureScriptMismatchRows = scriptRows.filter((row) => !row.scriptMatches).length;
  const captureScriptGenerated = true;
  const captureEventLimit = 256;
  const captureLimitEventCovered = scriptRows.some(
    (row) => row.role === "script-capture-limit-event" && row.scriptMatches,
  );
  const resourceListCaptureLimit = 64;
  const nestedResourceIdCaptureLimit = 32;
  const resourceListTruncationFieldCovered = scriptRows.some(
    (row) => row.role === "script-resource-list-truncation-field" && row.scriptMatches,
  );
  const nestedResourceIdTruncationFieldCovered = scriptRows.some(
    (row) => row.role === "script-nested-resource-id-truncation-field" && row.scriptMatches,
  );
  const sourceProgramTableEntryCaptureLimit = 128;
  const sourceProgramTableTruncationFieldCovered = scriptRows.some(
    (row) => row.role === "script-source-table-truncation-field" && row.scriptMatches,
  );
  const dynamicProducerHooksReady =
    opcodeMismatchRows === 0 &&
    hookRows.some((row) => row.name === "dynamic-source-program-producer-entry" && row.opcodeMatches) &&
    hookRows.some((row) => row.name === "dynamic-source-program-entry-writer-callsite" && row.opcodeMatches);
  const upstreamSelectionHooksReady =
    opcodeMismatchRows === 0 &&
    hookRows.some((row) => row.captureKind === "upstream-selection-entry" && row.opcodeMatches) &&
    hookRows.some((row) => row.captureKind === "producer-direct-callsite" && row.opcodeMatches) &&
    hookRows.some((row) => row.captureKind === "selector-tail-callsite" && row.opcodeMatches);
  const tableMountHooksReady =
    opcodeMismatchRows === 0 &&
    hookRows.some((row) => row.captureKind === "mount-callsite" && row.opcodeMatches) &&
    hookRows.some((row) => row.captureKind === "table-mount-wrapper" && row.opcodeMatches);
  const textureRuntimeCaptureHooksReady =
    opcodeMismatchRows === 0 &&
    hookRows.some((row) => row.captureKind === "external-texture-register-entry" && row.opcodeMatches) &&
    hookRows.some((row) => row.captureKind === "external-texture-lookup-entry" && row.opcodeMatches) &&
    hookRows.some((row) => row.captureKind === "runtime-type4-texture-patch-entry" && row.opcodeMatches);
  const inlineTextureRuntimeCaptureHooksReady =
    opcodeMismatchRows === 0 &&
    hookRows.some((row) => row.captureKind === "inline-texture-object-builder-entry" && row.opcodeMatches);
  const summary = {
    hookTargetRows: hookRows.length,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
    dynamicProducerHookRows: hookRows.filter((row) => row.captureKind.includes("producer")).length,
    entryWriterHookRows: hookRows.filter((row) => row.captureKind.includes("entry")).length,
    tableMountHookRows: hookRows.filter((row) => row.captureKind.includes("mount")).length,
    captureScriptGenerated,
    captureScriptTargetRows,
    captureScriptEventRows,
    captureScriptMismatchRows,
    captureEventLimit,
    captureLimitEventCovered,
    resourceListCaptureLimit,
    nestedResourceIdCaptureLimit,
    resourceListTruncationFieldCovered,
    nestedResourceIdTruncationFieldCovered,
    sourceProgramTableEntryCaptureLimit,
    sourceProgramTableTruncationFieldCovered,
    sourceProgramCaptureScriptCoverageReady: captureScriptMismatchRows === 0,
    sourceProgramStructuredTableCaptureGenerated: true,
    dynamicProducerHooksReady,
    upstreamSelectionHooksReady,
    tableMountHooksReady,
    textureRuntimeCaptureHookRows: hookRows.filter((row) => row.captureKind.includes("texture")).length,
    textureRuntimeCaptureHooksReady,
    inlineTextureRuntimeCaptureHooksReady,
    runtimeCaptureRequiredRows: 1,
    sourceProgramResourceListShapeRecovered: dynamicProducerHooksReady,
    sourceProgramTableMountRecovered: tableMountHooksReady,
    textureRuntimeCaptureGenerated: textureRuntimeCaptureHooksReady,
    resourceListSemanticNamesRecovered: false,
    shadergraphSamplerToTexDataBindingRecovered: false,
    materialSamplerTextureObjectOwnershipRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only material source/program capture targets; prepares original runtime samples for resource-list semantics without enabling rendering",
    summary,
    items: rows,
    interpretation: {
      recovered:
        "Current Android hook targets cover the dynamic source/program table producer, entry writer, clone/finalize, mount wrapper, upstream direct caller, selector tail-call route, external texture key lookup, runtime type4 texture patch, and inline texture object builder.",
      boundary:
        "This only prepares live capture of resource-list ids, source/program table entries, runtime texture key/object links, and type4 patch results. It does not name the resource-list semantics, prove ordinary material sampler ownership, or recover shader formulas.",
      nextRequiredEvidence:
        "Run the Frida capture against a model that is visible in-game, then summarize observed resource-list ids, source/program entries, mounted tables, texture key lookups, and type4 patch rows before changing viewer rendering.",
    },
  };
}

function exportCurrentNativeMaterialSourceProgramCaptureTargets({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
  fridaOut = defaultFridaOut,
} = {}) {
  const manifest = buildCurrentNativeMaterialSourceProgramCaptureTargets({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "source",
    "name",
    "role",
    "addressHex",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "captureKind",
    "reason",
    "evidence",
    "scriptMatches",
    "renderPromotionAllowed",
  ]);
  fs.mkdirSync(path.dirname(fridaOut), { recursive: true });
  fs.writeFileSync(fridaOut, fridaScriptForTargets(captureScriptTargets()));
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeMaterialSourceProgramCaptureTargets({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    fridaOut: optionValue(args, "--frida-out", defaultFridaOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeMaterialSourceProgramCaptureTargets,
  exportCurrentNativeMaterialSourceProgramCaptureTargets,
  fridaScriptForTargets,
};
