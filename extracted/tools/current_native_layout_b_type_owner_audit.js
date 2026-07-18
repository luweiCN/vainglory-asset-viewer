#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64, scanTextReferences } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-type-owner-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_type_owner_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_type_owner_audit.tsv";

const layoutBTypeLiteral = 0x118;
const layoutBTypeRegistrationFunction = 0x8d2f44;
const layoutBTypeIndexGlobalAddress = 0x2d44ea8;
const layoutBFamilyStart = 0x8d2d00;
const layoutBFamilyEnd = 0x8d5100;

const helperTargets = new Map([
  [0x188b8b8, "create-resolve-helper"],
  [0x188e2ac, "query-or-allocate-helper"],
  [0x188b830, "stack-query-helper"],
]);

const contextByReadAddress = new Map([
  [0x886b64, ["create-layout-b-owned-instance", "loads type index into w1, calls 0x188b8b8, then configures the returned layout B object"]],
  [0x8a97a4, ["query-layout-b-instance-variant-a", "loads type index into w0, calls 0x188e2ac, then applies layout B setup and refresh gate"]],
  [0x8a9d4c, ["query-layout-b-instance-variant-b", "loads type index into w0, calls 0x188e2ac, then applies layout B setup and refresh gate"]],
  [0x8ae040, ["conditional-create-layout-b-instance", "conditional branch loads type index into w1 and calls 0x188b8b8"]],
  [0x8ae050, ["conditional-query-layout-b-instance", "alternate branch loads type index into w0 and calls 0x188e2ac"]],
  [0x8af6e8, ["create-layout-b-instance-before-setup", "loads type index into w1, calls 0x188b8b8, then applies layout B setup calls"]],
  [0x8cced8, ["create-layout-b-instance-for-effect-owner", "loads type index into w1, calls 0x188b8b8, then applies layout B setup calls"]],
  [0x97df38, ["query-layout-b-instance-no-local-setup", "loads type index into w0 and calls 0x188e2ac; no nearby layout B family setup call in the bounded scan"]],
  [0x99290c, ["query-layout-b-instance-before-shape-read", "loads type index before 0x188e2ac and later calls layout B shape reader 0x8d42b4"]],
  [0xbab2cc, ["query-layout-b-instance-in-shared-branch", "loads type index into w0 and calls 0x188e2ac in a shared query/create branch"]],
  [0xbab2e0, ["create-layout-b-instance-in-shared-branch", "loads type index into w1 and calls 0x188b8b8 in a shared query/create branch"]],
  [0xbab748, ["stack-query-layout-b-instance", "loads type index into w3, sets w2=0x100, calls 0x188b830, then reads parameters through layout B 0x8d4f5c"]],
]);

const opcodeChecks = [
  { address: 0x8d2f8c, expectedHex: "5280230b", role: "layout-b-type-literal-mov" },
  { address: 0x8d2f90, expectedHex: "2914ad49", role: "layout-b-type-record-store" },
  { address: 0x8d2fbc, expectedHex: "b90ea909", role: "layout-b-type-index-global-store" },
  { address: 0x886b74, expectedHex: "94401351", role: "layout-b-create-helper-call" },
  { address: 0x8a97ac, expectedHex: "943f92c0", role: "layout-b-query-helper-call" },
  { address: 0x8a9d54, expectedHex: "943f9156", role: "layout-b-query-helper-call" },
  { address: 0x8ae048, expectedHex: "943f761c", role: "layout-b-conditional-create-helper-call" },
  { address: 0x8ae058, expectedHex: "943f8095", role: "layout-b-conditional-query-helper-call" },
  { address: 0x8af6f0, expectedHex: "943f7072", role: "layout-b-create-helper-call" },
  { address: 0x8ccef4, expectedHex: "943efa71", role: "layout-b-create-helper-call" },
  { address: 0x97df40, expectedHex: "943c40db", role: "layout-b-query-helper-call" },
  { address: 0x992924, expectedHex: "943bee62", role: "layout-b-query-helper-call" },
  { address: 0xbab2d4, expectedHex: "94338bf6", role: "layout-b-shared-query-helper-call" },
  { address: 0xbab2e4, expectedHex: "94338175", role: "layout-b-shared-create-helper-call" },
  { address: 0xbab754, expectedHex: "94338037", role: "layout-b-stack-query-helper-call" },
];

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

function instructionAt(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 4);
  return fileOffset >= 0 ? buffer.readUInt32LE(fileOffset) : null;
}

function parseBranch(instruction, pc) {
  const opcode = (instruction & 0xfc000000) >>> 0;
  if (opcode !== 0x94000000 && opcode !== 0x14000000) return null;
  return {
    mode: opcode === 0x94000000 ? "bl" : "b-tail",
    target: pc + signExtend(instruction & 0x03ffffff, 26) * 4,
  };
}

function isLayoutBFamilyTarget(address) {
  return address >= layoutBFamilyStart && address < layoutBFamilyEnd;
}

function branchRowsNearRead(buffer, elf, readAddress) {
  const rows = [];
  for (let address = readAddress - 0x20; address <= readAddress + 0xc0; address += 4) {
    const instruction = instructionAt(buffer, elf, address);
    if (instruction === null) continue;
    const branch = parseBranch(instruction, address);
    if (!branch) continue;
    const helperClass = helperTargets.get(branch.target) || "";
    const layoutBFamilyCall = isLayoutBFamilyTarget(branch.target);
    if (!helperClass && !layoutBFamilyCall) continue;
    rows.push({
      address,
      addressHex: hex(address),
      instructionHex: instruction.toString(16).padStart(8, "0"),
      mode: branch.mode,
      target: branch.target,
      targetHex: hex(branch.target),
      helperClass,
      layoutBFamilyCall,
    });
  }
  return rows;
}

