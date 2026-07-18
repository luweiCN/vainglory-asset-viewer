#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-target-cache-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_target_cache_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_target_cache_audit.tsv";

const targetCacheSpecs = [
  {
    role: "target-cache-resource-key-hash-call",
    address: 0xe3b608,
    expectedOpcodeHex: "97fcc836",
    evidence: "0xe3b5e8 hashes the decoded PFX resource name before looking up the owner slot A cache.",
  },
  {
    role: "target-cache-secondary-key-call",
    address: 0xe3b61c,
    expectedOpcodeHex: "97e796ba",
    evidence: "0xe3b5e8 mixes the resource hash with seed 0x12345678 for the cache key.",
  },
  {
    role: "target-cache-root-owner-plus-0x1c60d8",
    address: 0xe3b628,
    expectedOpcodeHex: "8b080269",
    evidence: "0xe3b5e8 addresses the target cache from owner slot A plus 0x1c60d8.",
  },
  {
    role: "target-cache-root-load",
    address: 0xe3b62c,
    expectedOpcodeHex: "f940012a",
    evidence: "0xe3b5e8 loads the cache tree root before the binary-tree lookup.",
  },
  {
    role: "target-cache-node-key-load",
    address: 0xe3b638,
    expectedOpcodeHex: "b940214b",
    evidence: "0xe3b5e8 compares the node key at +0x20 while walking the cache tree.",
  },
  {
    role: "target-cache-node-size-0x18",
    address: 0xe3b664,
    expectedOpcodeHex: "321d07e0",
    evidence: "cache miss path allocates a 0x18-byte node for the resolved resource metadata.",
  },
  {
    role: "target-cache-node-allocate",
    address: 0xe3b668,
    expectedOpcodeHex: "97e568be",
    evidence: "cache miss path calls operator new before storing the resource metadata.",
  },
  {
    role: "target-cache-node-resource-store",
    address: 0xe3b674,
    expectedOpcodeHex: "f9000014",
    evidence: "cache miss path stores the resolved resource metadata pointer into the new cache node.",
  },
  {
    role: "target-cache-node-insert-call",
    address: 0xe3b680,
    expectedOpcodeHex: "94000337",
    evidence: "cache miss path inserts the cache node through 0xe3c35c.",
  },
  {
    role: "target-cache-existing-node-load",
    address: 0xe3b68c,
    expectedOpcodeHex: "f9401515",
    evidence: "cache hit path reloads the existing resource metadata node from +0x28.",
  },
];

const targetAcquireSpecs = [
  {
    role: "target-acquire-owner-arg",
    address: 0xe3b694,
    expectedOpcodeHex: "aa1303e0",
    evidence: "0xe3b5e8 forwards owner slot A as x0 before acquiring the target object.",
  },
  {
    role: "target-acquire-object-call",
    address: 0xe3b698,
    expectedOpcodeHex: "97fffd39",
    evidence: "0xe3b5e8 calls 0xe3ab7c to obtain the actual target object.",
  },
  {
    role: "target-acquire-object-save",
    address: 0xe3b69c,
    expectedOpcodeHex: "aa0003f4",
    evidence: "0xe3b5e8 stores the acquired target object in x20 for return and binding.",
  },
  {
    role: "target-bind-target-arg",
    address: 0xe3b6a8,
    expectedOpcodeHex: "aa1403e1",
    evidence: "0xe3b5e8 forwards the acquired target object as the bind call argument.",
  },
  {
    role: "target-bind-resource-node-arg",
    address: 0xe3b6ac,
    expectedOpcodeHex: "aa1503e2",
    evidence: "0xe3b5e8 forwards the cache/resource node into the bind call.",
  },
  {
    role: "target-bind-resource-schema-call",
    address: 0xe3b6b0,
    expectedOpcodeHex: "94000024",
    evidence: "0xe3b5e8 calls 0xe3b740 to bind the resource schema onto the target object.",
  },
];

