#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-component-slot-registration-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_component_slot_registration_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_component_slot_registration_audit.tsv";

const registrationOpcodeSpecs = [
  [0x8bacc4, "owner-registration-caller", "component-slot-registration-call", "97ffbf44"],
  [0x8aa9e0, "component-slot-registration-entry", "type-count-offset-low", "5287f608"],
  [0x8aa9e4, "component-slot-registration-entry", "type-count-offset-high", "72a00028"],
  [0x8aa9e8, "component-slot-registration-entry", "type-index-load", "b8686809"],
  [0x8aa9ec, "component-slot-registration-entry", "type-record-stride", "52805d0a"],
  [0x8aaa10, "component-slot-registration-entry", "type-index-global-load", "b942d948"],
  [0x8aaa2c, "component-slot-registration-entry", "type-index-global-store", "b902d948"],
  [0x8aaa50, "component-slot-registration-entry", "primary-slot-installer-call", "943f8629"],
  [0x8aaa6c, "component-slot-registration-entry", "secondary-slot-installer-call", "943f8635"],
  [0x8aaa88, "component-slot-registration-entry", "secondary-slot-installer-call", "943f862e"],
  [0x8aaaa4, "component-slot-registration-entry", "secondary-slot-installer-call", "943f8627"],
  [0x8aaac0, "component-slot-registration-entry", "secondary-slot-installer-call", "943f8620"],
  [0x8aaadc, "component-slot-registration-entry", "secondary-slot-installer-call", "943f8619"],
  [0x8aaaf8, "component-slot-registration-entry", "secondary-slot-installer-call", "943f8612"],
  [0x8aab14, "component-slot-registration-entry", "secondary-slot-installer-call", "943f860b"],
  [0x8aab30, "component-slot-registration-entry", "secondary-slot-installer-call", "943f8604"],
  [0x8aab4c, "component-slot-registration-entry", "secondary-slot-installer-call", "943f85fd"],
  [0x8aab68, "component-slot-registration-entry", "secondary-slot-installer-call", "943f85f6"],
  [0x8aab84, "component-slot-registration-entry", "secondary-slot-installer-call", "943f85ef"],
  [0x8aaba0, "component-slot-registration-entry", "secondary-slot-installer-call", "943f85e8"],
  [0x8aabbc, "component-slot-registration-entry", "secondary-slot-installer-call", "943f85e1"],
  [0x8aabe0, "component-slot-registration-entry", "secondary-slot-installer-tail", "143f85d8"],
];

const dispatchTableBase = 0x26c78d0;
const dispatchTableEntryCount = 48;
const classifiedTargets = new Map([
  [0x8aa8f0, "component-method-table-installer"],
  [0x8aa960, "component-method-table-installer-wrapper"],
  [0x8abe6c, "source-program-upstream-entry"],
  [0x8adf58, "full-caller-struct-wrapper"],
  [0x8ae14c, "full-caller-struct-wrapper"],
  [0x8ae1e8, "full-caller-struct-wrapper"],
  [0x8ae9a8, "compact-stack-hash-wrapper"],
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

function sectionNameForVirtualAddress(elf, virtualAddress) {
  return (
    elf.sections.find(
      (section) => virtualAddress >= section.virtualAddress && virtualAddress < section.virtualAddress + section.size,
    )?.name || ""
  );
}

function opcodeRows(buffer, elf) {
  return registrationOpcodeSpecs.map(([address, blockId, role, expectedOpcodeHex]) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      source: "opcode-evidence",
      address,
      addressHex: hex(address),
      tableAddressHex: "",
      blockId,
      role,
      expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === expectedOpcodeHex,
      targetHex: "",
      sectionName: "",
      entryClass: "",
      renderPromotionAllowed: false,
      evidence: "current Android opcode validates component slot registration path",
    };
  });
}

