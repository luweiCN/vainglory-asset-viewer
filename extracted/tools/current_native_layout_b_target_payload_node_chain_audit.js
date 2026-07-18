#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-target-payload-node-chain-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_target_payload_node_chain_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_target_payload_node_chain_audit.tsv";

const primaryRecordAllocatorSpecs = [
  {
    role: "schema-primary-record-allocate-call",
    address: 0xe3bb78,
    expectedOpcodeHex: "97fffd3a",
    evidence: "Resource schema binding calls 0xe3b060 to allocate or fetch a primary payload record.",
  },
  {
    role: "primary-record-pool-allocator-call",
    address: 0xe3b0b4,
    expectedOpcodeHex: "9400000d",
    evidence: "0xe3b060 calls 0xe3b0e8, the primary record free-list allocator for 0x2c8-byte records.",
  },
  {
    role: "primary-record-target-list-append-call",
    address: 0xe3b0c4,
    expectedOpcodeHex: "97fff912",
    evidence: "0xe3b060 appends the acquired primary record to the target payload list through 0xe3950c.",
  },
  {
    role: "child-record-allocate-call",
    address: 0xe3bd9c,
    expectedOpcodeHex: "97fffcf4",
    evidence: "Child schema binding calls 0xe3b16c; these child records are appended to target+0x2b0, not the final payload-node list.",
  },
  {
    role: "target-child-vector-add-call",
    address: 0xe3c0b8,
    expectedOpcodeHex: "940005d4",
    evidence: "Target refresh appends eligible child pointers to target+0x2b0 through 0xe3d808.",
  },
];

const payloadNodeInitSpecs = [
  {
    role: "payload-node-active-count-clear",
    address: 0xe3d6ec,
    expectedOpcodeHex: "b902001f",
    evidence: "Primary payload record init clears node +0x200 active primitive/particle count.",
  },
  {
    role: "payload-node-source-object-clear",
    address: 0xe3d724,
    expectedOpcodeHex: "f901067f",
    evidence: "Primary payload record init clears node +0x208 material/source object.",
  },
  {
    role: "payload-node-mode-flags-load",
    address: 0xe3d738,
    expectedOpcodeHex: "b942226a",
    evidence: "Primary payload record init loads node +0x220 before preserving high bits.",
  },
  {
    role: "payload-node-mode-flags-default-or",
    address: 0xe3d744,
    expectedOpcodeHex: "3214014a",
    evidence: "Primary payload record init ORs the default mode/state bit 0x1000 into node +0x220.",
  },
  {
    role: "payload-node-extra-transform-clear",
    address: 0xe3d77c,
    expectedOpcodeHex: "b902167f",
    evidence: "Primary payload record init clears node +0x214.",
  },
  {
    role: "payload-node-mode-flags-store",
    address: 0xe3d780,
    expectedOpcodeHex: "b902226a",
    evidence: "Primary payload record init stores the defaulted mode/state word to node +0x220.",
  },
  {
    role: "payload-node-child-vector-clear",
    address: 0xe3d720,
    expectedOpcodeHex: "f9015a7f",
    evidence: "Primary payload record init clears child pointer vector target+0x2b0 storage.",
  },
  {
    role: "payload-node-next-link-clear",
    address: 0xe3d718,
    expectedOpcodeHex: "f901627f",
    evidence: "Primary payload record init clears the linked-list next pointer at node +0x2c0.",
  },
];

