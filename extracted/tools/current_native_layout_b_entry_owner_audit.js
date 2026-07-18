#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64, scanTextReferences } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-entry-owner-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_entry_owner_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_entry_owner_audit.tsv";

const ownerSlotTargets = [
  { name: "scene-entry-owner-slot-a", virtualAddress: 0x311a290, section: ".bss" },
  { name: "scene-entry-owner-slot-b", virtualAddress: 0x311a298, section: ".bss" },
];

const entryInitializerSpecs = [
  {
    address: 0x8d2d54,
    expectedHex: "9415a82a",
    fieldRole: "entry-owner-accessor-call",
    objectOffsetHex: "",
    entryOffsetHex: "",
    evidence: "layout B constructor calls 0xe3cdfc, which returns global owner slot 0x311a298",
  },
  {
    address: 0x8d2d64,
    expectedHex: "f9001e60",
    fieldRole: "entry-owner-pointer",
    objectOffsetHex: "0x38",
    entryOffsetHex: "0x8",
    evidence: "stores the 0xe3cdfc return value into object+0x38, i.e. inline entry+0x8 owner pointer",
  },
  {
    address: 0x8d2d68,
    expectedHex: "b9003268",
    fieldRole: "entry-flags",
    objectOffsetHex: "0x30",
    entryOffsetHex: "0x0",
    evidence: "stores initial inline entry flags/control word at object+0x30, not a PFX/emitter pointer",
  },
  {
    address: 0x8d2d74,
    expectedHex: "f9001668",
    fieldRole: "entry-transform-provider-table",
    objectOffsetHex: "0x28",
    entryOffsetHex: "-0x8",
    evidence: "stores the 0x2726710-family table before the inline entry; render builders later use x4-8 as transform provider",
  },
  {
    address: 0x8d2d78,
    expectedHex: "943ef03c",
    fieldRole: "entry-list-or-id-init",
    objectOffsetHex: "0x40",
    entryOffsetHex: "0x10",
    evidence: "initializes the inline entry subobject tail at object+0x40 through shared helper 0x188ee68",
  },
  {
    address: 0x8d2d84,
    expectedHex: "a9057e7f",
    fieldRole: "entry-tail-clear",
    objectOffsetHex: "0x50",
    entryOffsetHex: "0x20",
    evidence: "clears inline entry trailing fields at object+0x50/object+0x58",
  },
];

const registerSpecs = [
  {
    address: 0x8d3a08,
    expectedHex: "3c868001",
    fieldRole: "default-transform-block-a",
    evidence: "register path stores default transform data into object+0x68 before manager registration",
  },
  {
    address: 0x8d3a14,
    expectedHex: "f9004c08",
    fieldRole: "caller-payload-pointer",
    evidence: "register path stores caller payload/table pointer from x1[0] into object+0x98",
  },
  {
    address: 0x8d3a18,
    expectedHex: "29142809",
    fieldRole: "caller-payload-flags",
    evidence: "register path stores caller payload flags and 1.0 scalar at object+0xa0/object+0xa4",
  },
  {
    address: 0x8d3a1c,
    expectedHex: "943eeb71",
    fieldRole: "manager-accessor",
    evidence: "register path obtains the scene/entity manager through 0x188e7e0",
  },
  {
    address: 0x8d3a20,
    expectedHex: "9100c283",
    fieldRole: "inline-entry-pointer",
    evidence: "register path sets x3 = object +0x30, proving manager record +0x8 receives the inline entry subobject",
  },
  {
    address: 0x8d3a2c,
    expectedHex: "943eed2d",
    fieldRole: "manager-add-record",
    evidence: "calls 0x188eee0 with x3 = object +0x30 and caller flags in w2",
  },
  {
    address: 0x8d3a30,
    expectedHex: "79016280",
    fieldRole: "manager-record-index-store",
    evidence: "stores the returned manager record index into object+0xb0",
  },
];

