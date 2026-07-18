#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-object-ac-candidate-disqualification-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_object_ac_candidate_disqualification_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_object_ac_candidate_disqualification_audit.tsv";

const directCallerTargets = [0x8cb1ec, 0x8cb3f8, 0x8cff24, 0x8cfbec, 0x8d014c, 0x8cb108, 0x8cb180, 0x8cb418];

const pointerSpecs = [
  {
    address: 0x26c88d0,
    role: "type210-primary-vtable-slot-0",
    expectedPointer: 0x8cb1ec,
    evidence: "The vtable group used by the 0x210 family points to the 0x8cb1ec local object callback.",
  },
  {
    address: 0x26c88d8,
    role: "type210-primary-vtable-render-callback",
    expectedPointer: 0x8cb418,
    evidence: "The same vtable group points to the local render/update callback that reaches the 0x210 primitive builder.",
  },
  {
    address: 0x26c8990,
    role: "type210-secondary-thunk",
    expectedPointer: 0x8cb3f8,
    evidence: "The secondary table points to the thunk that subtracts 0x28 and tail-calls 0x8cb1ec.",
  },
];

const opcodeSpecs = [
  [0x8cb0dc, "type210-literal", "5280420b", "The type factory materializes type size/id literal 0x210."],
  [0x8cb100, "type210-global-index-store", "b9009909", "The type factory stores the 0x210 type index in global 0x3035098."],
  [0x8cc3f4, "levelvisuals-static-lensflare-list", "f9402e78", "LevelVisuals apply processor reads LevelVisuals +0x58 static lens-flare list."],
  [0x8cc414, "levelvisuals-type210-global-load", "b9409b21", "The static lens-flare path loads the 0x3035098 type index."],
  [0x8cc484, "levelvisuals-type210-primary-helper", "97fffb21", "LevelVisuals static lens-flare entries route through helper 0x8cb108."],
  [0x8cc4e4, "levelvisuals-type210-secondary-helper", "97fffb27", "LevelVisuals static lens-flare entries route through helper 0x8cb180."],
  [0x8cb3a8, "type210-candidate-reload-object-ac", "b940ae68", "The 0x210 object callback reloads object +0xac before the broad mask write."],
  [0x8cb3b8, "type210-candidate-orr-bits-7-14", "32191d08", "The 0x210 object callback can set bits 7..14, a broad mask containing 0x200."],
  [0x8cb3c0, "type210-candidate-store-object-ac", "b900ae68", "The 0x210 object callback stores the broad mask back to object +0xac."],
  [0x8cb3c4, "type210-candidate-dirty-helper", "97fd4762", "The 0x210 object callback marks the local object transform state dirty."],
  [0x94adbc, "hud-minimap-string-page", "d0008ad6", "HUD_Minimap constructor materializes the HUD_Minimap literal page."],
  [0x94adc0, "hud-minimap-string-add", "91386ad6", "HUD_Minimap constructor completes the HUD_Minimap literal address."],
  [0x94adf0, "hud-minimap-current-owner-index-load", "b9426500", "HUD_Minimap constructor reads current-owner registry index 0x3035264."],
  [0x94afb8, "hud-minimap-attach-current-owner", "97fe13db", "HUD_Minimap update calls current owner attach 0x8cff24."],
  [0x8cff24, "current-owner-attach-entry", "6dbc23e9", "The current-owner attach function starts at 0x8cff24."],
  [0x8cff38, "current-owner-attach-store-external-object", "f9041401", "The attach function stores the external object at owner +0x828."],
  [0x8cff64, "current-owner-attach-transform-subobject", "9100a276", "The attach function uses owner +0x28 as transform state for dirtying."],
  [0x8cff94, "current-owner-candidate-load-object-ac", "b940ae68", "The attach function reads owner +0xac before copying bits 7..14."],
  [0x8cffac, "current-owner-candidate-bfi-bits-7-14", "33191d28", "The attach function copies a value into bits 7..14, a broad mask containing 0x200."],
  [0x8cffb4, "current-owner-candidate-store-object-ac", "b900ae68", "The attach function stores the copied bits back to owner +0xac."],
  [0x8cffb8, "current-owner-candidate-dirty-helper", "97fd3465", "The attach function marks the owner +0x28 transform state dirty."],
  [0x8cffcc, "current-owner-candidate-material-helper", "94151841", "The attach function proceeds into current owner display/material state updates."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ address, role, expectedOpcodeHex, evidence }));

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function pointerHex(value) {
  return typeof value === "bigint" ? `0x${value.toString(16)}` : "";
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

function instructionAt(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 4);
  return fileOffset >= 0 ? buffer.readUInt32LE(fileOffset) : null;
}