const schemaPayloadWriteSpecs = [
  {
    role: "schema-primary-source-clear-before-build",
    address: 0xe3bb84,
    expectedOpcodeHex: "f90106ff",
    evidence: "Schema binding clears node +0x208 before optional source/program object construction.",
  },
  {
    role: "schema-primary-flags-load",
    address: 0xe3bb8c,
    expectedOpcodeHex: "b94222e9",
    evidence: "Schema binding loads node +0x220 before inserting schema mode bits.",
  },
  {
    role: "schema-primary-low-mode-insert",
    address: 0xe3bb94,
    expectedOpcodeHex: "33000d09",
    evidence: "Schema byte +0x18 is inserted into node +0x220 low-nibble primitive mode bits.",
  },
  {
    role: "schema-primary-low-mode-store",
    address: 0xe3bb98,
    expectedOpcodeHex: "b90222e9",
    evidence: "Schema binding stores the low-nibble primitive mode bits to node +0x220.",
  },
  {
    role: "schema-primary-render-state-insert",
    address: 0xe3bba8,
    expectedOpcodeHex: "33180549",
    evidence: "Schema byte +0x1a is inserted into node +0x220 bits 8..9 render-state class.",
  },
  {
    role: "schema-primary-nested-mode-insert",
    address: 0xe3bbb4,
    expectedOpcodeHex: "331c0d49",
    evidence: "Schema byte +0x19 is inserted into node +0x220 bits 4..7 nested primitive mode.",
  },
  {
    role: "schema-primary-transform-mode-insert",
    address: 0xe3bbc4,
    expectedOpcodeHex: "33160549",
    evidence: "Schema byte +0x1b is inserted into node +0x220 bits 10..11 transform selection.",
  },
  {
    role: "schema-primary-long-flags-insert",
    address: 0xe3bbd4,
    expectedOpcodeHex: "33143949",
    evidence: "Schema halfword +0x1c is inserted into node +0x220 bits 12..26.",
  },
  {
    role: "schema-primary-extra-transform-store",
    address: 0xe3bbfc,
    expectedOpcodeHex: "b90216ea",
    evidence: "Schema word +0x20 is stored to node +0x214.",
  },
  {
    role: "schema-primary-polygon-offset-clear",
    address: 0xe3bc08,
    expectedOpcodeHex: "b9021eff",
    evidence: "Schema binding clears node +0x21c polygon-offset scalar.",
  },
  {
    role: "schema-primary-extra-word-store",
    address: 0xe3bc0c,
    expectedOpcodeHex: "b9021aea",
    evidence: "Schema word +0x24 is stored to node +0x218.",
  },
  {
    role: "schema-primary-source-object-store",
    address: 0xe3bc68,
    expectedOpcodeHex: "f90106e0",
    evidence: "Optional schema source/program object construction stores the resulting object at node +0x208.",
  },
];

const targetListSpecs = [
  {
    role: "target-list-node-next-clear",
    address: 0xe3950c,
    expectedOpcodeHex: "f901603f",
    evidence: "0xe3950c clears record +0x2c0 before appending the primary record to target+0x68.",
  },
  {
    role: "target-list-head-load",
    address: 0xe39510,
    expectedOpcodeHex: "f9403409",
    evidence: "0xe3950c loads target +0x68, the first payload-node link.",
  },
  {
    role: "target-list-link-address",
    address: 0xe39514,
    expectedOpcodeHex: "910b0028",
    evidence: "0xe3950c materializes the linked-list pointer as record +0x2c0.",
  },
  {
    role: "target-list-head-store",
    address: 0xe39528,
    expectedOpcodeHex: "f9003408",
    evidence: "0xe3950c stores the first payload-node link at target +0x68 on an empty list.",
  },
  {
    role: "target-list-tail-store",
    address: 0xe39530,
    expectedOpcodeHex: "f9003808",
    evidence: "0xe3950c stores the latest payload-node link at target +0x70.",
  },
  {
    role: "target-list-count-load",
    address: 0xe3952c,
    expectedOpcodeHex: "b9407809",
    evidence: "0xe3950c loads target +0x78 payload-node count.",
  },
  {
    role: "target-list-count-store",
    address: 0xe39538,
    expectedOpcodeHex: "b9007808",
    evidence: "0xe3950c stores incremented target +0x78 payload-node count.",
  },
];