function tableRows(buffer, elf) {
  const rows = [];
  for (let index = 0; index < dispatchTableEntryCount; index += 1) {
    const tableAddress = dispatchTableBase + index * 8;
    const fileOffset = fileOffsetForVirtualAddress(elf, tableAddress, 8);
    const target = fileOffset >= 0 ? Number(buffer.readBigUInt64LE(fileOffset)) : -1;
    const entryClass = classifiedTargets.get(target) || "other-component-dispatch";
    rows.push({
      source: "dispatch-table-entry",
      address: tableAddress,
      addressHex: "",
      tableAddressHex: hex(tableAddress),
      blockId: "",
      role: `component-dispatch-slot-${index}`,
      expectedOpcodeHex: "",
      actualOpcodeHex: "",
      opcodeMatches: true,
      target,
      targetHex: hex(target),
      sectionName: sectionNameForVirtualAddress(elf, target),
      entryClass,
      renderPromotionAllowed: false,
      evidence:
        entryClass === "full-caller-struct-wrapper"
          ? "dispatch slot routes to a wrapper that reads caller struct high control fields"
          : "dispatch slot is recorded for ownership/routing only",
    });
  }
  return rows;
}

function buildCurrentNativeLayoutBComponentSlotRegistrationAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const opcodes = opcodeRows(buffer, elf);
  const dispatchRows = tableRows(buffer, elf);
  const summary = {
    opcodeRows: opcodes.length,
    opcodeMismatchRows: opcodes.filter((row) => !row.opcodeMatches).length,
    ownerRegistrationCallerRows: opcodes.filter((row) => row.role === "component-slot-registration-call" && row.opcodeMatches).length,
    typeIndexPublishRows: opcodes.filter((row) => row.role === "type-index-global-store" && row.opcodeMatches).length,
    primarySlotInstallerRows: opcodes.filter((row) => row.role === "primary-slot-installer-call" && row.opcodeMatches).length,
    secondarySlotInstallerRows: opcodes.filter((row) => row.role === "secondary-slot-installer-call" && row.opcodeMatches).length,
    tailSlotInstallerRows: opcodes.filter((row) => row.role === "secondary-slot-installer-tail" && row.opcodeMatches).length,
    slotInstallerRows: opcodes.filter((row) => row.role.includes("slot-installer") && row.opcodeMatches).length,
    dispatchTableRows: dispatchRows.length,
    fullCallerStructDispatchRows: dispatchRows.filter((row) => row.entryClass === "full-caller-struct-wrapper").length,
    compactStackHashDispatchRows: dispatchRows.filter((row) => row.entryClass === "compact-stack-hash-wrapper").length,
    sourceProgramUpstreamDispatchRows: dispatchRows.filter((row) => row.entryClass === "source-program-upstream-entry").length,
    dispatchRowsInText: dispatchRows.filter((row) => row.sectionName === ".text").length,
    callerStructRuntimeProducerRows: 0,
    directObjectAcProducerRows: 0,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B component slot-registration audit; closes dispatch ownership without proving caller-struct runtime values",
    dispatchTableBaseHex: hex(dispatchTableBase),
    summary,
    interpretation: {
      recovered:
        "The owner registration path calls 0x8aa9d4, publishes the component type index, installs 15 slot callbacks through 0x188c2f4/0x188c340, and owns the primary dispatch table at 0x26c78d0.",
      dispatchBoundary:
        "The dispatch table contains the three full caller-struct wrappers at slots 22..24 and the compact stack/hash wrapper at slot 33. This closes routing ownership for those wrappers.",
      remainingBoundary:
        "This still does not recover the runtime producer of the caller struct passed into full wrappers and does not write layout B object+0xac.",
    },
    items: [...opcodes, ...dispatchRows],
  };
}

function exportCurrentNativeLayoutBComponentSlotRegistrationAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBComponentSlotRegistrationAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "source",
    "addressHex",
    "tableAddressHex",
    "blockId",
    "role",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "targetHex",
    "sectionName",
    "entryClass",
    "callerStructRuntimeProducerRows",
    "directObjectAcProducerRows",
    "renderPromotionAllowed",
    "evidence",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBComponentSlotRegistrationAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBComponentSlotRegistrationAudit,
  exportCurrentNativeLayoutBComponentSlotRegistrationAudit,
};
