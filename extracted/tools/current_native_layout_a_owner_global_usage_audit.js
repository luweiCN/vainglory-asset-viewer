#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64, scanTextReferences } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-a-owner-global-usage-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_a_owner_global_usage_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_a_owner_global_usage_audit.tsv";

const globalSpecs = [
  {
    globalAddress: 0x3035088,
    role: "layout-a-shared-child-type-index",
    typeLiteral: "0x38",
    previouslyModeledReads: [0x90ce18, 0x915264, 0x91a6d8],
  },
  {
    globalAddress: 0x3034ae0,
    role: "layout-a-input-byte-conditional-type-index",
    typeLiteral: "0x48",
    previouslyModeledReads: [0x8afe48, 0x97f8a8],
  },
  {
    globalAddress: 0x3034af0,
    role: "layout-a-secondary-companion-type-index",
    typeLiteral: "0x70",
    previouslyModeledReads: [0x8afe88, 0x97f9f4],
  },
  {
    globalAddress: 0x30369a8,
    role: "layout-a-owner-type-index-a",
    typeLiteral: "0x98",
    previouslyModeledReads: [0x914f74],
  },
  {
    globalAddress: 0x3036d00,
    role: "layout-a-owner-type-index-b",
    typeLiteral: "0x40",
    previouslyModeledReads: [0x914e64, 0x914f28],
  },
];

const contextByReadAddress = new Map([
  [0x8afe48, ["create-layout-a-input-child", "resolves the 0x48 child before feeding 0x8b8420 input-byte keep/clear refresh"]],
  [0x8afe88, ["create-layout-a-companion-child", "resolves the 0x70 companion child after the 0x48 child setup"]],
  [0x90ce18, ["create-shared-child-from-owner-a", "owner A stores x1/x2 at +0x28 then resolves the shared 0x38 child"]],
  [0x914e64, ["scan-owner-list-for-type-0x40", "walks owner +0x18 list and compares each record type against global 0x3036d00"]],
  [0x914ea0, ["scan-owner-list-for-type-0x98", "same owner +0x18 list scan falls through to compare against global 0x30369a8"]],
  [0x914f28, ["create-owner-b-path-child", "conditional owner path resolves type 0x40 before tail-calling 0x91a6c4"]],
  [0x914f74, ["create-owner-a-path-child", "conditional owner path resolves type 0x98 before tail-calling 0x90ce04"]],
  [0x915264, ["create-shared-child-from-active-owner", "active owner path resolves the shared 0x38 child and calls 0x8caa18"]],
  [0x916fc0, ["scan-owner-list-for-type-0x98-before-callback", "later owner +0x18 list scan compares against global 0x30369a8 before dispatching 0x9170c8"]],
  [0x91a6d8, ["create-shared-child-from-owner-b", "owner B stores x1/x2 at +0x28 then resolves the shared 0x38 child"]],
  [0x97f8a8, ["cached-create-layout-a-input-child", "alternate path resolves the 0x48 child and caches object/version in the owner"]],
  [0x97f9f4, ["cached-create-layout-a-companion-child", "alternate path resolves the 0x70 companion child and caches object/version in the owner"]],
]);

const createHelperReadAddresses = new Set([0x8afe48, 0x8afe88, 0x90ce18, 0x914f28, 0x914f74, 0x915264, 0x91a6d8, 0x97f8a8, 0x97f9f4]);
const ownerListScanReadAddresses = new Set([0x914e64, 0x914ea0, 0x916fc0]);

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

function buildCurrentNativeLayoutAOwnerGlobalUsageAudit({ binaryPath = defaultBinary } = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const modeledReads = new Set(globalSpecs.flatMap((spec) => spec.previouslyModeledReads));
  const byAddress = new Map(globalSpecs.map((spec) => [spec.globalAddress, spec]));
  const targets = globalSpecs.map((spec) => ({
    name: spec.role,
    virtualAddress: spec.globalAddress,
    section: ".bss",
  }));
  const references = scanTextReferences(buffer, elf, targets).sort((left, right) => left.xrefAddress - right.xrefAddress);
  const items = references.map((reference) => {
    const spec = byAddress.get(reference.targetAddress);
    const [contextRole, contextEvidence] = contextByReadAddress.get(reference.xrefAddress) || ["unclassified-layout-a-global-read", ""];
    const wasModeledByRegistrationAudit = modeledReads.has(reference.xrefAddress);
    return {
      globalAddressHex: hex(reference.targetAddress),
      globalRole: spec?.role || reference.targetName,
      typeLiteral: spec?.typeLiteral || "",
      xrefAddress: reference.xrefAddress,
      xrefAddressHex: hex(reference.xrefAddress),
      mode: reference.mode,
      baseAddressHex: hex(reference.baseAddress),
      baseInstructionHex: reference.baseInstructionHex,
      useInstructionHex: reference.useInstructionHex,
      wasModeledByRegistrationAudit,
      contextRole,
      contextEvidence,
      createHelperRead: createHelperReadAddresses.has(reference.xrefAddress),
      ownerListScanRead: ownerListScanReadAddresses.has(reference.xrefAddress),
      renderPromotionAllowed: false,
    };
  });
  const unmodeledReadRows = items.filter((row) => !row.wasModeledByRegistrationAudit).length;
  const summary = {
    globals: globalSpecs.length,
    textReferenceRows: items.length,
    modeledReadRows: items.length - unmodeledReadRows,
    unmodeledReadRows,
    createHelperReadRows: items.filter((row) => row.createHelperRead).length,
    ownerListScanReadRows: items.filter((row) => row.ownerListScanRead).length,
    unclassifiedReadRows: items.filter((row) => row.contextRole === "unclassified-layout-a-global-read").length,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt: new Date().toISOString(),
    binaryPath,
    policy:
      "diagnostic-only layout A owner/type global usage scan; it enumerates all current text reads before any refresh-path semantics are promoted",
    summary,
    interpretation: {
      completeReadScan:
        "The automatic scan finds every current .text reference to the five recovered layout A owner/type globals. It intentionally supersedes the older hand-listed read-site subset.",
      newReads:
        "The additional 0x30369a8 reads at 0x914ea0 and 0x916fc0 are owner +0x18 list type comparisons, not particle flag producers or render queue calls.",
      createReads:
        "Nine reads feed 0x188b8b8 create/resolve paths for layout A child/owner objects. These are owner graph edges, not proof of particle draw flags.",
    },
    unresolved: [
      "the resource/action semantic names behind the layout A owner objects",
      "the caller state source that selects d80044 keep-cached versus d800a4 clear refresh",
      "whether any layout A owner path ultimately activates a particle-capable manager entry",
    ],
    items,
  };
}

function exportCurrentNativeLayoutAOwnerGlobalUsageAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutAOwnerGlobalUsageAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "globalAddressHex",
    "globalRole",
    "typeLiteral",
    "xrefAddressHex",
    "mode",
    "baseAddressHex",
    "baseInstructionHex",
    "useInstructionHex",
    "wasModeledByRegistrationAudit",
    "contextRole",
    "contextEvidence",
    "createHelperRead",
    "ownerListScanRead",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutAOwnerGlobalUsageAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutAOwnerGlobalUsageAudit,
  exportCurrentNativeLayoutAOwnerGlobalUsageAudit,
};