const targetTraversalSpecs = [
  {
    role: "target-first-payload-link-load",
    address: 0xe3a4e0,
    expectedOpcodeHex: "f9403408",
    evidence: "0xe3a4e0 loads target +0x68 as the first linked payload-node pointer.",
  },
  {
    role: "target-first-payload-base-subtract",
    address: 0xe3a4e4,
    expectedOpcodeHex: "d10b0109",
    evidence: "0xe3a4e0 subtracts 0x2c0 from the link pointer to return the payload record base.",
  },
  {
    role: "target-next-payload-link-load",
    address: 0xe3a4f4,
    expectedOpcodeHex: "f9416028",
    evidence: "0xe3a4f4 loads current node +0x2c0 as the next linked payload-node pointer.",
  },
  {
    role: "target-next-payload-base-subtract",
    address: 0xe3a4f8,
    expectedOpcodeHex: "d10b0109",
    evidence: "0xe3a4f4 subtracts 0x2c0 from the next link pointer to return the next payload record base.",
  },
  {
    role: "target-payload-count-load",
    address: 0xe3a508,
    expectedOpcodeHex: "b9407800",
    evidence: "0xe3a508 reads target +0x78 payload-node count.",
  },
];

const finalConsumerSpecs = [
  {
    role: "segment-builder-payload-count-load",
    address: 0xe3d4c4,
    expectedOpcodeHex: "b9420028",
    evidence: "ownerB segment builder reads payload node +0x200 as active primitive count.",
  },
  {
    role: "segment-builder-payload-flags-load",
    address: 0xe3d4cc,
    expectedOpcodeHex: "b9422029",
    evidence: "ownerB segment builder reads payload node +0x220 as mode/state flags.",
  },
  {
    role: "draw-consumer-payload-node-load",
    address: 0xe3cf00,
    expectedOpcodeHex: "f94002f4",
    evidence: "final draw consumer loads the payload node pointer from the segment record.",
  },
  {
    role: "draw-consumer-material-source-load",
    address: 0xe3d064,
    expectedOpcodeHex: "f9410695",
    evidence: "final draw consumer reads payload node +0x208 as material/source object.",
  },
  {
    role: "draw-consumer-mode-flags-load",
    address: 0xe3cf04,
    expectedOpcodeHex: "b9422288",
    evidence: "final draw consumer reads payload node +0x220 as render-state and primitive-mode flags.",
  },
];