const lifecycleCallbackSpecs = [
  {
    address: 0x8d5414,
    expectedHex: "97fff648",
    fieldRole: "active-object-constructor-enters-body",
    evidence: "active-record object constructor callback 0x8d5404 enters layout B constructor body 0x8d2d34",
  },
  {
    address: 0x8d5428,
    expectedHex: "f9400008",
    fieldRole: "active-object-destructor-loads-vtable",
    objectOffsetHex: "0x0",
    evidence: "active-record object destructor callback 0x8d5428 loads the object vtable",
  },
  {
    address: 0x8d542c,
    expectedHex: "f9400101",
    fieldRole: "active-object-destructor-loads-slot0",
    evidence: "active-record object destructor callback loads vtable slot 0 before dispatch",
  },
  {
    address: 0x8d5430,
    expectedHex: "d61f0020",
    fieldRole: "active-object-destructor-branches-slot0",
    evidence: "active-record object destructor callback branches through object vtable slot 0",
  },
  {
    address: 0x8d2dbc,
    expectedHex: "f900566a",
    fieldRole: "constructor-object-ac-seed-high-word-two",
    objectOffsetHex: "0xa8",
    evidence:
      "layout B constructor stores 0x0000000200000000 at object+0xa8, making object+0xac initially 2 rather than particle mask 0x200",
  },
  {
    address: 0x8d2e9c,
    expectedHex: "f9402800",
    fieldRole: "destructor-loads-target-object",
    objectOffsetHex: "0x50",
    evidence: "layout B destructor body loads object+0x50 target before cleanup",
  },
  {
    address: 0x8d2ea4,
    expectedHex: "9415a7d0",
    fieldRole: "destructor-cleans-target-status",
    objectOffsetHex: "0x50",
    evidence: "layout B destructor body calls 0xe3cde4 for non-null target cleanup",
  },
  {
    address: 0x8d2eac,
    expectedHex: "943eeff9",
    fieldRole: "destructor-cleans-inline-entry-tail",
    objectOffsetHex: "0x40",
    entryOffsetHex: "0x10",
    evidence: "layout B destructor body cleans the inline entry tail through shared helper 0x188ee90",
  },
];

const globalOwnerSlotStoreSpecs = [
  {
    targetAddress: 0x311a290,
    address: 0xe3cd10,
    expectedHex: "f9014a96",
    role: "owner-slot-a-publish",
    evidence: "publishes owner slot A during global owner setup",
  },
  {
    targetAddress: 0x311a298,
    address: 0xe3cd2c,
    expectedHex: "f9014eb3",
    role: "owner-slot-b-publish",
    evidence: "publishes owner slot B; layout B entry constructor later reads this slot through 0xe3cdfc",
  },
  {
    targetAddress: 0x311a298,
    address: 0xe3cd98,
    expectedHex: "f9014e9f",
    role: "owner-slot-b-clear",
    evidence: "clears owner slot B during teardown",
  },
  {
    targetAddress: 0x311a290,
    address: 0xe3cdb8,
    expectedHex: "f9014abf",
    role: "owner-slot-a-clear",
    evidence: "clears owner slot A during teardown",
  },
];

