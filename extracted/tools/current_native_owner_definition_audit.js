#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");
const { findDirectBranchCallers } = require("./current_native_light_probe_chain_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-owner-definition-audit.json";
const defaultJsonOut = "extracted/reports/current_native_owner_definition_audit.json";
const defaultTsvOut = "extracted/reports/current_native_owner_definition_audit.tsv";

const defaultTargets = [
  {
    name: "menu-mesh-owner-definition-attach",
    virtualAddress: 0x9f83ac,
    role:
      "stores the loaded definition object at owner +0x1a0; the current menu mesh light/probe writer later reads that same field",
  },
];

const resourceLoaderAddress = 0xc72dc8;

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

function readCStringAtVirtualAddress(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf.loads, virtualAddress);
  if (fileOffset < 0) return "";
  const section = sectionForVirtualAddress(elf.sections, virtualAddress);
  if (section?.name !== ".rodata") return "";
  let end = fileOffset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  const value = buffer.subarray(fileOffset, end).toString("utf8");
  return /^[\x20-\x7e]{1,220}$/.test(value) ? value : "";
}

function parseAdrp(instruction, pc) {
  if (((instruction & 0x9f000000) >>> 0) !== 0x90000000) return null;
  const immlo = (instruction >>> 29) & 0x3;
  const immhi = (instruction >>> 5) & 0x7ffff;
  return {
    register: instruction & 0x1f,
    page: (pc & ~0xfff) + signExtend((immhi << 2) | immlo, 21) * 0x1000,
  };
}

