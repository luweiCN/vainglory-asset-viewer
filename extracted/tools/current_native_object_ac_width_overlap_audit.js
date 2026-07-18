#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-object-ac-width-overlap-audit.json";
const defaultJsonOut = "extracted/reports/current_native_object_ac_width_overlap_audit.json";
const defaultTsvOut = "extracted/reports/current_native_object_ac_width_overlap_audit.tsv";

const objectAcStart = 0xac;
const objectAcEnd = 0xb0;
const layoutBFamilyStart = 0x8d2d00;
const layoutBFamilyEnd = 0x8d5100;
const layoutBConstructorSeedAddress = 0x8d2dbc;

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

function virtualAddressForFileOffset(elf, fileOffset) {
  for (const segment of elf.loads) {
    const start = segment.fileOffset;
    const end = segment.fileOffset + segment.fileSize;
    if (fileOffset >= start && fileOffset < end) return segment.virtualAddress + (fileOffset - start);
  }
  return -1;
}

function parseUnsignedImmediateStore(instruction) {
  const specs = [
    { accessKind: "str-x", value: 0xf9000000, mask: 0xffc00000, scale: 8, byteWidth: 8 },
    { accessKind: "str-w", value: 0xb9000000, mask: 0xffc00000, scale: 4, byteWidth: 4 },
    { accessKind: "strh", value: 0x79000000, mask: 0xffc00000, scale: 2, byteWidth: 2 },
    { accessKind: "strb", value: 0x39000000, mask: 0xffc00000, scale: 1, byteWidth: 1 },
  ];
  const spec = specs.find((candidate) => ((instruction & candidate.mask) >>> 0) === candidate.value);
  if (!spec) return null;
  return {
    ...spec,
    offset: ((instruction >>> 10) & 0xfff) * spec.scale,
    valueRegister: instruction & 0x1f,
    baseRegister: (instruction >>> 5) & 0x1f,
  };
}

function overlapsObjectAc(store) {
  return store.offset < objectAcEnd && store.offset + store.byteWidth > objectAcStart;
}

function isLayoutBFamilyAddress(address) {
  return address >= layoutBFamilyStart && address < layoutBFamilyEnd;
}

function producerClassFor(row) {
  if (isLayoutBFamilyAddress(row.address) && row.address === layoutBConstructorSeedAddress) return "layout-b-constructor-seed";
  if (isLayoutBFamilyAddress(row.address)) return "layout-b-family-unexpected-overlap";
  if (row.accessKind === "str-w" && row.objectFieldOffsetHex === "0xac") return "out-of-family-exact-strw-existing-scope";
  if (row.valueRegisterNumber === 31) return "out-of-family-wide-zero-clear";
  return "out-of-family-wide-needs-owner";
}

