#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultCurrentFieldReaderCallsiteContextAuditPath =
  "extracted/reports/effect_projectile_current_field_reader_callsite_context_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-token-child-object-chain-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_token_child_object_chain_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_token_child_object_chain_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function parseHex(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").trim();
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  if (/^[0-9a-f]+$/i.test(text)) return Number.parseInt(text, 16);
  return NaN;
}

function parseNumber(value) {
  const text = String(value || "").replace(/^#/, "").trim();
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);
  return NaN;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function normalizeHex(value) {
  return hex(parseHex(value));
}

function uniqueInOrder(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function pipeValues(value) {
  if (Array.isArray(value)) return uniqueInOrder(value);
  return uniqueInOrder(String(value || "").split("|").filter(Boolean));
}

function tsvEscape(value) {
  return Array.isArray(value)
    ? value.join("|").replace(/\t/g, " ").replace(/\r?\n/g, " ")
    : String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows || []) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function readTsv(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function readJson(filePath, fallback = {}) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readCStringFromBinaryBuffer(buffer, addressHex, maxLength = 512) {
  const start = parseHex(addressHex);
  if (!buffer || !Number.isFinite(start) || start < 0 || start >= buffer.length) return "";
  let end = start;
  while (end < buffer.length && end - start < maxLength && buffer[end] !== 0) end += 1;
  if (end <= start || end >= buffer.length) return "";
  const bytes = buffer.subarray(start, end);
  if ([...bytes].some((byte) => byte < 0x20 || byte > 0x7e)) return "";
  return bytes.toString("utf8");
}

function parseObjdumpInstructions(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map(parseObjdumpInstructionLine)
    .filter(Boolean);
}

function defaultDisassembleWindow(binaryPath, startAddressHex, endAddressHex) {
  const start = parseHex(startAddressHex);
  const parsedEnd = parseHex(endAddressHex);
  const stop = Number.isFinite(parsedEnd) && parsedEnd > start ? parsedEnd + 4 : start + 0x500;
  const result = spawnSync(
    "objdump",
    [
      "-d",
      "--no-show-raw-insn",
      `--start-address=0x${start.toString(16)}`,
      `--stop-address=0x${stop.toString(16)}`,
      binaryPath,
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `objdump failed for ${startAddressHex}`);
  }
  return result.stdout;
}

function defaultDisassembleFunction(binaryPath, addressHex, byteLength = 0x160) {
  const start = parseHex(addressHex);
  const stop = start + byteLength;
  const result = spawnSync(
    "objdump",
    [
      "-d",
      "--no-show-raw-insn",
      `--start-address=0x${start.toString(16)}`,
      `--stop-address=0x${stop.toString(16)}`,
      binaryPath,
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `objdump failed for ${addressHex}`);
  }
  return result.stdout;
}

function defaultReadRelativeRelocations(binaryPath) {
  const result = spawnSync("objdump", ["-R", binaryPath], { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "objdump -R failed");
  }
  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^([0-9a-f]+)\s+R_AARCH64_RELATIVE\s+\*ABS\*\+0x([0-9a-f]+)/i);
      if (!match) return null;
      return { addressHex: hex(Number.parseInt(match[1], 16)), targetHex: hex(Number.parseInt(match[2], 16)) };
    })
    .filter(Boolean);
}

function relocationMap(relativeRelocations) {
  const result = new Map();
  for (const row of relativeRelocations || []) {
    const addressHex = normalizeHex(row.addressHex ?? row.address);
    const targetHex = normalizeHex(row.targetHex ?? row.target);
    if (addressHex && targetHex) result.set(addressHex, targetHex);
  }
  return result;
}

function boundedFunctionInstructions(output, startAddressHex) {
  const startAddress = parseHex(startAddressHex);
  const instructions = parseObjdumpInstructions(output).filter((instruction) => instruction.address >= startAddress);
  const bounded = [];
  for (const instruction of instructions) {
    bounded.push(instruction);
    if (instruction.mnemonic === "ret") break;
  }
  return bounded;
}

