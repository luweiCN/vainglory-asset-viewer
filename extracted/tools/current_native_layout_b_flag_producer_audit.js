#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-flag-producer-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_flag_producer_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_flag_producer_audit.tsv";

const particleMask = 0x200;
const layoutBRegistrationReadAddress = 0x8d3110;
const layoutBDispatchReadAddress = 0x8d5094;
const layoutBConstructorSeedAddress = 0x8d2dbc;
const activeChildSelectorStoreAddresses = new Set([0x9a2720, 0x9a2744, 0x9a2750]);
const flagFieldStartOffset = 0xac;
const flagFieldEndOffset = 0xb0;
const layoutBFamilyRanges = [{ name: "layout-b-registration-refresh-family", start: 0x8d2d00, end: 0x8d5100 }];

const knownLogicalImmediateEffects = new Map([
  ["121d7908", { operation: "and-clear", mask: 0x4, summary: "clear bit 2" }],
  ["121d7928", { operation: "and-clear", mask: 0x4, summary: "clear bit 2" }],
  ["121d7909", { operation: "and-clear", mask: 0x4, summary: "clear bit 2" }],
  ["121d7929", { operation: "and-clear", mask: 0x4, summary: "clear bit 2" }],
  ["121c7908", { operation: "and-clear", mask: 0x8, summary: "clear bit 3" }],
  ["121c7929", { operation: "and-clear", mask: 0x8, summary: "clear bit 3" }],
  ["12115d08", { operation: "and-clear", mask: 0x7f80, summary: "clear bits 7..14" }],
  ["321e0108", { operation: "orr-set", mask: 0x4, summary: "set bit 2" }],
  ["321d0108", { operation: "orr-set", mask: 0x8, summary: "set bit 3" }],
  ["321d0129", { operation: "orr-set", mask: 0x8, summary: "set bit 3" }],
  ["321c0129", { operation: "orr-set", mask: 0x10, summary: "set bit 4" }],
  ["32191d08", { operation: "orr-set", mask: 0x7f80, summary: "set bits 7..14" }],
]);

const knownOrrWzrConstants = new Map([
  ["320003e8", { destination: 8, value: 1 }],
  ["320003e9", { destination: 9, value: 1 }],
  ["321f03e8", { destination: 8, value: 2 }],
  ["320817e9", { destination: 9, value: 0x3f000000 }],
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

function signExtend(value, bits) {
  const signBit = 1 << (bits - 1);
  return (value & (signBit - 1)) - (value & signBit);
}

function fileOffsetForVirtualAddress(elf, virtualAddress, byteLength = 4) {
  for (const segment of elf.loads) {
    if (virtualAddress >= segment.virtualAddress && virtualAddress + byteLength <= segment.virtualAddress + segment.fileSize) {
      return segment.fileOffset + (virtualAddress - segment.virtualAddress);
    }
  }
  return -1;
}

function virtualAddressForFileOffset(elf, fileOffset) {
  for (const segment of elf.loads) {
    const start = segment.fileOffset;
    const end = segment.fileOffset + segment.fileSize;
    if (fileOffset >= start && fileOffset < end) return segment.virtualAddress + (fileOffset - start);
  }
  return -1;
}

function sectionForVirtualAddress(elf, virtualAddress) {
  return (
    elf.sections.find((section) => {
      if (!section.size) return false;
      return virtualAddress >= section.virtualAddress && virtualAddress < section.virtualAddress + section.size;
    }) || null
  );
}

function readCStringAtVirtualAddress(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 1);
  if (fileOffset < 0) return "";
  const section = sectionForVirtualAddress(elf, virtualAddress);
  if (section?.name !== ".rodata") return "";
  let end = fileOffset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  const value = buffer.subarray(fileOffset, end).toString("utf8");
  return /^[\x20-\x7e]+$/.test(value) ? value.slice(0, 180) : "";
}

function instructionAt(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 4);
  return fileOffset >= 0 ? buffer.readUInt32LE(fileOffset) : null;
}