function scanObjectAcWidthOverlapStores(buffer, elf) {
  const text = elf.sections.find((section) => section.name === ".text");
  if (!text) throw new Error("missing .text section");
  const rows = [];
  for (let fileOffset = text.fileOffset; fileOffset + 4 <= text.fileOffset + text.size; fileOffset += 4) {
    const instruction = buffer.readUInt32LE(fileOffset);
    const store = parseUnsignedImmediateStore(instruction);
    if (!store || !overlapsObjectAc(store)) continue;
    const address = virtualAddressForFileOffset(elf, fileOffset);
    const row = {
      id: `object-ac-width-overlap-${hex(address)}`,
      address,
      addressHex: hex(address),
      accessKind: store.accessKind,
      instructionHex: instruction.toString(16).padStart(8, "0"),
      objectFieldOffsetHex: hex(store.offset),
      byteWidth: store.byteWidth,
      overlapsObjectAc: true,
      baseRegister: `x${store.baseRegister}`,
      valueRegister:
        store.valueRegister === 31
          ? store.accessKind === "str-x"
            ? "xzr"
            : "wzr"
          : `${store.accessKind === "str-x" ? "x" : "w"}${store.valueRegister}`,
      valueRegisterNumber: store.valueRegister,
      inLayoutBFamily: isLayoutBFamilyAddress(address),
      exactStrWAc: store.accessKind === "str-w" && store.offset === objectAcStart,
      exactLayoutBParticleProducer: false,
      renderPromotionAllowed: false,
    };
    row.producerClass = producerClassFor(row);
    row.evidence =
      row.producerClass === "layout-b-constructor-seed"
        ? "the only recovered layout B family store overlapping object+0xac; seeds object+0xac with 2, not particle mask 0x200"
        : row.producerClass === "out-of-family-exact-strw-existing-scope"
          ? "covered by the existing exact str-w object+0xac producer audit; owner proof is required before promotion"
          : row.producerClass === "out-of-family-wide-zero-clear"
            ? "out-of-family narrow/wide overlap writes zero register; not a local particle-mask producer"
            : "out-of-family narrow/wide overlap needs owner/dataflow proof before it can be considered a layout B producer";
    rows.push(row);
  }
  return rows.sort((left, right) => left.address - right.address);
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function buildCurrentNativeObjectAcWidthOverlapAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const items = scanObjectAcWidthOverlapStores(buffer, elf);
  const byAccessKind = {};
  const byProducerClass = {};
  for (const item of items) {
    increment(byAccessKind, item.accessKind);
    increment(byProducerClass, item.producerClass);
  }
  const summary = {
    totalOverlapStoreRows: items.length,
    exactStrWAcRows: items.filter((row) => row.exactStrWAc).length,
    nonExactOverlapRows: items.filter((row) => !row.exactStrWAc).length,
    strXOverlapRows: items.filter((row) => row.accessKind === "str-x").length,
    strWOverlapRows: items.filter((row) => row.accessKind === "str-w").length,
    strBOverlapRows: items.filter((row) => row.accessKind === "strb").length,
    strHOverlapRows: items.filter((row) => row.accessKind === "strh").length,
    zeroRegisterRows: items.filter((row) => row.valueRegisterNumber === 31).length,
    layoutBFamilyOverlapRows: items.filter((row) => row.inLayoutBFamily).length,
    layoutBFamilyNonConstructorRows: items.filter(
      (row) => row.inLayoutBFamily && row.address !== layoutBConstructorSeedAddress,
    ).length,
    outOfFamilyOverlapRows: items.filter((row) => !row.inLayoutBFamily).length,
    outOfFamilyWideNeedsOwnerRows: items.filter((row) => row.producerClass === "out-of-family-wide-needs-owner").length,
    outOfFamilyWideZeroClearRows: items.filter((row) => row.producerClass === "out-of-family-wide-zero-clear").length,
    exactLayoutBParticleProducerRows: items.filter((row) => row.exactLayoutBParticleProducer).length,
    renderPromotionAllowedRows: 0,
    byAccessKind,
    byProducerClass,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only global width-overlap scan for object+0xac; same-offset stores outside recovered layout B ownership must never be promoted without owner/dataflow proof",
    objectAcWindowHex: "0xac..0xb0",
    layoutBFamilyRangeHex: `${hex(layoutBFamilyStart)}..${hex(layoutBFamilyEnd)}`,
    summary,
    interpretation: {
      globalNoise:
        "Current .text has hundreds of stores whose encoded offset overlaps +0xac. Most belong to unrelated object layouts or unbounded owners and are not layout B evidence by offset alone.",
      layoutBBoundary:
        "Within the recovered layout B family, only the constructor seed at 0x8d2dbc overlaps +0xac, and it seeds the high word to 2 rather than particle mask 0x200.",
      nextRequiredEvidence:
        "The remaining producer search must bind an out-of-family overlap row back to a live layout B object through owner/dataflow evidence before it can influence rendering.",
    },
    items,
  };
}

function exportCurrentNativeObjectAcWidthOverlapAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeObjectAcWidthOverlapAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "id",
    "addressHex",
    "accessKind",
    "instructionHex",
    "objectFieldOffsetHex",
    "byteWidth",
    "baseRegister",
    "valueRegister",
    "inLayoutBFamily",
    "exactStrWAc",
    "producerClass",
    "evidence",
    "exactLayoutBParticleProducer",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeObjectAcWidthOverlapAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeObjectAcWidthOverlapAudit,
  exportCurrentNativeObjectAcWidthOverlapAudit,
  scanObjectAcWidthOverlapStores,
};