function pointerAt(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 8);
  return fileOffset >= 0 ? buffer.readBigUInt64LE(fileOffset) : null;
}

function readCStringAtVirtualAddress(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 1);
  if (fileOffset < 0) return "";
  let end = fileOffset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  return buffer.subarray(fileOffset, end).toString("utf8");
}

function parseBranch(instruction, pc) {
  const opcode = (instruction & 0xfc000000) >>> 0;
  if (opcode !== 0x94000000 && opcode !== 0x14000000) return null;
  return {
    mode: opcode === 0x94000000 ? "bl" : "b-tail",
    target: pc + signExtend(instruction & 0x03ffffff, 26) * 4,
  };
}

function opcodeRows(buffer, elf) {
  return opcodeSpecs.map((spec) => {
    const instruction = instructionAt(buffer, elf, spec.address);
    const actualOpcodeHex = instruction === null ? "" : instruction.toString(16).padStart(8, "0");
    return {
      stage: spec.role.startsWith("type210") || spec.role.startsWith("levelvisuals") ? "type210-levelvisuals" : "hud-minimap-current-owner",
      role: spec.role,
      addressHex: hex(spec.address),
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function pointerRows(buffer, elf) {
  return pointerSpecs.map((spec) => {
    const actualPointer = pointerAt(buffer, elf, spec.address);
    const expectedPointer = BigInt(spec.expectedPointer);
    return {
      stage: "type210-vtable",
      role: spec.role,
      addressHex: hex(spec.address),
      expectedPointerHex: hex(spec.expectedPointer),
      actualPointerHex: pointerHex(actualPointer),
      pointerMatches: actualPointer === expectedPointer,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function directCallerRows(buffer, elf) {
  const text = elf.sections.find((section) => section.name === ".text") || elf.loads[0];
  const targetSet = new Set(directCallerTargets);
  const rows = [];
  const start = text.virtualAddress;
  const end = text.virtualAddress + (text.size || text.fileSize);
  for (let address = start; address < end; address += 4) {
    const instruction = instructionAt(buffer, elf, address);
    if (instruction === null) continue;
    const branch = parseBranch(instruction, address);
    if (!branch || !targetSet.has(branch.target)) continue;
    rows.push({
      callerHex: hex(address),
      opcodeHex: instruction.toString(16).padStart(8, "0"),
      mode: branch.mode,
      targetHex: hex(branch.target),
      renderPromotionAllowed: false,
    });
  }
  return rows;
}

function hasMatchedRole(rows, role) {
  return rows.some((row) => row.role === role && row.opcodeMatches);
}

function buildCandidateRows({ opcodes, pointers, callers, hudMinimapLiteral }) {
  const type210EvidenceRecovered =
    hasMatchedRole(opcodes, "levelvisuals-static-lensflare-list") &&
    hasMatchedRole(opcodes, "levelvisuals-type210-global-load") &&
    callers.some((row) => row.callerHex === "0x8cc484" && row.targetHex === "0x8cb108") &&
    callers.some((row) => row.callerHex === "0x8cc4e4" && row.targetHex === "0x8cb180") &&
    pointers.every((row) => row.pointerMatches);
  const hudMinimapEvidenceRecovered =
    hudMinimapLiteral === "HUD_Minimap" &&
    hasMatchedRole(opcodes, "hud-minimap-current-owner-index-load") &&
    callers.some((row) => row.callerHex === "0x94afb8" && row.targetHex === "0x8cff24");

  return [
    {
      storeAddressHex: "0x8cb3c0",
      classification: type210EvidenceRecovered ? "type210-levelvisuals-lensflare-not-layout-b" : "unresolved",
      includesParticleMaskCandidate: true,
      exactLayoutBParticleFlagProducer: false,
      renderPromotionAllowed: false,
      evidence:
        "The 0x8cb3c0 broad bits 7..14 write belongs to the 0x210 object family: LevelVisuals +0x58 static lens-flare route, global 0x3035098, helpers 0x8cb108/0x8cb180, and vtable pointers 0x26c88d0/0x26c88d8/0x26c8990.",
    },
    {
      storeAddressHex: "0x8cffb4",
      classification: hudMinimapEvidenceRecovered ? "hud-minimap-current-owner-not-layout-b" : "unresolved",
      includesParticleMaskCandidate: true,
      exactLayoutBParticleFlagProducer: false,
      renderPromotionAllowed: false,
      evidence:
        "The 0x8cffb4 broad bits 7..14 write is reached by HUD_Minimap update at 0x94afb8 through current-owner attach 0x8cff24, after constructor code materializes the HUD_Minimap literal and reads registry index 0x3035264.",
    },
  ];
}

function buildCurrentNativeLayoutBObjectAcCandidateDisqualificationAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const opcodes = opcodeRows(buffer, elf);
  const pointers = pointerRows(buffer, elf);
  const callers = directCallerRows(buffer, elf);
  const hudMinimapLiteral = readCStringAtVirtualAddress(buffer, elf, 0x1aa4e1a);
  const candidates = buildCandidateRows({ opcodes, pointers, callers, hudMinimapLiteral });
  const summary = {
    candidateRows: candidates.length,
    disqualifiedCandidateRows: candidates.filter((row) => row.classification !== "unresolved").length,
    type210LevelVisualsLensFlareDisqualifiedRows: candidates.filter(
      (row) => row.classification === "type210-levelvisuals-lensflare-not-layout-b",
    ).length,
    hudMinimapCurrentOwnerDisqualifiedRows: candidates.filter((row) => row.classification === "hud-minimap-current-owner-not-layout-b")
      .length,
    opcodeRows: opcodes.length,
    opcodeMismatchRows: opcodes.filter((row) => !row.opcodeMatches).length,
    pointerRows: pointers.length,
    pointerMismatchRows: pointers.filter((row) => !row.pointerMatches).length,
    directCallerRows: callers.length,
    exactLayoutBParticleFlagProducerRows: 0,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only object +0xac broad particle-mask candidates audit; disqualifies false positives and does not enable rendering",
    hudMinimapLiteral,
    summary,
    interpretation: {
      type210:
        "The 0x8cb3c0 candidate is a broad +0xac bits 7..14 write, but current binary evidence ties the owner to LevelVisuals static lens-flare 0x210 objects.",
      hudMinimap:
        "The 0x8cffb4 candidate is a broad +0xac bits 7..14 write, but its proven direct caller is HUD_Minimap current-owner attach/update.",
      boundary:
        "Both broad 0x200-looking candidates are not the exact layout B particle flag producer; the real layout B producer remains unresolved.",
    },
    unresolved: [
      "the exact producer that writes the layout B object +0xac particle bit in the 0x118 PFX manager path",
      "whether the remaining producer is indirect, table-dispatched, or only visible through runtime capture",
      "the semantic names for the state/action timeline that activates hero PFX entries before final draw submission",
    ],
    candidateRows: candidates,
    opcodeRows: opcodes,
    pointerRows: pointers,
    directCallerRows: callers,
  };
}

function exportCurrentNativeLayoutBObjectAcCandidateDisqualificationAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBObjectAcCandidateDisqualificationAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.candidateRows, [
    "storeAddressHex",
    "classification",
    "includesParticleMaskCandidate",
    "exactLayoutBParticleFlagProducer",
    "renderPromotionAllowed",
    "evidence",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBObjectAcCandidateDisqualificationAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBObjectAcCandidateDisqualificationAudit,
  exportCurrentNativeLayoutBObjectAcCandidateDisqualificationAudit,
};