const globalOwnerReadRoles = new Map([
  [0xe3ce00, "layout-b-entry-owner-global-accessor"],
  [0xe3ce0c, "alternate-entry-owner-global-accessor"],
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

function instructionHexAt(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 4);
  return fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
}

function evidenceRow(buffer, elf, spec, source) {
  const actualHex = instructionHexAt(buffer, elf, spec.address);
  return {
    source,
    address: spec.address,
    addressHex: hex(spec.address),
    expectedHex: spec.expectedHex,
    actualHex,
    opcodeMatches: actualHex === spec.expectedHex,
    fieldRole: spec.fieldRole || spec.role,
    objectOffsetHex: spec.objectOffsetHex || "",
    entryOffsetHex: spec.entryOffsetHex || "",
    targetAddressHex: hex(spec.targetAddress),
    evidence: spec.evidence,
    pfxEmitterOwner: false,
    renderPromotionAllowed: false,
  };
}

function ownerSlotReferenceRows(buffer, elf) {
  return scanTextReferences(buffer, elf, ownerSlotTargets)
    .sort((left, right) => left.targetAddress - right.targetAddress || left.xrefAddress - right.xrefAddress)
    .map((reference) => ({
      targetAddressHex: hex(reference.targetAddress),
      targetName: reference.targetName,
      xrefAddressHex: hex(reference.xrefAddress),
      mode: reference.mode,
      baseAddressHex: hex(reference.baseAddress),
      baseInstructionHex: reference.baseInstructionHex,
      useInstructionHex: reference.useInstructionHex,
      useRegister: reference.useRegister === null || reference.useRegister === undefined ? "" : `x${reference.useRegister}`,
      role: globalOwnerReadRoles.get(reference.xrefAddress) || "scene-entry-owner-global-read",
      pfxEmitterOwner: false,
      renderPromotionAllowed: false,
    }));
}

function buildCurrentNativeLayoutBEntryOwnerAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const entryInitializerRows = entryInitializerSpecs.map((spec) => evidenceRow(buffer, elf, spec, "entry-initializer"));
  const registerRows = registerSpecs.map((spec) => evidenceRow(buffer, elf, spec, "manager-register"));
  const lifecycleCallbackRows = lifecycleCallbackSpecs.map((spec) =>
    evidenceRow(buffer, elf, spec, "active-object-lifecycle-callback"),
  );
  const globalOwnerSlotStores = globalOwnerSlotStoreSpecs.map((spec) => evidenceRow(buffer, elf, spec, "global-owner-slot-store"));
  const globalOwnerSlotReferences = ownerSlotReferenceRows(buffer, elf);
  const opcodeRows = [...entryInitializerRows, ...registerRows, ...lifecycleCallbackRows, ...globalOwnerSlotStores];
  const summary = {
    entryInitializerRows: entryInitializerRows.length,
    registerRows: registerRows.length,
    lifecycleCallbackRows: lifecycleCallbackRows.length,
    globalOwnerSlotReadRows: globalOwnerSlotReferences.length,
    globalOwnerSlotStoreRows: globalOwnerSlotStores.length,
    entryOwnerFromGlobalSlotRows: entryInitializerRows.filter((row) => row.fieldRole === "entry-owner-pointer").length,
    constructorObjectAcSeedRows: lifecycleCallbackRows.filter((row) => row.fieldRole === "constructor-object-ac-seed-high-word-two")
      .length,
    constructorParticleMaskRows: 0,
    destructorCleanupRows: lifecycleCallbackRows.filter((row) => row.fieldRole.startsWith("destructor-")).length,
    pfxEmitterOwnerRows: 0,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows: opcodeRows.filter((row) => !row.opcodeMatches).length,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B entry owner audit; inline scene-entry ownership does not prove a PFX/emitter owner or authorize rendering takeover",
    summary,
    interpretation: {
      inlineEntry:
        "Layout B registers object+0x30 as an inline scene/entity entry subobject. It is not a pointer field that directly names a PFX or emitter resource.",
      ownerSlot:
        "The inline entry owner pointer at entry+0x8 comes from global owner slot 0x311a298 through accessor 0xe3cdfc.",
      remainingBlocker:
        "This proves render-owner infrastructure for the manager entry and bounds the constructor seed at object+0xac as value 2, but the concrete PFX/emitter owner and the particle-mask producer remain unresolved.",
    },
    unresolved: [
      "the concrete PFX/emitter instance owner behind the layout B scene-entry path",
      "the exact object+0xac producer that writes particle draw mask 0x200",
      "the lifecycle/timeline activation that decides when the inline entry should be visible",
    ],
    entryInitializerRows,
    registerRows,
    lifecycleCallbackRows,
    globalOwnerSlotStores,
    globalOwnerSlotReferences,
    opcodeRows,
  };
}

function exportCurrentNativeLayoutBEntryOwnerAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBEntryOwnerAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, [
    ...manifest.entryInitializerRows,
    ...manifest.registerRows,
    ...manifest.lifecycleCallbackRows,
    ...manifest.globalOwnerSlotStores,
  ], [
    "source",
    "addressHex",
    "expectedHex",
    "actualHex",
    "opcodeMatches",
    "fieldRole",
    "objectOffsetHex",
    "entryOffsetHex",
    "targetAddressHex",
    "evidence",
    "pfxEmitterOwner",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBEntryOwnerAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBEntryOwnerAudit,
  exportCurrentNativeLayoutBEntryOwnerAudit,
};