const resourceSchemaSpecs = [
  {
    role: "target-bind-resource-schema-load",
    address: 0xe3b790,
    expectedOpcodeHex: "f9400055",
    evidence: "0xe3b740 loads the resource schema pointer from the cache node.",
  },
  {
    role: "target-bind-resource-root-load",
    address: 0xe3b7a0,
    expectedOpcodeHex: "f94002a9",
    evidence: "0xe3b740 copies the first schema pointer into the target build scratch record.",
  },
  {
    role: "target-bind-resource-header-load",
    address: 0xe3b7a8,
    expectedOpcodeHex: "b9400aa8",
    evidence: "0xe3b740 copies the schema header word into the target build scratch record.",
  },
  {
    role: "target-primary-entry-count-load",
    address: 0xe3b954,
    expectedOpcodeHex: "394062a8",
    evidence: "0xe3b740 reads the primary resource entry count from schema+0x18.",
  },
  {
    role: "target-primary-variant-mode-load",
    address: 0xe3b9ac,
    expectedOpcodeHex: "3942af68",
    evidence: "primary entry binding checks schema variant mode at +0xab before selecting the record body.",
  },
  {
    role: "target-primary-child-count-load",
    address: 0xe3b9d8,
    expectedOpcodeHex: "3942a368",
    evidence: "primary entry binding reads child/subrecord count at +0xa8.",
  },
  {
    role: "target-primary-record-allocate-call",
    address: 0xe3bb78,
    expectedOpcodeHex: "97fffd3a",
    evidence: "primary resource entry binding calls 0xe3b060 to allocate or fetch a primary target record.",
  },
  {
    role: "target-primary-resource-block-copy",
    address: 0xe3bd28,
    expectedOpcodeHex: "f84ac368",
    evidence: "0xe3b740 copies the primary record resource block starting near schema+0xac.",
  },
  {
    role: "target-primary-resource-pointer-decode-call",
    address: 0xe3bd34,
    expectedOpcodeHex: "f84b4360",
    evidence: "0xe3b740 starts decoding primary record resource pointers before storing them on the target record.",
  },
  {
    role: "target-child-count-load",
    address: 0xe3bd7c,
    expectedOpcodeHex: "3942a368",
    evidence: "0xe3b740 checks how many child records the primary schema entry owns.",
  },
];

const childRecordSpecs = [
  {
    role: "target-child-type-load",
    address: 0xe3bd88,
    expectedOpcodeHex: "39406399",
    evidence: "child record binding reads the child type byte before allocation.",
  },
  {
    role: "target-child-record-allocate-call",
    address: 0xe3bd9c,
    expectedOpcodeHex: "97fffcf4",
    evidence: "child record binding calls 0xe3b16c to allocate or fetch a child target record.",
  },
  {
    role: "target-child-record-transform-submit",
    address: 0xe3bf44,
    expectedOpcodeHex: "aa1803e0",
    evidence: "child record transform is submitted after schema matrices are combined.",
  },
  {
    role: "target-child-resource-slot-0x50-store",
    address: 0xe3bf54,
    expectedOpcodeHex: "f9002b00",
    evidence: "child record stores decoded resource pointer into target child slot +0x50.",
  },
  {
    role: "target-child-resource-slot-0x58-store",
    address: 0xe3bf60,
    expectedOpcodeHex: "f9002f00",
    evidence: "child record stores decoded resource pointer into target child slot +0x58.",
  },
  {
    role: "target-child-resource-slot-0x60-store",
    address: 0xe3bf6c,
    expectedOpcodeHex: "f9003300",
    evidence: "child record stores decoded resource pointer into target child slot +0x60.",
  },
  {
    role: "target-child-resource-slot-0x68-store",
    address: 0xe3bf78,
    expectedOpcodeHex: "f9003700",
    evidence: "child record stores decoded resource pointer into target child slot +0x68.",
  },
  {
    role: "target-child-resource-slot-0x70-store",
    address: 0xe3bf84,
    expectedOpcodeHex: "f9003b00",
    evidence: "child record stores decoded resource pointer into target child slot +0x70.",
  },
  {
    role: "target-child-resource-slot-0x78-store",
    address: 0xe3bf90,
    expectedOpcodeHex: "f9003f00",
    evidence: "child record stores decoded resource pointer into target child slot +0x78.",
  },
  {
    role: "target-child-resource-flags-store",
    address: 0xe3c01c,
    expectedOpcodeHex: "3902c308",
    evidence: "child record stores the schema flag byte into target child slot +0xb0.",
  },
];