function helperCallForRead(branchRows, readAddress) {
  return branchRows
    .filter((row) => row.address >= readAddress && row.helperClass)
    .sort((left, right) => left.address - right.address)[0] || null;
}

function opcodeEvidence(buffer, elf) {
  return opcodeChecks.map((check) => {
    const instruction = instructionAt(buffer, elf, check.address);
    const actualHex = instruction === null ? "" : instruction.toString(16).padStart(8, "0");
    return {
      address: check.address,
      addressHex: hex(check.address),
      role: check.role,
      expectedHex: check.expectedHex,
      actualHex,
      matches: actualHex === check.expectedHex,
    };
  });
}

function itemForReference(buffer, elf, reference) {
  const branchRows = branchRowsNearRead(buffer, elf, reference.xrefAddress);
  const helperCall = helperCallForRead(branchRows, reference.xrefAddress);
  const [contextRole, contextEvidence] = contextByReadAddress.get(reference.xrefAddress) || [
    "unclassified-layout-b-type-index-read",
    "no recovered local owner context",
  ];
  const ownerClass = helperCall?.helperClass || "unclassified-layout-b-type-index-read";
  const layoutBFamilyCalls = branchRows.filter((row) => row.layoutBFamilyCall);
  return {
    id: `layout-b-type-read-${hex(reference.xrefAddress)}`,
    xrefAddress: reference.xrefAddress,
    xrefAddressHex: hex(reference.xrefAddress),
    mode: reference.mode,
    baseAddressHex: hex(reference.baseAddress),
    baseInstructionHex: reference.baseInstructionHex,
    useInstructionHex: reference.useInstructionHex,
    useRegister: reference.useRegister === null || reference.useRegister === undefined ? "" : `w${reference.useRegister}`,
    ownerClass,
    contextRole,
    contextEvidence,
    helperCallAddressHex: helperCall?.addressHex || "",
    helperInstructionHex: helperCall?.instructionHex || "",
    helperTargetHex: helperCall?.targetHex || "",
    layoutBFamilyCallCount: layoutBFamilyCalls.length,
    layoutBFamilyCallTargetsHex: [...new Set(layoutBFamilyCalls.map((row) => row.targetHex))].join(" | "),
    layoutBFamilyCallAddressesHex: layoutBFamilyCalls.map((row) => row.addressHex).join(" | "),
    renderPromotionAllowed: false,
  };
}

function buildCurrentNativeLayoutBTypeOwnerAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const references = scanTextReferences(buffer, elf, [
    {
      name: "layout-b-type-index-global",
      kind: "global",
      virtualAddress: layoutBTypeIndexGlobalAddress,
      section: ".bss",
    },
  ]).sort((left, right) => left.xrefAddress - right.xrefAddress);
  const items = references.map((reference) => itemForReference(buffer, elf, reference));
  const opcodes = opcodeEvidence(buffer, elf);
  const summary = {
    typeIndexReadRows: items.length,
    createResolveReadRows: items.filter((row) => row.ownerClass === "create-resolve-helper").length,
    queryAllocateReadRows: items.filter((row) => row.ownerClass === "query-or-allocate-helper").length,
    stackQueryReadRows: items.filter((row) => row.ownerClass === "stack-query-helper").length,
    layoutBFamilyCallReadRows: items.filter((row) => row.layoutBFamilyCallCount > 0).length,
    unclassifiedReadRows: items.filter((row) => row.ownerClass === "unclassified-layout-b-type-index-read").length,
    opcodeRows: opcodes.length,
    opcodeMismatchRows: opcodes.filter((row) => !row.matches).length,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B type owner audit; type-index create/query ownership does not prove particle visibility, PFX ownership, or renderer promotion",
    layoutBTypeLiteral: hex(layoutBTypeLiteral),
    layoutBTypeRegistrationFunctionHex: hex(layoutBTypeRegistrationFunction),
    layoutBTypeIndexGlobalAddressHex: hex(layoutBTypeIndexGlobalAddress),
    summary,
    interpretation: {
      completeReadScan:
        "All current .text reads of the layout B 0x118 type-index global are classified into create/resolve, query/allocate, or stack-query helper paths.",
      ownerBoundary:
        "This closes the type owner entry points but not the runtime render boundary. The exact object+0xac particle mask producer and concrete PFX/emitter owner remain separate blockers.",
      stackQueryPath:
        "The 0xbab748 path uses the type index as w3 with w2=0x100 for 0x188b830, then reads parameters through layout B 0x8d4f5c; it is not a create/resolve call.",
    },
    unresolved: [
      "the exact producer that writes particle draw mask 0x200 into the live layout B object+0xac",
      "the concrete PFX/emitter object stored behind manager record +0x8",
      "the lifecycle/timeline condition that makes a queried layout B object visible in the render manager",
    ],
    opcodes,
    items,
  };
}

function exportCurrentNativeLayoutBTypeOwnerAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBTypeOwnerAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "id",
    "xrefAddressHex",
    "mode",
    "baseAddressHex",
    "baseInstructionHex",
    "useInstructionHex",
    "useRegister",
    "ownerClass",
    "contextRole",
    "contextEvidence",
    "helperCallAddressHex",
    "helperInstructionHex",
    "helperTargetHex",
    "layoutBFamilyCallCount",
    "layoutBFamilyCallTargetsHex",
    "layoutBFamilyCallAddressesHex",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBTypeOwnerAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBTypeOwnerAudit,
  exportCurrentNativeLayoutBTypeOwnerAudit,
};