const payloadActiveCountRuntimeSpecs = [
  {
    role: "target-refresh-calls-active-count-update",
    address: 0xe39b0c,
    expectedOpcodeHex: "94000ff8",
    evidence: "Target refresh walks each payload node and calls 0xe3daec, the active-count update path.",
  },
  {
    role: "update-path-filter-call",
    address: 0xe3db9c,
    expectedOpcodeHex: "94000075",
    evidence: "The update path calls 0xe3dd70 to filter/compact the existing payload node active index list.",
  },
  {
    role: "update-path-append-call",
    address: 0xe3dd68,
    expectedOpcodeHex: "94000033",
    evidence: "The update path calls 0xe3de34 to append newly active primitive indices into the payload node.",
  },
  {
    role: "filter-active-count-load",
    address: 0xe3dd70,
    expectedOpcodeHex: "b9420010",
    evidence: "0xe3dd70 reads payload node +0x200 before filtering the active halfword index list.",
  },
  {
    role: "filter-survivor-byte-count",
    address: 0xe3de24,
    expectedOpcodeHex: "cb0001c8",
    evidence: "0xe3dd70 computes surviving byte span after compacting the active halfword index list.",
  },
  {
    role: "filter-survivor-halfword-count",
    address: 0xe3de28,
    expectedOpcodeHex: "d341fd08",
    evidence: "0xe3dd70 divides the surviving byte span by two to recover the updated active count.",
  },
  {
    role: "filter-active-count-store",
    address: 0xe3de2c,
    expectedOpcodeHex: "b9020008",
    evidence: "0xe3dd70 stores the filtered active count back to payload node +0x200.",
  },
  {
    role: "append-current-active-count-load",
    address: 0xe3dea0,
    expectedOpcodeHex: "b94202b8",
    evidence: "0xe3de34 reads current payload node +0x200 before appending new active indices.",
  },
  {
    role: "append-candidate-count-callback",
    address: 0xe3debc,
    expectedOpcodeHex: "94000dc0",
    evidence: "0xe3de34 calls the child primitive callback 0xe415bc, whose return value is the candidate append count.",
  },
  {
    role: "append-reload-active-count",
    address: 0xe3dec4,
    expectedOpcodeHex: "b94202a8",
    evidence: "0xe3de34 reloads payload node +0x200 after the child callback returns candidate count.",
  },
  {
    role: "append-new-total-calc",
    address: 0xe3decc,
    expectedOpcodeHex: "0b000109",
    evidence: "0xe3de34 computes current active count plus candidate append count.",
  },
  {
    role: "append-remaining-capacity-calc",
    address: 0xe3ded0,
    expectedOpcodeHex: "4b08034a",
    evidence: "0xe3de34 computes remaining capacity against the 0x100-entry active index cap.",
  },
  {
    role: "append-capacity-compare",
    address: 0xe3def0,
    expectedOpcodeHex: "7104013f",
    evidence: "0xe3de34 compares new total against the 0x100 active index cap.",
  },
  {
    role: "append-count-clamp",
    address: 0xe3def4,
    expectedOpcodeHex: "1a80c149",
    evidence: "0xe3de34 clamps the append count to remaining capacity when the candidate count would exceed 0x100.",
  },
  {
    role: "append-fill-active-indices-call",
    address: 0xe3df50,
    expectedOpcodeHex: "94000d9c",
    evidence: "0xe3de34 calls 0xe415c0 to populate the newly reserved active index entries.",
  },
  {
    role: "append-active-count-reload",
    address: 0xe3df54,
    expectedOpcodeHex: "b94202a8",
    evidence: "0xe3de34 reloads payload node +0x200 after the active index fill call.",
  },
  {
    role: "append-active-count-add",
    address: 0xe3df58,
    expectedOpcodeHex: "0b180108",
    evidence: "0xe3de34 adds the accepted append count to the existing payload node active count.",
  },
  {
    role: "append-active-count-store",
    address: 0xe3df5c,
    expectedOpcodeHex: "b90202a8",
    evidence: "0xe3de34 stores the updated active count back to payload node +0x200.",
  },
  {
    role: "update-path-active-count-gate",
    address: 0xe3dba0,
    expectedOpcodeHex: "b9420288",
    evidence: "The update path gates downstream per-active-index callbacks on payload node +0x200 being nonzero.",
  },
  {
    role: "submit-copy-active-count-load",
    address: 0xe3a990,
    expectedOpcodeHex: "b94202a8",
    evidence: "Submit/copy path reads payload node +0x200 before copying active halfword indices to the global span.",
  },
  {
    role: "submit-copy-active-count-clear",
    address: 0xe3a9f8,
    expectedOpcodeHex: "b90202bf",
    evidence: "Submit/copy path clears payload node +0x200 after copying active indices and before marking the node dirty.",
  },
  {
    role: "flush-copy-active-count-load",
    address: 0xe398cc,
    expectedOpcodeHex: "b942010d",
    evidence: "Flush/copy path reads payload node +0x200 before copying active indices into another global span.",
  },
  {
    role: "flush-copy-active-count-clear",
    address: 0xe39920,
    expectedOpcodeHex: "b902011f",
    evidence: "Flush/copy path clears payload node +0x200 after copying active indices and before marking the node dirty.",
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

function opcodeRowsForSpecs(buffer, elf, stage, specs) {
  return specs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      stage,
      role: spec.role,
      address: spec.address,
      addressHex: hex(spec.address),
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function countRows(rows, predicate) {
  return rows.filter(predicate).length;
}

function rowsContain(rows, role) {
  return rows.some((row) => row.role === role && row.opcodeMatches);
}

function buildCurrentNativeLayoutBTargetPayloadNodeChainAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);

  const primaryRecordAllocatorRows = opcodeRowsForSpecs(buffer, elf, "primary-record-allocator", primaryRecordAllocatorSpecs);
  const payloadNodeInitRows = opcodeRowsForSpecs(buffer, elf, "payload-node-init", payloadNodeInitSpecs);
  const schemaPayloadWriteRows = opcodeRowsForSpecs(buffer, elf, "schema-payload-writes", schemaPayloadWriteSpecs);
  const targetListRows = opcodeRowsForSpecs(buffer, elf, "target-list-link", targetListSpecs);
  const targetTraversalRows = opcodeRowsForSpecs(buffer, elf, "target-list-traversal", targetTraversalSpecs);
  const finalConsumerRows = opcodeRowsForSpecs(buffer, elf, "final-consumer-fields", finalConsumerSpecs);
  const payloadActiveCountRuntimeRows = opcodeRowsForSpecs(
    buffer,
    elf,
    "payload-active-count-runtime",
    payloadActiveCountRuntimeSpecs,
  );
  const opcodeRows = [
    ...primaryRecordAllocatorRows,
    ...payloadNodeInitRows,
    ...schemaPayloadWriteRows,
    ...targetListRows,
    ...targetTraversalRows,
    ...finalConsumerRows,
    ...payloadActiveCountRuntimeRows,
  ];
  const opcodeMismatchRows = countRows(opcodeRows, (row) => !row.opcodeMatches);
  const allRowsMatch = opcodeMismatchRows === 0;

  const primaryRecordAllocationRecovered =
    allRowsMatch &&
    rowsContain(primaryRecordAllocatorRows, "schema-primary-record-allocate-call") &&
    rowsContain(primaryRecordAllocatorRows, "primary-record-pool-allocator-call") &&
    rowsContain(primaryRecordAllocatorRows, "primary-record-target-list-append-call");
  const payloadNodeInitializationRecovered =
    allRowsMatch &&
    rowsContain(payloadNodeInitRows, "payload-node-active-count-clear") &&
    rowsContain(payloadNodeInitRows, "payload-node-source-object-clear") &&
    rowsContain(payloadNodeInitRows, "payload-node-mode-flags-store") &&
    rowsContain(payloadNodeInitRows, "payload-node-next-link-clear");
  const schemaModeFlagsWriteRecovered =
    allRowsMatch &&
    rowsContain(schemaPayloadWriteRows, "schema-primary-low-mode-insert") &&
    rowsContain(schemaPayloadWriteRows, "schema-primary-render-state-insert") &&
    rowsContain(schemaPayloadWriteRows, "schema-primary-nested-mode-insert") &&
    rowsContain(schemaPayloadWriteRows, "schema-primary-long-flags-insert");
  const schemaSourceObjectWriteRecovered =
    allRowsMatch &&
    rowsContain(schemaPayloadWriteRows, "schema-primary-source-clear-before-build") &&
    rowsContain(schemaPayloadWriteRows, "schema-primary-source-object-store");
  const targetLinkedListRecovered =
    allRowsMatch &&
    rowsContain(targetListRows, "target-list-link-address") &&
    rowsContain(targetListRows, "target-list-head-store") &&
    rowsContain(targetListRows, "target-list-tail-store") &&
    rowsContain(targetListRows, "target-list-count-store") &&
    rowsContain(targetTraversalRows, "target-first-payload-base-subtract") &&
    rowsContain(targetTraversalRows, "target-next-payload-base-subtract");
  const finalConsumerFieldMatchRecovered =
    allRowsMatch &&
    rowsContain(finalConsumerRows, "segment-builder-payload-count-load") &&
    rowsContain(finalConsumerRows, "draw-consumer-material-source-load") &&
    rowsContain(finalConsumerRows, "draw-consumer-mode-flags-load");
  const payloadActiveCountFilterRecovered =
    allRowsMatch &&
    rowsContain(payloadActiveCountRuntimeRows, "filter-active-count-load") &&
    rowsContain(payloadActiveCountRuntimeRows, "filter-survivor-halfword-count") &&
    rowsContain(payloadActiveCountRuntimeRows, "filter-active-count-store");
  const payloadActiveCountAppendProducerRecovered =
    allRowsMatch &&
    rowsContain(payloadActiveCountRuntimeRows, "update-path-append-call") &&
    rowsContain(payloadActiveCountRuntimeRows, "append-candidate-count-callback") &&
    rowsContain(payloadActiveCountRuntimeRows, "append-count-clamp") &&
    rowsContain(payloadActiveCountRuntimeRows, "append-fill-active-indices-call") &&
    rowsContain(payloadActiveCountRuntimeRows, "append-active-count-store");
  const payloadActiveCountFlushRecovered =
    allRowsMatch &&
    rowsContain(payloadActiveCountRuntimeRows, "submit-copy-active-count-load") &&
    rowsContain(payloadActiveCountRuntimeRows, "submit-copy-active-count-clear") &&
    rowsContain(payloadActiveCountRuntimeRows, "flush-copy-active-count-load") &&
    rowsContain(payloadActiveCountRuntimeRows, "flush-copy-active-count-clear");

  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B target payload-node chain audit; proves payload node creation/listing/field consumers without enabling shader or texture takeover",
    summary: {
      primaryRecordAllocatorRows: primaryRecordAllocatorRows.length,
      payloadNodeInitRows: payloadNodeInitRows.length,
      schemaPayloadWriteRows: schemaPayloadWriteRows.length,
      targetListRows: targetListRows.length,
      targetTraversalRows: targetTraversalRows.length,
      finalConsumerRows: finalConsumerRows.length,
      payloadActiveCountRuntimeRows: payloadActiveCountRuntimeRows.length,
      opcodeRows: opcodeRows.length,
      opcodeMismatchRows,
      primaryRecordAllocationRecovered,
      payloadNodeInitializationRecovered,
      schemaModeFlagsWriteRecovered,
      schemaSourceObjectWriteRecovered,
      targetLinkedListRecovered,
      finalConsumerFieldMatchRecovered,
      targetPayloadNodeChainRecovered:
        primaryRecordAllocationRecovered &&
        payloadNodeInitializationRecovered &&
        schemaModeFlagsWriteRecovered &&
        schemaSourceObjectWriteRecovered &&
        targetLinkedListRecovered &&
        finalConsumerFieldMatchRecovered,
      payloadActiveCountFilterRecovered,
      payloadActiveCountAppendProducerRecovered,
      payloadActiveCountFlushRecovered,
      payloadActiveCountRuntimeProducerRecovered:
        payloadActiveCountFilterRecovered &&
        payloadActiveCountAppendProducerRecovered &&
        payloadActiveCountFlushRecovered,
      shaderTextureFormulaRecovered: false,
      renderPromotionAllowedRows: 0,
    },
    interpretation: {
      allocation:
        "Resource schema binding allocates primary 0x2c8-byte records, initializes payload fields, then appends record+0x2c0 to target+0x68/+0x70 and increments target+0x78.",
      fields:
        "The same primary payload record carries active count at +0x200, material/source object at +0x208, auxiliary values at +0x214/+0x218/+0x21c, mode/state bits at +0x220, and linked-list next at +0x2c0.",
      consumer:
        "ownerB/fallback traversal loads target+0x68 and subtracts 0x2c0 to recover the payload record base; final draw later consumes +0x200/+0x208/+0x220 from that record.",
      boundary:
        "This closes payload-node identity, field layout, and the runtime active-count lifecycle. It still does not recover the shader/texture/sampler formula behind the +0x208 source object.",
      activeCount:
        "0xe3de34 appends active halfword indices and stores the updated count to node +0x200; 0xe3dd70 filters/compacts that list and rewrites +0x200; submit/flush copy paths consume the list then clear +0x200 and mark the node dirty.",
    },
    unresolved: [
      "the shader/texture/sampler/UV formula behind the source/program object written to payload node +0x208",
      "the safe viewer render-promotion rule that uses the recovered current-runtime source object instead of heuristics",
    ],
    primaryRecordAllocatorRows,
    payloadNodeInitRows,
    schemaPayloadWriteRows,
    targetListRows,
    targetTraversalRows,
    finalConsumerRows,
    payloadActiveCountRuntimeRows,
  };
}

function exportCurrentNativeLayoutBTargetPayloadNodeChainAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBTargetPayloadNodeChainAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.primaryRecordAllocatorRows,
      ...manifest.payloadNodeInitRows,
      ...manifest.schemaPayloadWriteRows,
      ...manifest.targetListRows,
      ...manifest.targetTraversalRows,
      ...manifest.finalConsumerRows,
      ...manifest.payloadActiveCountRuntimeRows,
    ],
    ["stage", "role", "addressHex", "expectedOpcodeHex", "actualOpcodeHex", "opcodeMatches", "evidence", "renderPromotionAllowed"],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBTargetPayloadNodeChainAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBTargetPayloadNodeChainAudit,
  exportCurrentNativeLayoutBTargetPayloadNodeChainAudit,
};