const targetRefreshSpecs = [
  {
    role: "target-refresh-primary-iterator-start",
    address: 0xe3c050,
    expectedOpcodeHex: "aa1303e0",
    evidence: "after schema expansion, 0xe3b740 starts iterating target parameter records.",
  },
  {
    role: "target-refresh-first-record-call",
    address: 0xe3c070,
    expectedOpcodeHex: "97fff91c",
    evidence: "target refresh calls 0xe3a4e0 to obtain the first primary target record.",
  },
  {
    role: "target-refresh-current-resource-vector-load",
    address: 0xe3c078,
    expectedOpcodeHex: "f9410688",
    evidence: "target refresh reads record+0x208 before selecting a child resource vector.",
  },
  {
    role: "target-refresh-parameter-id-load",
    address: 0xe3c0a4,
    expectedOpcodeHex: "b94012a1",
    evidence: "target refresh reads the parameter id from the current parameter record.",
  },
  {
    role: "target-refresh-resource-membership-call",
    address: 0xe3c0a8,
    expectedOpcodeHex: "942982dd",
    evidence: "target refresh checks the resource table before adding eligible child records.",
  },
  {
    role: "target-refresh-child-vector-add-call",
    address: 0xe3c0b8,
    expectedOpcodeHex: "940005d4",
    evidence: "target refresh calls 0xe3d808 to append an eligible child pointer to target+0x2b0.",
  },
  {
    role: "target-refresh-next-primary-record-call",
    address: 0xe3c0c4,
    expectedOpcodeHex: "97fff90c",
    evidence: "target refresh advances through primary target records with 0xe3a4f4.",
  },
  {
    role: "target-refresh-status-load",
    address: 0xe3c0e4,
    expectedOpcodeHex: "7940ca68",
    evidence: "target refresh loads target+0x64 status bits after schema traversal.",
  },
  {
    role: "target-refresh-status-store",
    address: 0xe3c0ec,
    expectedOpcodeHex: "7900ca68",
    evidence: "target refresh stores target+0x64 with bit 0x100 set; this is target state, not draw submission.",
  },
];