function parseAdr(instruction, pc) {
  if (((instruction & 0x9f000000) >>> 0) !== 0x10000000) return null;
  const immlo = (instruction >>> 29) & 0x3;
  const immhi = (instruction >>> 5) & 0x7ffff;
  return {
    register: instruction & 0x1f,
    address: pc + signExtend((immhi << 2) | immlo, 21),
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

function classifyOwnerDefinitionStrings(strings) {
  const joined = strings.join(" ");
  if (/LootCardRep3D|heroArt_|cardArt_/i.test(joined)) return "loot-card-or-hero-card-ui-definition";
  if (/TalentCoinRep3D/i.test(joined)) return "talent-coin-ui-definition";
  if (/KindredMenuGuild/i.test(joined)) return "guild-menu-definition";
  if (/KindredMenuChest|REWARD_CHEST/i.test(joined)) return "chest-reward-menu-definition";
  if (/KindredMenuAscensionDial/i.test(joined)) return "ascension-menu-definition";
  if (/KindredMenu/i.test(joined)) return "kindred-menu-definition";
  if (/MENU_|GUILD_|DIAL|MAIN|IDLE|rare|gold|black_background/i.test(joined)) return "menu-ui-definition";
  if (/Hero|Character|Skin/i.test(joined)) return "hero-or-character-like-definition";
  return strings.length ? "other-definition" : "unclassified";
}

function scanCallsiteContext(buffer, elf, callerAddress, beforeBytes = 0x140, afterBytes = 0x60) {
  const registerValues = new Map();
  const stringReferences = [];
  const resourceRequests = [];
  const start = callerAddress - beforeBytes;
  const end = callerAddress + afterBytes;

  for (let pc = start; pc < end; pc += 4) {
    const fileOffset = fileOffsetForVirtualAddress(elf.loads, pc, 4);
    if (fileOffset < 0) continue;
    const instruction = buffer.readUInt32LE(fileOffset);
    const adrp = parseAdrp(instruction, pc);
    if (adrp) {
      registerValues.set(adrp.register, { page: adrp.page });
      continue;
    }
    const adr = parseAdr(instruction, pc);
    if (adr) {
      registerValues.set(adr.register, { address: adr.address });
      const value = readCStringAtVirtualAddress(buffer, elf, adr.address);
      if (value) {
        stringReferences.push({
          pc,
          pcHex: hex(pc),
          register: `x${adr.register}`,
          address: adr.address,
          addressHex: hex(adr.address),
          value,
        });
      }
      continue;
    }
    const add = parseAddImmediate(instruction);
    if (add && registerValues.get(add.source)?.page !== undefined) {
      const address = registerValues.get(add.source).page + add.immediate;
      registerValues.set(add.destination, { address });
      const value = readCStringAtVirtualAddress(buffer, elf, address);
      if (value) {
        stringReferences.push({
          pc,
          pcHex: hex(pc),
          register: `x${add.destination}`,
          address,
          addressHex: hex(address),
          value,
        });
      }
      continue;
    }
    const branch = parseBranch(instruction, pc);
    if (branch?.target === resourceLoaderAddress) {
      const x1 = registerValues.get(1);
      const value = x1?.address ? readCStringAtVirtualAddress(buffer, elf, x1.address) : "";
      if (value) {
        resourceRequests.push({
          pc,
          pcHex: hex(pc),
          loaderAddress: hex(resourceLoaderAddress),
          address: x1.address,
          addressHex: hex(x1.address),
          value,
        });
      }
    }
  }

  const uniqueStringReferences = [];
  const seenStrings = new Set();
  for (const reference of stringReferences) {
    const key = `${reference.addressHex}:${reference.value}`;
    if (seenStrings.has(key)) continue;
    seenStrings.add(key);
    uniqueStringReferences.push(reference);
  }

  return {
    stringReferences: uniqueStringReferences,
    resourceRequests,
  };
}

function recordForTarget(buffer, elf, target) {
  const callers = findDirectBranchCallers(buffer, elf, target.virtualAddress).map((caller) => {
    const context = scanCallsiteContext(buffer, elf, caller.callerAddress);
    const strings = [
      ...new Set([
        ...context.resourceRequests.map((request) => request.value),
        ...context.stringReferences.map((reference) => reference.value),
      ]),
    ];
    return {
      ...caller,
      classification: classifyOwnerDefinitionStrings(strings),
      resourceRequests: context.resourceRequests,
      stringReferences: context.stringReferences,
    };
  });
  return {
    name: target.name,
    role: target.role,
    virtualAddress: target.virtualAddress,
    virtualAddressHex: hex(target.virtualAddress),
    callers,
  };
}

function summarize(records) {
  const callers = records.flatMap((record) => record.callers || []);
  const allResourceRequests = [
    ...new Set(callers.flatMap((caller) => caller.resourceRequests || []).map((request) => request.value)),
  ].sort();
  const classificationCounts = {};
  for (const caller of callers) {
    classificationCounts[caller.classification] = (classificationCounts[caller.classification] || 0) + 1;
  }
  const nonMenuClassifications = Object.keys(classificationCounts).filter(
    (classification) => !/menu|ui|card|coin|chest|ascension|guild/.test(classification),
  );
  return {
    targets: records.length,
    callerCount: callers.length,
    resourceRequestCount: callers.reduce((sum, caller) => sum + (caller.resourceRequests?.length || 0), 0),
    uniqueResourceRequestCount: allResourceRequests.length,
    classificationCounts,
    nonMenuClassificationCount: nonMenuClassifications.reduce(
      (sum, classification) => sum + classificationCounts[classification],
      0,
    ),
    allResourceRequests,
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

function tsvRows(manifest) {
  return (manifest.records || []).flatMap((record) =>
    (record.callers || []).map((caller) => ({
      targetName: record.name,
      targetAddress: record.virtualAddressHex,
      callerAddress: caller.callerAddressHex,
      mode: caller.mode,
      classification: caller.classification,
      resourceRequests: (caller.resourceRequests || []).map((request) => request.value).join("; "),
      stringReferences: (caller.stringReferences || []).map((reference) => reference.value).join("; "),
    })),
  );
}

function exportCurrentNativeOwnerDefinitionAudit({
  binaryPath = defaultBinary,
  targets = defaultTargets,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const records = targets.map((target) => recordForTarget(buffer, elf, target));
  const manifest = {
    generatedAt: new Date().toISOString(),
    binaryPath,
    policy:
      "diagnostic-only current-binary owner-definition callsite audit; menu/UI classifications are negative evidence against using this chain as a hero character lighting profile",
    resourceLoaderAddress: hex(resourceLoaderAddress),
    summary: summarize(records),
    records,
  };
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, tsvRows(manifest), [
    "targetName",
    "targetAddress",
    "callerAddress",
    "mode",
    "classification",
    "resourceRequests",
    "stringReferences",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeOwnerDefinitionAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  defaultTargets,
  exportCurrentNativeOwnerDefinitionAudit,
  scanCallsiteContext,
};