function parseAdrp(instruction, pc) {
  if (((instruction & 0x9f000000) >>> 0) !== 0x90000000) return null;
  const immlo = (instruction >>> 29) & 0x3;
  const immhi = (instruction >>> 5) & 0x7ffff;
  const signed = signExtend((immhi << 2) | immlo, 21);
  return {
    register: instruction & 0x1f,
    address: (pc & ~0xfff) + signed * 0x1000,
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

function parseBranch(instruction, pc) {
  const opcode = (instruction & 0xfc000000) >>> 0;
  if (opcode !== 0x94000000 && opcode !== 0x14000000) return null;
  return {
    mode: opcode === 0x94000000 ? "bl" : "b-tail",
    target: pc + signExtend(instruction & 0x03ffffff, 26) * 4,
  };
}

function parseBfi(instruction) {
  if (((instruction & 0x7f800000) >>> 0) !== 0x33000000) return null;
  const immr = (instruction >>> 16) & 0x3f;
  const imms = (instruction >>> 10) & 0x3f;
  const lsb = (32 - immr) & 31;
  const width = imms + 1;
  if (width <= 0 || width > 32 || lsb + width > 32) return null;
  return {
    operation: "bfi-copy",
    destination: instruction & 0x1f,
    source: (instruction >>> 5) & 0x1f,
    lsb,
    width,
    mask: ((2 ** width - 1) << lsb) >>> 0,
    summary: width === 1 ? `copy predicate into bit ${lsb}` : `copy value into bits ${lsb}..${lsb + width - 1}`,
  };
}

function parseKnownLogicalImmediate(instruction) {
  const instructionHex = instruction.toString(16).padStart(8, "0");
  const effect = knownLogicalImmediateEffects.get(instructionHex);
  if (!effect) return null;
  return {
    ...effect,
    destination: instruction & 0x1f,
    source: (instruction >>> 5) & 0x1f,
  };
}

function parseAddSubImmediateW(instruction) {
  const opcode = (instruction & 0xff000000) >>> 0;
  if (opcode !== 0x11000000 && opcode !== 0x51000000) return null;
  const immediate = (instruction >>> 10) & 0xfff;
  return {
    operation: opcode === 0x11000000 ? "counter-add" : "counter-sub",
    destination: instruction & 0x1f,
    source: (instruction >>> 5) & 0x1f,
    immediate,
    mask: 0,
    summary: `${opcode === 0x11000000 ? "increment" : "decrement"} by ${immediate}`,
  };
}

function parseMovzW(instruction) {
  if (((instruction & 0xff800000) >>> 0) !== 0x52800000) return null;
  const destination = instruction & 0x1f;
  const imm16 = (instruction >>> 5) & 0xffff;
  const shift = ((instruction >>> 21) & 0x3) * 16;
  return { destination, value: (imm16 << shift) >>> 0 };
}

function parseMovkW(instruction) {
  if (((instruction & 0xff800000) >>> 0) !== 0x72800000) return null;
  const destination = instruction & 0x1f;
  const imm16 = (instruction >>> 5) & 0xffff;
  const shift = ((instruction >>> 21) & 0x3) * 16;
  return { destination, imm16, shift };
}

function knownOrrWzrConstant(instruction) {
  const instructionHex = instruction.toString(16).padStart(8, "0");
  return knownOrrWzrConstants.get(instructionHex) || null;
}

function constantForRegisterBeforeStore(context, register, storeAddress) {
  const values = new Map();
  for (const row of context) {
    if (row.address >= storeAddress) break;
    const instruction = Number.parseInt(row.instructionHex, 16);
    const movz = parseMovzW(instruction);
    if (movz) {
      values.set(movz.destination, movz.value);
      continue;
    }
    const movk = parseMovkW(instruction);
    if (movk && values.has(movk.destination)) {
      const oldValue = values.get(movk.destination);
      const clearMask = (~(0xffff << movk.shift)) >>> 0;
      values.set(movk.destination, ((oldValue & clearMask) | (movk.imm16 << movk.shift)) >>> 0);
      continue;
    }
    const orrConstant = knownOrrWzrConstant(instruction);
    if (orrConstant) values.set(orrConstant.destination, orrConstant.value);
  }
  return values.has(register) ? values.get(register) : null;
}

function float32FromU32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer.readFloatLE(0);
}

function decodedMutationEffect(instruction) {
  return parseBfi(instruction) || parseKnownLogicalImmediate(instruction) || parseAddSubImmediateW(instruction);
}

function contextInstructions(buffer, elf, centerAddress, beforeInstructions = 16, afterInstructions = 2) {
  const rows = [];
  for (let address = centerAddress - beforeInstructions * 4; address <= centerAddress + afterInstructions * 4; address += 4) {
    const instruction = instructionAt(buffer, elf, address);
    if (instruction === null) continue;
    const mutationEffect = decodedMutationEffect(instruction);
    const branch = parseBranch(instruction, address);
    rows.push({
      address,
      addressHex: hex(address),
      instructionHex: instruction.toString(16).padStart(8, "0"),
      mutationEffect,
      branch: branch ? { mode: branch.mode, targetHex: hex(branch.target) } : null,
    });
  }
  return rows;
}

function scanObjectFlagAcAccesses(buffer, elf) {
  const text = elf.sections.find((section) => section.name === ".text");
  if (!text) return [];
  const patterns = [
    { kind: "ldr-w", mask: 0xffc00000, value: 0xb9400000, scale: 4 },
    { kind: "str-w", mask: 0xffc00000, value: 0xb9000000, scale: 4 },
  ];
  const rows = [];
  for (let fileOffset = text.fileOffset; fileOffset + 4 <= text.fileOffset + text.size; fileOffset += 4) {
    const instruction = buffer.readUInt32LE(fileOffset);
    for (const pattern of patterns) {
      if (((instruction & pattern.mask) >>> 0) !== pattern.value) continue;
      const immediate = ((instruction >>> 10) & 0xfff) * pattern.scale;
      if (immediate !== 0xac) continue;
      const address = virtualAddressForFileOffset(elf, fileOffset);
      rows.push({
        address,
        addressHex: hex(address),
        accessKind: pattern.kind,
        rt: instruction & 0x1f,
        rn: (instruction >>> 5) & 0x1f,
        immediateHex: "0xac",
        instructionHex: instruction.toString(16).padStart(8, "0"),
      });
    }
  }
  return rows;
}

function parseUnsignedImmediateStore(instruction) {
  const storeSpecs = [
    { accessKind: "str-x", value: 0xf9000000, mask: 0xffc00000, scale: 8, byteWidth: 8 },
    { accessKind: "str-w", value: 0xb9000000, mask: 0xffc00000, scale: 4, byteWidth: 4 },
    { accessKind: "strh", value: 0x79000000, mask: 0xffc00000, scale: 2, byteWidth: 2 },
    { accessKind: "strb", value: 0x39000000, mask: 0xffc00000, scale: 1, byteWidth: 1 },
  ];
  const spec = storeSpecs.find((candidate) => ((instruction & candidate.mask) >>> 0) === candidate.value);
  if (!spec) return null;
  return {
    ...spec,
    offset: ((instruction >>> 10) & 0xfff) * spec.scale,
    valueRegister: instruction & 0x1f,
    baseRegister: (instruction >>> 5) & 0x1f,
  };
}

function scanLayoutBFamilyFlagOverlapWrites(buffer, elf) {
  const rows = [];
  for (const range of layoutBFamilyRanges) {
    for (let address = range.start; address < range.end; address += 4) {
      const instruction = instructionAt(buffer, elf, address);
      if (instruction === null) continue;
      const store = parseUnsignedImmediateStore(instruction);
      if (!store) continue;
      const writeStart = store.offset;
      const writeEnd = store.offset + store.byteWidth;
      if (writeStart >= flagFieldEndOffset || writeEnd <= flagFieldStartOffset) continue;
      const isConstructorSeed = address === layoutBConstructorSeedAddress;
      rows.push({
        id: `layout-b-family-flag-overlap-${hex(address)}`,
        range: range.name,
        address,
        addressHex: hex(address),
        accessKind: store.accessKind,
        objectFieldOffsetHex: hex(store.offset),
        byteWidth: store.byteWidth,
        baseRegister: `x${store.baseRegister}`,
        valueRegister: `${store.accessKind === "str-x" ? "x" : "w"}${store.valueRegister}`,
        instructionHex: instruction.toString(16).padStart(8, "0"),
        producerClass: isConstructorSeed
          ? "layout-b-constructor-initial-seed"
          : "layout-b-family-overlap-write-needs-dataflow",
        evidenceState: isConstructorSeed && instruction === 0xf900566a ? "evidence-found" : "candidate-unproven",
        includesParticleMask: false,
        exactLayoutBParticleFlagProducer: false,
        mutationSummary: isConstructorSeed
          ? "64-bit seed stores 0x0000000200000000 at object+0xa8, so initial object+0xac is 2"
          : "write overlaps object+0xac inside the layout B function family, but no local evidence proves particle mask 0x200",
        renderPromotionAllowed: false,
      });
    }
  }
  return rows;
}

function nearestPreviousAcLoad(context, store) {
  return [...context]
    .reverse()
    .find((row) => {
      if (row.address >= store.address) return false;
      const instruction = Number.parseInt(row.instructionHex, 16);
      if (((instruction & 0xffc00000) >>> 0) !== 0xb9400000) return false;
      const immediate = ((instruction >>> 10) & 0xfff) * 4;
      return immediate === 0xac && (instruction & 0x1f) === store.rt;
    });
}

function fieldPathLoadsNearStore(buffer, elf, context) {
  const registerAddresses = new Map();
  const strings = [];
  for (const row of context) {
    const instruction = Number.parseInt(row.instructionHex, 16);
    const adrp = parseAdrp(instruction, row.address);
    if (adrp) {
      registerAddresses.set(adrp.register, adrp.address);
      continue;
    }
    const add = parseAddImmediate(instruction);
    if (add && registerAddresses.has(add.source)) {
      const value = registerAddresses.get(add.source) + add.immediate;
      registerAddresses.set(add.destination, value);
      const stringValue = readCStringAtVirtualAddress(buffer, elf, value);
      if (stringValue) {
        strings.push({
          register: add.destination,
          addressHex: hex(value),
          value: stringValue,
        });
      }
    }
  }
  return strings;
}

function absoluteBaseAddressNearStore(buffer, elf, context, baseRegister, storeAddress) {
  const registerAddresses = new Map();
  for (const row of context) {
    if (row.address >= storeAddress) break;
    const instruction = Number.parseInt(row.instructionHex, 16);
    const adrp = parseAdrp(instruction, row.address);
    if (adrp) {
      registerAddresses.set(adrp.register, adrp.address);
      continue;
    }
    const add = parseAddImmediate(instruction);
    if (add && registerAddresses.has(add.source)) {
      registerAddresses.set(add.destination, registerAddresses.get(add.source) + add.immediate);
    }
  }
  const baseAddress = registerAddresses.get(baseRegister);
  if (baseAddress === undefined) return null;
  const section = sectionForVirtualAddress(elf, baseAddress);
  return {
    address: baseAddress,
    addressHex: hex(baseAddress),
    section: section?.name || "",
  };
}

function storeClassification({ buffer, elf, store }) {
  const context = contextInstructions(buffer, elf, store.address);
  const fieldPaths = fieldPathLoadsNearStore(buffer, elf, context);
  if (store.rn === 31) {
    return {
      classification: "stack-frame-false-positive",
      evidenceState: "rejected",
      includesParticleMask: false,
      exactLayoutBParticleFlagProducer: false,
      mutationSummary: "store targets sp+0xac, not an object field",
      fieldPaths,
      context,
    };
  }

  if (store.rt === 31) {
    return {
      classification: "zero-reset-non-producer",
      evidenceState: "evidence-found",
      includesParticleMask: false,
      exactLayoutBParticleFlagProducer: false,
      mutationSummary: "store writes wzr to object+0xac, so it clears the field rather than producing particle mask 0x200",
      fieldPaths,
      context,
    };
  }

  const previousLoad = nearestPreviousAcLoad(context, store);
  const absoluteBaseAddress = absoluteBaseAddressNearStore(buffer, elf, context, store.rn, store.address);
  if (absoluteBaseAddress && [".bss", ".data", ".data.rel.ro"].includes(absoluteBaseAddress.section)) {
    return {
      classification: "global-static-table-store-not-object",
      evidenceState: "evidence-found",
      includesParticleMask: false,
      exactLayoutBParticleFlagProducer: false,
      mutationSummary: `base register resolves to ${absoluteBaseAddress.section} ${absoluteBaseAddress.addressHex}, so this is a static/global table store rather than an object field`,
      previousLoadAddressHex: previousLoad?.addressHex || "",
      fieldPaths,
      context,
    };
  }

  if (activeChildSelectorStoreAddresses.has(store.address)) {
    return {
      classification: "active-child-selector-state-not-layout-b",
      evidenceState: "evidence-found",
      includesParticleMask: false,
      exactLayoutBParticleFlagProducer: false,
      mutationAddressHex: "0x9a26d8",
      mutationInstructionHex: instructionAt(buffer, elf, 0x9a26d8)?.toString(16).padStart(8, "0") || "",
      mutationSummary:
        "selector routine stores the caller child id into +0xac, matches children by record+0xd8, and toggles child vtable +0x158; this is selected-child state, not the layout B particle flag mask",
      previousLoadAddressHex: previousLoad?.addressHex || "",
      fieldPaths,
      context,
    };
  }

  const writer = [...context]
    .reverse()
    .find((row) => row.address < store.address && row.mutationEffect?.destination === store.rt);
  const effect = writer?.mutationEffect || null;
  const includesParticleMask = Boolean(effect?.mask && (effect.mask & particleMask));

  if (effect) {
    if (effect.operation === "counter-add" || effect.operation === "counter-sub") {
      return {
        classification: "counter-update-not-layout-b",
        evidenceState: "evidence-found",
        includesParticleMask: false,
        exactLayoutBParticleFlagProducer: false,
        mutationAddressHex: writer.addressHex,
        mutationInstructionHex: writer.instructionHex,
        mutationSummary: effect.summary,
        previousLoadAddressHex: previousLoad?.addressHex || "",
        fieldPaths,
        context,
      };
    }
    const candidateOnly =
      includesParticleMask && (effect.operation === "bfi-copy" || effect.operation === "orr-set") && store.address !== layoutBConstructorSeedAddress;
    return {
      classification: candidateOnly ? "particle-mask-candidate-not-layout-b" : "non-particle-flag-mutation",
      evidenceState: candidateOnly ? "candidate-unproven" : "evidence-found",
      includesParticleMask,
      exactLayoutBParticleFlagProducer: false,
      mutationAddressHex: writer.addressHex,
      mutationInstructionHex: writer.instructionHex,
      mutationSummary: effect.summary,
      previousLoadAddressHex: previousLoad?.addressHex || "",
      fieldPaths,
      context,
    };
  }

  const previousCall = [...context].reverse().find((row) => row.address < store.address && row.branch?.mode === "bl");
  const fieldPathText = fieldPaths.map((row) => row.value).join(" | ");
  const unrelatedFieldPath = /skillProgressionInfo|rankedElo|rankedSkillTier/i.test(fieldPathText);
  const effectResourceFieldPath = /\bEffect_|\.pfx\b|ingame-effects/i.test(fieldPathText);
  const constantValue = constantForRegisterBeforeStore(context, store.rt, store.address);
  if (effectResourceFieldPath && constantValue !== null) {
    return {
      classification: "full-field-replacement-effect-resource-scalar-not-layout-b",
      evidenceState: "evidence-found",
      includesParticleMask: false,
      exactLayoutBParticleFlagProducer: false,
      mutationAddressHex: "",
      mutationInstructionHex: "",
      mutationSummary: `effect resource constructor stores scalar constant 0x${constantValue.toString(16)} (${float32FromU32(constantValue).toFixed(6)}) into +0xac`,
      previousLoadAddressHex: previousLoad?.addressHex || "",
      fieldPaths,
      context,
    };
  }
  if (/^\*Alpha\*$/i.test(fieldPathText)) {
    return {
      classification: "material-alpha-field-not-layout-b",
      evidenceState: "evidence-found",
      includesParticleMask: false,
      exactLayoutBParticleFlagProducer: false,
      mutationAddressHex: previousCall?.addressHex || "",
      mutationInstructionHex: previousCall?.instructionHex || "",
      mutationSummary: "material alpha helper return is stored into +0xac; this is not the layout B particle flag field",
      previousLoadAddressHex: previousLoad?.addressHex || "",
      fieldPaths,
      context,
    };
  }
  if (constantValue !== null && (constantValue & particleMask) === 0) {
    return {
      classification: "scalar-constant-field-not-layout-b",
      evidenceState: "evidence-found",
      includesParticleMask: false,
      exactLayoutBParticleFlagProducer: false,
      mutationAddressHex: "",
      mutationInstructionHex: "",
      mutationSummary: `stores scalar/control constant 0x${constantValue.toString(16)} (${float32FromU32(constantValue).toFixed(6)}) into +0xac, not particle mask 0x200`,
      previousLoadAddressHex: previousLoad?.addressHex || "",
      fieldPaths,
      context,
    };
  }
  return {
    classification: unrelatedFieldPath
      ? "full-field-replacement-unrelated-config"
      : effectResourceFieldPath
        ? "full-field-replacement-effect-resource-needs-owner"
        : "full-field-replacement-unknown-owner",
    evidenceState: unrelatedFieldPath ? "rejected" : "needs-owner-trace",
    includesParticleMask: false,
    exactLayoutBParticleFlagProducer: false,
    mutationAddressHex: previousCall?.addressHex || "",
    mutationInstructionHex: previousCall?.instructionHex || "",
    mutationSummary: previousCall
      ? `store uses a helper return near ${previousCall.branch.targetHex}`
      : "store replaces the entire +0xac field without a recovered local bit mutation",
    previousLoadAddressHex: previousLoad?.addressHex || "",
    fieldPaths,
    context,
  };
}

function itemForStore(buffer, elf, store) {
  const classification = storeClassification({ buffer, elf, store });
  return {
    id: `store-${store.addressHex}`,
    address: store.address,
    addressHex: store.addressHex,
    accessKind: store.accessKind,
    baseRegister: store.rn === 31 ? "sp" : `x${store.rn}`,
    valueRegister: `w${store.rt}`,
    instructionHex: store.instructionHex,
    producerClass: classification.classification,
    evidenceState: classification.evidenceState,
    includesParticleMask: classification.includesParticleMask,
    exactLayoutBParticleFlagProducer: classification.exactLayoutBParticleFlagProducer,
    mutationAddressHex: classification.mutationAddressHex || "",
    mutationInstructionHex: classification.mutationInstructionHex || "",
    mutationSummary: classification.mutationSummary,
    previousLoadAddressHex: classification.previousLoadAddressHex || "",
    fieldPath: classification.fieldPaths.map((row) => row.value).join(" | "),
    fieldPathAddressHex: classification.fieldPaths.map((row) => row.addressHex).join(" | "),
    renderPromotionAllowed: false,
  };
}

function explicitLayoutBConstructorSeedRow(buffer, elf) {
  const instruction = instructionAt(buffer, elf, layoutBConstructorSeedAddress);
  return {
    id: "layout-b-constructor-seed-0x8d2dbc",
    address: layoutBConstructorSeedAddress,
    addressHex: hex(layoutBConstructorSeedAddress),
    accessKind: "str-x",
    baseRegister: "x19",
    valueRegister: "x10",
    instructionHex: instruction === null ? "" : instruction.toString(16).padStart(8, "0"),
    producerClass: "layout-b-constructor-initial-seed",
    evidenceState: instruction === 0xf900566a ? "evidence-found" : "opcode-mismatch",
    includesParticleMask: false,
    exactLayoutBParticleFlagProducer: false,
    mutationAddressHex: "0x8d2dac",
    mutationInstructionHex: instructionAt(buffer, elf, 0x8d2dac)?.toString(16).padStart(8, "0") || "",
    mutationSummary: "64-bit seed stores 0x0000000200000000 at object+0xa8, so initial object+0xac is 2",
    previousLoadAddressHex: "",
    fieldPath: "",
    fieldPathAddressHex: "",
    renderPromotionAllowed: false,
  };
}

function accessReadRows(accessRows) {
  return accessRows
    .filter((row) => row.accessKind === "ldr-w" && [layoutBRegistrationReadAddress, layoutBDispatchReadAddress].includes(row.address))
    .map((row) => ({
      id: row.address === layoutBRegistrationReadAddress ? "layout-b-registration-read" : "layout-b-dispatch-read",
      address: row.address,
      addressHex: row.addressHex,
      instructionHex: row.instructionHex,
      role:
        row.address === layoutBRegistrationReadAddress
          ? "layout B registration reads object+0xac flags before add-record"
          : "layout B dispatch reloads object+0xac before manager flag refresh",
      evidenceState: "evidence-found",
    }));
}

function increment(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
}

function buildCurrentNativeLayoutBFlagProducerAudit({ binaryPath = defaultBinary } = {}, generatedAt = new Date().toISOString()) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const accessRows = scanObjectFlagAcAccesses(buffer, elf);
  const storeItems = accessRows
    .filter((row) => row.accessKind === "str-w")
    .map((row) => itemForStore(buffer, elf, row));
  const constructorSeed = explicitLayoutBConstructorSeedRow(buffer, elf);
  const layoutBFamilyFlagOverlapWrites = scanLayoutBFamilyFlagOverlapWrites(buffer, elf);
  const items = [constructorSeed, ...storeItems].sort((left, right) => left.address - right.address);
  const byProducerClass = {};
  const byEvidenceState = {};
  for (const item of items) {
    increment(byProducerClass, item.producerClass);
    increment(byEvidenceState, item.evidenceState);
  }
  const exactLayoutBParticleFlagProducerRows = items.filter((row) => row.exactLayoutBParticleFlagProducer).length;
  const summary = {
    accessRows: accessRows.length,
    loadRows: accessRows.filter((row) => row.accessKind === "ldr-w").length,
    storeRows: storeItems.length,
    itemRows: items.length,
    stackFrameFalsePositiveRows: storeItems.filter((row) => row.producerClass === "stack-frame-false-positive").length,
    nonParticleFlagMutationRows: storeItems.filter((row) => row.producerClass === "non-particle-flag-mutation").length,
    particleMaskCandidateNotLayoutBRows: storeItems.filter((row) => row.producerClass === "particle-mask-candidate-not-layout-b").length,
    fullFieldReplacementRows: storeItems.filter((row) => row.producerClass.startsWith("full-field-replacement")).length,
    zeroResetNonProducerRows: storeItems.filter((row) => row.producerClass === "zero-reset-non-producer").length,
    fullFieldReplacementEffectResourceRows: storeItems.filter(
      (row) =>
        row.producerClass === "full-field-replacement-effect-resource-needs-owner" ||
        row.producerClass === "full-field-replacement-effect-resource-scalar-not-layout-b",
    ).length,
    fullFieldReplacementEffectResourceScalarRows: storeItems.filter(
      (row) => row.producerClass === "full-field-replacement-effect-resource-scalar-not-layout-b",
    ).length,
    fullFieldReplacementUnknownOwnerRows: storeItems.filter((row) => row.producerClass === "full-field-replacement-unknown-owner")
      .length,
    globalStaticTableStoreRows: storeItems.filter((row) => row.producerClass === "global-static-table-store-not-object").length,
    activeChildSelectorStateNotLayoutBRows: storeItems.filter(
      (row) => row.producerClass === "active-child-selector-state-not-layout-b",
    ).length,
    counterUpdateNotLayoutBRows: storeItems.filter((row) => row.producerClass === "counter-update-not-layout-b").length,
    scalarConstantNotLayoutBRows: storeItems.filter((row) => row.producerClass === "scalar-constant-field-not-layout-b").length,
    materialAlphaFieldNotLayoutBRows: storeItems.filter((row) => row.producerClass === "material-alpha-field-not-layout-b").length,
    fullFieldReplacementUnrelatedConfigRows: storeItems.filter(
      (row) => row.producerClass === "full-field-replacement-unrelated-config",
    ).length,
    layoutBKnownReadRows: accessReadRows(accessRows).length,
    layoutBConstructorSeedRows: constructorSeed.evidenceState === "evidence-found" ? 1 : 0,
    layoutBFamilyFlagOverlapWriteRows: layoutBFamilyFlagOverlapWrites.length,
    layoutBFamilyFlagOverlapNonConstructorRows: layoutBFamilyFlagOverlapWrites.filter(
      (row) => row.address !== layoutBConstructorSeedAddress,
    ).length,
    layoutBFamilyWideParticleMaskProducerRows: layoutBFamilyFlagOverlapWrites.filter(
      (row) => row.exactLayoutBParticleFlagProducer,
    ).length,
    exactLayoutBParticleFlagProducerRows,
    renderPromotionAllowedRows: 0,
    byProducerClass,
    byEvidenceState,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only object+0xac producer classification; do not enable particle/effect rendering from this until an exact 0x118 layout B producer for bit 0x200 and the concrete PFX/emitter owner are recovered",
    particleMask: hex(particleMask),
    summary,
    knownLayoutBReads: accessReadRows(accessRows),
    interpretation: {
      layoutB:
        "Current Android layout B reads object+0xac at registration and dispatch, but this audit still finds zero exact stores that prove bit 0x200 is written for the 0x118 layout B object.",
      layoutBFamilyWidthScan:
        "Within the recovered layout B registration/refresh function family, the only non-32-bit write overlapping object+0xac is the constructor seed at 0x8d2dbc, which makes the initial value 2.",
      rejectedCandidates:
        "Local bit mutations either touch bits 2/3/4, update packed bits 7..14 in candidate-only paths, target sp+0xac, or replace unrelated config fields.",
      nextRequiredEvidence:
        "Trace the create/activate owner that allocates the 0x118 layout B object and prove where its object+0xac receives the particle draw bit 0x200 before manager registration/refresh.",
    },
    layoutBFamilyFlagOverlapWrites,
    items,
  };
}

function exportCurrentNativeLayoutBFlagProducerAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBFlagProducerAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "id",
    "addressHex",
    "accessKind",
    "baseRegister",
    "valueRegister",
    "instructionHex",
    "producerClass",
    "evidenceState",
    "includesParticleMask",
    "exactLayoutBParticleFlagProducer",
    "mutationAddressHex",
    "mutationInstructionHex",
    "mutationSummary",
    "previousLoadAddressHex",
    "fieldPath",
    "fieldPathAddressHex",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBFlagProducerAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBFlagProducerAudit,
  exportCurrentNativeLayoutBFlagProducerAudit,
  scanObjectFlagAcAccesses,
};