function branchCallTarget(instruction) {
  if (instruction?.mnemonic !== "bl") return "";
  return normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || "");
}

function directBranchTarget(instruction) {
  if (!["b", "bl"].includes(instruction?.mnemonic)) return "";
  return normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || "");
}

function branchCallTargets(instructions) {
  return uniqueInOrder((instructions || []).map(branchCallTarget).filter(Boolean));
}

function fieldOffsetsForBase(instructions, baseRegister) {
  const regex = new RegExp(`\\[${baseRegister}(?:,\\s*#(0x[0-9a-fA-F]+|\\d+))?\\]`);
  return uniqueInOrder(
    (instructions || [])
      .filter((instruction) => /^(ldr|str|stp)$/.test(instruction.mnemonic))
      .map((instruction) => {
        const match = instruction.operands.match(regex);
        return match ? hex(match[1] ? parseNumber(match[1]) : 0) : "";
      })
      .filter(Boolean),
  );
}

function trackConstantRegisters(instructions) {
  const constants = new Map();
  const primaryStores = [];
  const secondaryStores = [];

  for (const instruction of instructions || []) {
    const operands = instruction.operands.trim();
    if (instruction.mnemonic === "adrp") {
      const match = operands.match(/^(x\d+),\s*(0x[0-9a-fA-F]+)(?:\s|$)/);
      if (match) constants.set(match[1].toLowerCase(), parseHex(match[2]));
      continue;
    }
    if (instruction.mnemonic === "add") {
      const match = operands.match(/^(x\d+),\s*(x\d+),\s*#(0x[0-9a-fA-F]+|\d+)$/);
      if (match && constants.has(match[2].toLowerCase())) {
        constants.set(match[1].toLowerCase(), constants.get(match[2].toLowerCase()) + parseNumber(match[3]));
      }
      continue;
    }
    if (instruction.mnemonic === "str") {
      const match = operands.match(/^(x\d+),\s*\[(x0|x8|x20)(?:,\s*#(0x[0-9a-fA-F]+|\d+))?\]$/);
      if (!match || !constants.has(match[1].toLowerCase())) continue;
      const store = {
        offsetHex: match[3] ? hex(parseNumber(match[3])) : "0x0",
        valueHex: hex(constants.get(match[1].toLowerCase())),
        instructionText: instruction.text,
      };
      if (store.offsetHex === "0x0") primaryStores.push(store);
      if (store.offsetHex === "0x10") secondaryStores.push(store);
      continue;
    }
    if (instruction.mnemonic === "stp") {
      const match = operands.match(/^(x\d+),\s*xzr,\s*\[(x0|x8|x20)\]$/);
      if (!match || !constants.has(match[1].toLowerCase())) continue;
      primaryStores.push({
        offsetHex: "0x0",
        valueHex: hex(constants.get(match[1].toLowerCase())),
        instructionText: instruction.text,
      });
    }
  }

  return {
    primaryVtableAddressHex: primaryStores.at(-1)?.valueHex || "",
    secondaryVtableAddressHex: secondaryStores.at(-1)?.valueHex || "",
    primaryVtableStoreInstruction: primaryStores.at(-1)?.instructionText || "",
    secondaryVtableStoreInstruction: secondaryStores.at(-1)?.instructionText || "",
  };
}

function constantRegisterValues(instructions) {
  const constants = new Map();
  for (const instruction of instructions || []) {
    const operands = instruction.operands.trim();
    if (instruction.mnemonic === "adrp") {
      const match = operands.match(/^(x\d+),\s*(0x[0-9a-fA-F]+)(?:\s|$)/);
      if (match) constants.set(match[1].toLowerCase(), parseHex(match[2]));
      continue;
    }
    if (instruction.mnemonic === "add") {
      const match = operands.match(/^(x\d+),\s*(x\d+),\s*#(0x[0-9a-fA-F]+|\d+)$/);
      if (match && constants.has(match[2].toLowerCase())) {
        constants.set(match[1].toLowerCase(), constants.get(match[2].toLowerCase()) + parseNumber(match[3]));
      }
    }
  }
  return constants;
}

function analyzeAllocatorVtableStores(allocatorTargetHex, { disassembleFunction }, depth = 0, visited = new Set()) {
  if (!allocatorTargetHex) return {};
  if (depth > 4 || visited.has(allocatorTargetHex)) return {};
  visited.add(allocatorTargetHex);
  const wrapperInstructions = boundedFunctionInstructions(disassembleFunction(allocatorTargetHex, 0x220), allocatorTargetHex);
  const wrapperStores = trackConstantRegisters(wrapperInstructions);
  if (wrapperStores.primaryVtableAddressHex) {
    return {
      objectAllocatorBodyTargetHex: allocatorTargetHex,
      ...wrapperStores,
    };
  }
  for (const bodyTargetHex of branchCallTargets(wrapperInstructions)) {
    const nestedStores = analyzeAllocatorVtableStores(bodyTargetHex, { disassembleFunction }, depth + 1, visited);
    if (nestedStores.primaryVtableAddressHex) {
      return nestedStores;
    }
  }
  return {
    objectAllocatorBodyTargetHex: "",
    ...wrapperStores,
  };
}

function analyzeObjectAppendTarget(targetHex, { disassembleFunction }) {
  const instructions = boundedFunctionInstructions(disassembleFunction(targetHex), targetHex);
  const objectListOffsets = fieldOffsetsForBase(instructions, "x19");
  if (!objectListOffsets.includes("0x0") || !objectListOffsets.includes("0x8") || !objectListOffsets.includes("0x10")) {
    return null;
  }
  const objectAllocatorTargetHex = branchCallTargets(instructions)[0] || "";
  return {
    objectAppendTargetHex: targetHex,
    objectAllocatorTargetHex,
    objectListOffsets,
    ...analyzeAllocatorVtableStores(objectAllocatorTargetHex, { disassembleFunction }),
  };
}

function classifyPayloadPointerStoreDelegate(instructions) {
  const hasPointerStore = instructions.some(
    (instruction) => instruction.mnemonic === "str" && instruction.operands.trim() === "x1, [x0, #0x8]",
  );
  const hasFlagLoad = instructions.some(
    (instruction) => instruction.mnemonic === "ldrb" && /\[x0,\s*#0x39\]/.test(instruction.operands.trim()),
  );
  const hasFlagStore = instructions.some(
    (instruction) => instruction.mnemonic === "strb" && /\[x0,\s*#0x39\]/.test(instruction.operands.trim()),
  );
  const hasReturn = instructions.some((instruction) => instruction.mnemonic === "ret");
  if (!hasPointerStore || !hasFlagLoad || !hasFlagStore || !hasReturn) {
    return { delegateClassName: "unclassified-delegate", delegateWrites: [] };
  }
  return {
    delegateClassName: "payload-pointer-store",
    delegateWrites: ["payload+0x8=x1", "payload+0x39.flags"],
  };
}

function classifyCallbackInstaller(instructions) {
  const constants = new Map();
  for (const instruction of instructions || []) {
    const operands = instruction.operands.trim();
    if (instruction.mnemonic === "adrp") {
      const match = operands.match(/^(x\d+),\s*(0x[0-9a-fA-F]+)(?:\s|$)/);
      if (match) constants.set(match[1].toLowerCase(), parseHex(match[2]));
      continue;
    }
    if (instruction.mnemonic === "add") {
      const match = operands.match(/^(x\d+),\s*(x\d+),\s*#(0x[0-9a-fA-F]+|\d+)$/);
      if (match && constants.has(match[2].toLowerCase())) {
        constants.set(match[1].toLowerCase(), constants.get(match[2].toLowerCase()) + parseNumber(match[3]));
      }
      continue;
    }
    if (instruction.mnemonic !== "str") continue;
    const match = operands.match(/^(x\d+),\s*\[x0,\s*#(0x78|0x88)\]$/i);
    if (!match || !constants.has(match[1].toLowerCase())) continue;
    return {
      className: "callback-installer",
      callbackFunctionHex: hex(constants.get(match[1].toLowerCase())),
      callbackSlotOffsetHex: normalizeHex(match[2]),
      callbackInstallerWrites: [`object+${normalizeHex(match[2])}=callback`],
    };
  }
  return null;
}

function classifyPayloadModeSetter(instructions) {
  const payloadAdd = (instructions || []).find((instruction) => {
    if (instruction.mnemonic !== "add") return false;
    return /^x8,\s*x0,\s*#(0x[0-9a-fA-F]+|\d+)$/.test(instruction.operands.trim());
  });
  const payloadMatch = payloadAdd?.operands.trim().match(/^x8,\s*x0,\s*#(0x[0-9a-fA-F]+|\d+)$/);
  const movesPayloadToReturn = (instructions || []).some(
    (instruction) => instruction.mnemonic === "mov" && instruction.operands.trim() === "x0, x8",
  );
  const modeStore = (instructions || []).find(
    (instruction) => instruction.mnemonic === "strh" && instruction.operands.trim() === "w9, [x0, #0xc8]",
  );
  if (!payloadMatch || !movesPayloadToReturn || !modeStore) return null;
  const argumentStore = (instructions || []).find(
    (instruction) => instruction.mnemonic === "str" && instruction.operands.trim() === "x1, [x0, #0x40]",
  );
  return {
    className: "payload-mode-setter",
    payloadOffsetHex: hex(parseNumber(payloadMatch[1])),
    argumentStoreOffsetHex: argumentStore ? "0x40" : "",
    modeFlagOffsetHex: "0xc8",
  };
}

function classifyResolvedFunction(instructions, { disassembleFunction = () => "" } = {}) {
  if (!instructions.length) return { className: "missing-disassembly", accessorOffsetHex: "" };
  const first = instructions[0];
  if (first.mnemonic === "ret") return { className: "ret-only", accessorOffsetHex: "" };
  if (first.mnemonic === "b" && first.operands.includes("_ZdlPv")) return { className: "delete-branch", accessorOffsetHex: "" };
  const callbackInstaller = classifyCallbackInstaller(instructions);
  if (callbackInstaller) return { accessorOffsetHex: "", ...callbackInstaller };
  const payloadModeSetter = classifyPayloadModeSetter(instructions);
  if (payloadModeSetter) return { accessorOffsetHex: "", ...payloadModeSetter };
  if (first.mnemonic === "add") {
    const match = first.operands.match(/^x0,\s*x0,\s*#(0x[0-9a-fA-F]+|\d+)$/);
    if (match && instructions[1]?.mnemonic === "ret") {
      return { className: "accessor-add-x0", accessorOffsetHex: hex(parseNumber(match[1])) };
    }
    if (match && instructions[1]?.mnemonic === "b") {
      const delegateFunctionHex = directBranchTarget(instructions[1]);
      const delegateInstructions = delegateFunctionHex
        ? boundedFunctionInstructions(disassembleFunction(delegateFunctionHex, 0x80), delegateFunctionHex)
        : [];
      const delegate = classifyPayloadPointerStoreDelegate(delegateInstructions);
      if (delegate.delegateClassName === "payload-pointer-store") {
        return {
          className: "payload-pointer-setter",
          accessorOffsetHex: "",
          payloadOffsetHex: hex(parseNumber(match[1])),
          delegateFunctionHex,
          delegateFunctionClass: delegate.delegateClassName,
          delegateWrites: delegate.delegateWrites,
          delegateInstructions: delegateInstructions.slice(0, 8).map((instruction) => instruction.text),
        };
      }
    }
  }
  return { className: "unclassified-function", accessorOffsetHex: "" };
}

function resolveFollowingSlot(primaryVtableAddressHex, slotOffsetHex, { relocations, disassembleFunction }) {
  const primaryVtableAddress = parseHex(primaryVtableAddressHex);
  const slotOffset = parseHex(slotOffsetHex);
  const slotAddressHex = hex(primaryVtableAddress + slotOffset);
  const functionHex = relocations.get(slotAddressHex) || "";
  const instructions = functionHex ? boundedFunctionInstructions(disassembleFunction(functionHex, 0x80), functionHex) : [];
  const classification = classifyResolvedFunction(instructions, { disassembleFunction });
  return {
    resolvedFollowingSlotAddressHex: slotAddressHex,
    resolvedFollowingSlotFunctionHex: functionHex,
    resolvedFollowingSlotFunctionClass: functionHex ? classification.className : "missing-relocation",
    resolvedFollowingSlotAccessorOffsetHex: classification.accessorOffsetHex,
    resolvedFollowingSlotPayloadOffsetHex: classification.payloadOffsetHex || "",
    resolvedFollowingSlotArgumentStoreOffsetHex: classification.argumentStoreOffsetHex || "",
    resolvedFollowingSlotModeFlagOffsetHex: classification.modeFlagOffsetHex || "",
    resolvedFollowingSlotCallbackFunctionHex: classification.callbackFunctionHex || "",
    resolvedFollowingSlotCallbackSlotOffsetHex: classification.callbackSlotOffsetHex || "",
    resolvedFollowingSlotCallbackInstallerWrites: classification.callbackInstallerWrites || [],
    resolvedFollowingSlotDelegateFunctionHex: classification.delegateFunctionHex || "",
    resolvedFollowingSlotDelegateFunctionClass: classification.delegateFunctionClass || "",
    resolvedFollowingSlotDelegateWrites: classification.delegateWrites || [],
    resolvedFollowingSlotDelegateInstructions: classification.delegateInstructions || [],
    resolvedFollowingSlotFunctionInstructions: instructions.slice(0, 4).map((instruction) => instruction.text),
  };
}

function objectRegisterAfterAppend(instructions, callIndex) {
  for (const instruction of instructions.slice(callIndex + 1, callIndex + 5)) {
    if (instruction.mnemonic !== "mov") continue;
    const match = instruction.operands.trim().match(/^(x\d+),\s*x0$/);
    if (match) return match[1].toLowerCase();
  }
  return "x0";
}

function followingVtableSlots(instructions, callIndex, { readCString = () => "" } = {}) {
  const objectRegister = objectRegisterAfterAppend(instructions, callIndex);
  const segment = [];
  for (const instruction of instructions.slice(callIndex + 1)) {
    if (instruction.mnemonic === "bl") break;
    segment.push(instruction);
  }
  const slots = [];
  for (let index = 0; index < segment.length; index += 1) {
    const instruction = segment[index];
    if (instruction.mnemonic !== "blr" || instruction.operands.trim().toLowerCase() !== "x8") continue;
    const previous = segment.slice(Math.max(0, index - 8), index);
    const loadedObjectVtable = previous.some(
      (candidate) => candidate.mnemonic === "ldr" && candidate.operands.trim() === `x8, [${objectRegister}]`,
    );
    if (!loadedObjectVtable) continue;
    const slotLoad = [...previous]
      .reverse()
      .find((candidate) => candidate.mnemonic === "ldr" && /^x8,\s*\[x8,\s*#/.test(candidate.operands.trim()));
    const match = slotLoad?.operands.trim().match(/^x8,\s*\[x8,\s*#(0x[0-9a-fA-F]+|\d+)\]$/);
    if (match) {
      const constants = constantRegisterValues(previous);
      const argument1AddressHex = constants.has("x1") ? hex(constants.get("x1")) : "";
      slots.push({
        followingVtableSlotOffsetHex: hex(parseNumber(match[1])),
        objectRegister,
        followingArgument1AddressHex: argument1AddressHex,
        followingArgument1CString: argument1AddressHex ? readCString(argument1AddressHex) : "",
        slotLoadInstruction: slotLoad.text,
        callInstruction: instruction.text,
      });
    }
  }
  return slots;
}

function statusForResolvedSlot(className) {
  if (className === "ret-only" || className === "delete-branch" || className === "accessor-add-x0") {
    return "token-child-object-following-slot-noop";
  }
  if (className === "payload-pointer-setter") return "token-child-object-following-slot-payload-setter";
  if (className === "callback-installer") return "token-child-object-following-slot-callback-installer";
  if (className === "payload-mode-setter") return "token-child-object-following-slot-payload-mode-setter";
  if (className === "missing-relocation") return "token-child-object-following-slot-missing-relocation";
  return "token-child-object-following-slot-unclassified";
}

function resolvedSlotConsumesArgument1(slot, resolved) {
  if (["payload-pointer-setter", "payload-mode-setter"].includes(resolved.resolvedFollowingSlotFunctionClass)) return true;
  const instructionText = [
    ...(resolved.resolvedFollowingSlotFunctionInstructions || []),
    ...(resolved.resolvedFollowingSlotDelegateInstructions || []),
  ].join("\n");
  return /\bx1\b/.test(instructionText);
}

function callsiteRowsForItem(item, { disassembleWindow, disassembleFunction, relocations, readCString }) {
  if (item.status !== "current-field-reader-callsite-specific") return [];
  const disassembly = disassembleWindow(item.tokenFunctionStartHex, item.tokenFunctionEndHex, item);
  const instructions = parseObjdumpInstructions(disassembly);
  const readerCallsiteAddress = parseHex(item.callsiteAddressHex);
  const rows = [];
  const appendCache = new Map();

  for (let index = 0; index < instructions.length; index += 1) {
    const instruction = instructions[index];
    if (instruction.address <= readerCallsiteAddress) continue;
    const targetHex = branchCallTarget(instruction);
    if (!targetHex) continue;
    if (!appendCache.has(targetHex)) {
      appendCache.set(targetHex, analyzeObjectAppendTarget(targetHex, { disassembleFunction }));
    }
    const append = appendCache.get(targetHex);
    if (!append?.primaryVtableAddressHex) continue;
    const slots = followingVtableSlots(instructions, index, { readCString });
    for (const slot of slots) {
      const resolved = resolveFollowingSlot(append.primaryVtableAddressHex, slot.followingVtableSlotOffsetHex, {
        relocations,
        disassembleFunction,
      });
      const consumesArgument1 = resolvedSlotConsumesArgument1(slot, resolved);
      rows.push({
        status: statusForResolvedSlot(resolved.resolvedFollowingSlotFunctionClass),
        targetName: item.targetName || "",
        tokenFunctionStartHex: item.tokenFunctionStartHex || "",
        tokenFunctionEndHex: item.tokenFunctionEndHex || "",
        readerBranchTargetHex: item.branchTargetHex || "",
        readerCallsiteAddressHex: item.callsiteAddressHex || "",
        objectAppendCallsiteAddressHex: instruction.addressHex,
        objectAppendTargetHex: append.objectAppendTargetHex,
        objectAllocatorTargetHex: append.objectAllocatorTargetHex,
        objectAllocatorBodyTargetHex: append.objectAllocatorBodyTargetHex || "",
        objectListOffsets: append.objectListOffsets,
        primaryVtableAddressHex: append.primaryVtableAddressHex,
        secondaryVtableAddressHex: append.secondaryVtableAddressHex || "",
        primaryVtableStoreInstruction: append.primaryVtableStoreInstruction || "",
        secondaryVtableStoreInstruction: append.secondaryVtableStoreInstruction || "",
        ...slot,
        followingArgument1AddressHex: consumesArgument1 ? slot.followingArgument1AddressHex : "",
        followingArgument1CString: consumesArgument1 ? slot.followingArgument1CString : "",
        ...resolved,
        semanticConsumerResolved: false,
        renderPromotionAllowed: false,
        blocker:
          "current token child object append and following vtable slot are recovered mechanically, but projectile placement, timing, target, impact, or render semantics are not decoded",
      });
    }
  }
  return rows;
}

function summarize(items) {
  const byStatus = {};
  for (const item of items || []) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  const uniqueAppendCallsites = new Set(items.map((item) => item.objectAppendCallsiteAddressHex));
  return {
    rows: items.length,
    objectAppendRows: uniqueAppendCallsites.size,
    primaryVtableResolvedRows: items.filter((item) => item.primaryVtableAddressHex).length,
    followingSlotRows: items.filter((item) => item.followingVtableSlotOffsetHex).length,
    resolvedFollowingSlotRows: items.filter((item) => item.resolvedFollowingSlotFunctionHex).length,
    retOnlyFollowingSlotRows: items.filter((item) => item.resolvedFollowingSlotFunctionClass === "ret-only").length,
    deleteBranchFollowingSlotRows: items.filter((item) => item.resolvedFollowingSlotFunctionClass === "delete-branch")
      .length,
    accessorOnlyFollowingSlotRows: items.filter((item) => item.resolvedFollowingSlotFunctionClass === "accessor-add-x0")
      .length,
    payloadSetterFollowingSlotRows: items.filter(
      (item) => item.resolvedFollowingSlotFunctionClass === "payload-pointer-setter",
    ).length,
    callbackInstallerFollowingSlotRows: items.filter(
      (item) => item.resolvedFollowingSlotFunctionClass === "callback-installer",
    ).length,
    payloadModeSetterFollowingSlotRows: items.filter(
      (item) => item.resolvedFollowingSlotFunctionClass === "payload-mode-setter",
    ).length,
    followingArgument1StringRows: items.filter((item) => item.followingArgument1CString).length,
    nonNoopFollowingSlotRows: items.filter(
      (item) =>
        item.resolvedFollowingSlotFunctionHex &&
        !["ret-only", "delete-branch", "accessor-add-x0"].includes(item.resolvedFollowingSlotFunctionClass),
    ).length,
    semanticConsumerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildProjectileCurrentTokenChildObjectChainAudit({
  currentFieldReaderCallsiteContextAudit = {},
  disassembleWindow = () => "",
  disassembleFunction = () => "",
  readCString = () => "",
  relativeRelocations = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const relocations = relocationMap(relativeRelocations);
  const items = (currentFieldReaderCallsiteContextAudit.items || [])
    .flatMap((item) => callsiteRowsForItem(item, { disassembleWindow, disassembleFunction, relocations, readCString }))
    .sort(
      (left, right) =>
        parseHex(left.tokenFunctionStartHex) - parseHex(right.tokenFunctionStartHex) ||
        parseHex(left.objectAppendCallsiteAddressHex) - parseHex(right.objectAppendCallsiteAddressHex) ||
        parseHex(left.followingVtableSlotOffsetHex) - parseHex(right.followingVtableSlotOffsetHex),
    );
  return {
    generatedAt,
    source: {
      currentFieldReaderCallsiteContextAuditPath: defaultCurrentFieldReaderCallsiteContextAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only current projectile token child-object chain audit; append/vtable evidence does not promote rendering",
    summary: summarize(items),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    targetName: item.targetName,
    tokenFunctionStartHex: item.tokenFunctionStartHex,
    readerBranchTargetHex: item.readerBranchTargetHex,
    readerCallsiteAddressHex: item.readerCallsiteAddressHex,
    objectAppendCallsiteAddressHex: item.objectAppendCallsiteAddressHex,
    objectAppendTargetHex: item.objectAppendTargetHex,
    objectAllocatorTargetHex: item.objectAllocatorTargetHex,
    objectAllocatorBodyTargetHex: item.objectAllocatorBodyTargetHex,
    objectListOffsets: item.objectListOffsets,
    primaryVtableAddressHex: item.primaryVtableAddressHex,
    secondaryVtableAddressHex: item.secondaryVtableAddressHex,
    followingVtableSlotOffsetHex: item.followingVtableSlotOffsetHex,
    followingArgument1AddressHex: item.followingArgument1AddressHex,
    followingArgument1CString: item.followingArgument1CString,
    resolvedFollowingSlotAddressHex: item.resolvedFollowingSlotAddressHex,
    resolvedFollowingSlotFunctionHex: item.resolvedFollowingSlotFunctionHex,
    resolvedFollowingSlotFunctionClass: item.resolvedFollowingSlotFunctionClass,
    resolvedFollowingSlotPayloadOffsetHex: item.resolvedFollowingSlotPayloadOffsetHex,
    resolvedFollowingSlotArgumentStoreOffsetHex: item.resolvedFollowingSlotArgumentStoreOffsetHex,
    resolvedFollowingSlotModeFlagOffsetHex: item.resolvedFollowingSlotModeFlagOffsetHex,
    resolvedFollowingSlotCallbackFunctionHex: item.resolvedFollowingSlotCallbackFunctionHex,
    resolvedFollowingSlotCallbackSlotOffsetHex: item.resolvedFollowingSlotCallbackSlotOffsetHex,
    resolvedFollowingSlotCallbackInstallerWrites: item.resolvedFollowingSlotCallbackInstallerWrites,
    resolvedFollowingSlotDelegateFunctionHex: item.resolvedFollowingSlotDelegateFunctionHex,
    resolvedFollowingSlotDelegateFunctionClass: item.resolvedFollowingSlotDelegateFunctionClass,
    resolvedFollowingSlotDelegateWrites: item.resolvedFollowingSlotDelegateWrites,
    semanticConsumerResolved: item.semanticConsumerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileCurrentTokenChildObjectChainAudit({
  currentFieldReaderCallsiteContextAuditPath = defaultCurrentFieldReaderCallsiteContextAuditPath,
  binaryPath = defaultBinaryPath,
  currentFieldReaderCallsiteContextAudit = readJson(currentFieldReaderCallsiteContextAuditPath, {}),
  disassembleWindow = (startAddressHex, endAddressHex) => defaultDisassembleWindow(binaryPath, startAddressHex, endAddressHex),
  disassembleFunction = (addressHex, byteLength) => defaultDisassembleFunction(binaryPath, addressHex, byteLength),
  readCString,
  relativeRelocations = defaultReadRelativeRelocations(binaryPath),
  generatedAt = new Date().toISOString(),
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const binaryBuffer = readCString ? null : fs.readFileSync(binaryPath);
  const effectiveReadCString = readCString || ((addressHex) => readCStringFromBinaryBuffer(binaryBuffer, addressHex));
  const audit = buildProjectileCurrentTokenChildObjectChainAudit({
    currentFieldReaderCallsiteContextAudit,
    disassembleWindow,
    disassembleFunction,
    readCString: effectiveReadCString,
    relativeRelocations,
    generatedAt,
  });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(viewerOut, JSON.stringify(audit, null, 2));
  fs.writeFileSync(reportOut, JSON.stringify(audit, null, 2));
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "targetName",
    "tokenFunctionStartHex",
    "readerBranchTargetHex",
    "readerCallsiteAddressHex",
    "objectAppendCallsiteAddressHex",
    "objectAppendTargetHex",
    "objectAllocatorTargetHex",
    "objectAllocatorBodyTargetHex",
    "objectListOffsets",
    "primaryVtableAddressHex",
    "secondaryVtableAddressHex",
    "followingVtableSlotOffsetHex",
    "followingArgument1AddressHex",
    "followingArgument1CString",
    "resolvedFollowingSlotAddressHex",
    "resolvedFollowingSlotFunctionHex",
    "resolvedFollowingSlotFunctionClass",
    "resolvedFollowingSlotPayloadOffsetHex",
    "resolvedFollowingSlotArgumentStoreOffsetHex",
    "resolvedFollowingSlotModeFlagOffsetHex",
    "resolvedFollowingSlotCallbackFunctionHex",
    "resolvedFollowingSlotCallbackSlotOffsetHex",
    "resolvedFollowingSlotCallbackInstallerWrites",
    "resolvedFollowingSlotDelegateFunctionHex",
    "resolvedFollowingSlotDelegateFunctionClass",
    "resolvedFollowingSlotDelegateWrites",
    "semanticConsumerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentTokenChildObjectChainAudit({
    currentFieldReaderCallsiteContextAuditPath: optionValue(
      args,
      "--current-field-reader-callsite-context-audit",
      defaultCurrentFieldReaderCallsiteContextAuditPath,
    ),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  }).summary;
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentTokenChildObjectChainAudit,
  exportProjectileCurrentTokenChildObjectChainAudit,
  readTsv,
};