const submitFanoutSpecs = [
  {
    role: "target-submit-transform-source-load",
    address: 0xe3b2d8,
    expectedOpcodeHex: "3dc00ec0",
    evidence: "alternate submit path copies caller transform block into target state.",
  },
  {
    role: "target-submit-transform-target-store",
    address: 0xe3b2e0,
    expectedOpcodeHex: "3d801aa0",
    evidence: "alternate submit path stores transform row into target internal state.",
  },
  {
    role: "target-submit-transform-base-store",
    address: 0xe3b2f8,
    expectedOpcodeHex: "3d800ea0",
    evidence: "alternate submit path completes transform copy before choosing serial or fanout processing.",
  },
  {
    role: "target-submit-serial-branch",
    address: 0xe3b404,
    expectedOpcodeHex: "1400000f",
    evidence: "submit path can branch to serial target record processing at 0xe3b440.",
  },
  {
    role: "target-submit-global-fanout-branch",
    address: 0xe3b428,
    expectedOpcodeHex: "14000568",
    evidence: "submit path can branch to global fanout processing at 0xe3c9c8.",
  },
  {
    role: "target-fanout-global-page",
    address: 0xe3c9f0,
    expectedOpcodeHex: "900116f7",
    evidence: "global fanout path writes target submit work into the 0x3118000 global work buffer.",
  },
  {
    role: "target-fanout-collect-target-records-call",
    address: 0xe3ca08,
    expectedOpcodeHex: "97fffadc",
    evidence: "global fanout path calls 0xe3b578 to collect target records before dispatch.",
  },
  {
    role: "target-fanout-worker-scheduler-call",
    address: 0xe3ca84,
    expectedOpcodeHex: "97fcfdad",
    evidence: "global fanout path schedules worker callbacks over collected target records.",
  },
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

function opcodeRow(buffer, elf, spec, stage) {
  const actualOpcodeHex = instructionHexAt(buffer, elf, spec.address);
  return {
    stage,
    role: spec.role,
    addressHex: hex(spec.address),
    expectedOpcodeHex: spec.expectedOpcodeHex,
    actualOpcodeHex,
    opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
    evidence: spec.evidence,
    pfxEmitterDraw: false,
    renderPromotionAllowed: false,
  };
}

function buildCurrentNativeLayoutBTargetCacheAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const targetCacheRows = targetCacheSpecs.map((spec) => opcodeRow(buffer, elf, spec, "target-cache"));
  const targetAcquireRows = targetAcquireSpecs.map((spec) => opcodeRow(buffer, elf, spec, "target-acquire"));
  const resourceSchemaRows = resourceSchemaSpecs.map((spec) => opcodeRow(buffer, elf, spec, "resource-schema"));
  const childRecordRows = childRecordSpecs.map((spec) => opcodeRow(buffer, elf, spec, "child-record"));
  const targetRefreshRows = targetRefreshSpecs.map((spec) => opcodeRow(buffer, elf, spec, "target-refresh"));
  const submitFanoutRows = submitFanoutSpecs.map((spec) => opcodeRow(buffer, elf, spec, "submit-fanout"));
  const opcodeRows = [
    ...targetCacheRows,
    ...targetAcquireRows,
    ...resourceSchemaRows,
    ...childRecordRows,
    ...targetRefreshRows,
    ...submitFanoutRows,
  ];
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const targetCacheRecovered =
    opcodeMismatchRows === 0 &&
    targetCacheRows.length === 10 &&
    targetAcquireRows.some((row) => row.role === "target-acquire-object-call") &&
    targetAcquireRows.some((row) => row.role === "target-bind-resource-schema-call");
  const resourceSchemaExpansionRecovered =
    opcodeMismatchRows === 0 &&
    resourceSchemaRows.some((row) => row.role === "target-primary-record-allocate-call") &&
    childRecordRows.some((row) => row.role === "target-child-record-allocate-call") &&
    targetRefreshRows.some((row) => row.role === "target-refresh-child-vector-add-call");
  const summary = {
    targetCacheRows: targetCacheRows.length,
    targetAcquireRows: targetAcquireRows.length,
    resourceSchemaRows: resourceSchemaRows.length,
    childRecordRows: childRecordRows.length,
    targetRefreshRows: targetRefreshRows.length,
    submitFanoutRows: submitFanoutRows.length,
    targetCacheRecovered,
    resourceSchemaExpansionRecovered,
    pfxEmitterDrawRows: 0,
    renderPromotionAllowedRows: 0,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B target cache/bind audit; cache acquire, schema expansion, target refresh, and fanout scheduling do not prove final PFX/emitter draw submission",
    summary,
    interpretation: {
      targetCache:
        "0xe3b5e8 hashes the decoded resource, looks up owner slot A + 0x1c60d8, allocates/inserts a cache node on miss, calls 0xe3ab7c to acquire the target, and calls 0xe3b740 to bind the resource schema.",
      resourceSchema:
        "0xe3b740 expands the resource schema into primary and child target records through 0xe3b060 and 0xe3b16c, stores decoded resource pointers, and refreshes target-local record vectors.",
      fanout:
        "The alternate submit path copies transforms and can branch either to serial record processing (0xe3b440) or global fanout processing (0xe3c9c8), but this stage still stops before a concrete draw queue primitive.",
      boundary:
        "The target cache and schema expansion layers are now current-binary evidence. Rendering takeover remains disabled until the exact record-to-draw queue bridge is proven.",
    },
    unresolved: [
      "the concrete draw/queue call consuming records produced by 0xe3b060/0xe3b16c and vectors appended by 0xe3d808",
      "the exact producer of layout B object+0xac bit 0x200",
      "the skill/action timeline condition selecting serial versus global fanout submission",
    ],
    targetCacheRows,
    targetAcquireRows,
    resourceSchemaRows,
    childRecordRows,
    targetRefreshRows,
    submitFanoutRows,
  };
}

function exportCurrentNativeLayoutBTargetCacheAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBTargetCacheAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.targetCacheRows,
      ...manifest.targetAcquireRows,
      ...manifest.resourceSchemaRows,
      ...manifest.childRecordRows,
      ...manifest.targetRefreshRows,
      ...manifest.submitFanoutRows,
    ],
    [
      "stage",
      "role",
      "addressHex",
      "expectedOpcodeHex",
      "actualOpcodeHex",
      "opcodeMatches",
      "evidence",
      "pfxEmitterDraw",
      "renderPromotionAllowed",
    ],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBTargetCacheAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBTargetCacheAudit,
  exportCurrentNativeLayoutBTargetCacheAudit,
};
