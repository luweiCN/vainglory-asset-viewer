#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-final-primitive-consumer-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_final_primitive_consumer_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_final_primitive_consumer_audit.tsv";

const commandVtablePointerSpecs = [
  {
    role: "command-vtable-slot-0x0",
    address: 0x272f2f0,
    expectedPointer: 0xe07bc0,
    evidence: "0xe3d184 installs command vptr 0x272f2f0; slot +0x0 is the command base callback.",
  },
  {
    role: "command-vtable-slot-0x8-draw-consumer",
    address: 0x272f2f8,
    expectedPointer: 0xe3ce74,
    evidence: "The command vtable slot +0x8 points to 0xe3ce74, the final primitive draw consumer.",
  },
  {
    role: "command-vtable-slot-0x10",
    address: 0x272f300,
    expectedPointer: 0xe07bc4,
    evidence: "Command vtable slot +0x10 remains in the same command vtable group.",
  },
  {
    role: "command-vtable-slot-0x18-destroy",
    address: 0x272f308,
    expectedPointer: 0xe3d6d0,
    evidence: "Command vtable slot +0x18 points to the command cleanup/destructor path.",
  },
];

const commandConstructorSpecs = [
  [0xe3d1d0, "command-constructor-vtable-page", "d000c789", "0xe3d184 materializes the command vtable page."],
  [0xe3d1d8, "command-constructor-vtable-base-add", "910b8129", "0xe3d184 adds the command vtable group base."],
  [0xe3d1e0, "command-constructor-vptr-add", "91004128", "0xe3d184 adds 0x10 so the command vptr is 0x272f2f0."],
  [0xe3d1ec, "command-constructor-vptr-store", "a9007c08", "0xe3d184 stores the command vptr and clears the next qword."],
  [0xe3d1f4, "command-constructor-transform-store-0x50", "3d801400", "0xe3d184 stores one matrix/transform vector at command +0x50."],
  [0xe3d1fc, "command-constructor-transform-store-0x40", "3d801000", "0xe3d184 stores one matrix/transform vector at command +0x40."],
  [0xe3d204, "command-constructor-transform-store-0x30", "3d800c00", "0xe3d184 stores one matrix/transform vector at command +0x30."],
  [0xe3d20c, "command-constructor-buffer-store-0x60", "f9003013", "0xe3d184 stores the selected attribute/submit buffer at command +0x60."],
  [0xe3d210, "command-constructor-transform-store-0x20", "3d800800", "0xe3d184 stores one matrix/transform vector at command +0x20."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ address, role, expectedOpcodeHex, evidence }));

const segmentBuilderSpecs = [
  [0xe3d460, "segment-builder-target-count-helper-call", "97fff42a", "0xe3d400 calls 0xe3a508 to read target +0x78 as active payload count."],
  [0xe3d484, "segment-builder-command-record-build-call", "97ffff40", "0xe3d400 calls 0xe3d184 to build the command record consumed through its vtable."],
  [0xe3d498, "segment-builder-segment-span-allocate-call", "97fffe5f", "0xe3d400 calls 0xe3ce14 to allocate segment records."],
  [0xe3d49c, "segment-builder-segment-list-store", "f90036c0", "0xe3d400 stores the segment record pointer at command +0x68."],
  [0xe3d4a0, "segment-builder-segment-count-store", "b90072d8", "0xe3d400 stores target payload count at command +0x70."],
  [0xe3d4b0, "segment-builder-first-payload-call", "97fff40c", "0xe3d400 calls 0xe3a4e0 to fetch the first target payload node."],
  [0xe3d4c4, "segment-builder-payload-count-load", "b9420028", "0xe3d400 reads payload node +0x200 as primitive count."],
  [0xe3d4cc, "segment-builder-payload-flags-load", "b9422029", "0xe3d400 reads payload node +0x220 as mode/flags for record count calculation."],
  [0xe3d4d0, "segment-builder-payload-mode-low-nibble", "12000d2a", "0xe3d400 extracts the low-nibble primitive mode."],
  [0xe3d4e8, "segment-builder-mode-count-dispatch", "d61f0140", "0xe3d400 dispatches by primitive mode to derive emitted vertex count."],
  [0xe3d550, "segment-builder-segment-start-store", "790012ea", "0xe3d400 stores segment start at segment record +0x8."],
  [0xe3d554, "segment-builder-segment-count-store-0xa", "790016e8", "0xe3d400 stores segment count at segment record +0xa."],
  [0xe3d55c, "segment-builder-next-payload-call", "97fff3e6", "0xe3d400 calls 0xe3a4f4 to advance to the next target payload node."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ address, role, expectedOpcodeHex, evidence }));

const drawConsumerSpecs = [
  [0xe3ce94, "draw-consumer-command-segment-count-load", "b9407008", "0xe3ce74 reads command +0x70 as segment count."],
  [0xe3cea8, "draw-consumer-command-segment-list-load", "f9403677", "0xe3ce74 reads command +0x68 as segment record list."],
  [0xe3ceb8, "draw-consumer-command-matrix-pointer", "91008278", "0xe3ce74 uses command +0x20 as the per-command matrix pointer."],
  [0xe3cec0, "draw-consumer-triangle-mode-mask", "52803079", "0xe3ce74 materializes primitive mode mask 0x183 for triangles."],
  [0xe3cef8, "draw-consumer-segment-count-load", "794016e8", "0xe3ce74 reads segment record +0xa count and skips empty spans."],
  [0xe3cf00, "draw-consumer-segment-payload-node-load", "f94002f4", "0xe3ce74 loads payload node pointer from segment record +0x0."],
  [0xe3cf04, "draw-consumer-payload-flags-load", "b9422288", "0xe3ce74 reads payload node +0x220 as render state and primitive mode flags."],
  [0xe3cf08, "draw-consumer-render-state-class-extract", "53082508", "0xe3ce74 extracts (+0x220 >> 8) & 3 for render state class."],
  [0xe3cf20, "draw-consumer-render-state-global-base", "d00116e8", "0xe3ce74 addresses the current render-state qword table near 0x311a2a8."],
  [0xe3cf40, "draw-consumer-render-state-low-word-call", "97ff2b25", "0xe3ce74 applies the selected render-state low word through 0xe07bd4."],
  [0xe3cf4c, "draw-consumer-polygon-offset-load", "bd421e89", "0xe3ce74 reads payload node +0x21c for polygon offset scalar."],
  [0xe3cf58, "draw-consumer-polygon-offset-bit-mask", "12040115", "0xe3ce74 masks +0x220 bit 0x10000000 for polygon offset behavior."],
  [0xe3cf6c, "draw-consumer-gl-polygon-offset-call-a", "97e56ba5", "0xe3ce74 can call glPolygonOffset before enabling polygon offset fill."],
  [0xe3cf78, "draw-consumer-gl-enable-polygon-offset-arg", "529006e0", "0xe3ce74 prepares GL_POLYGON_OFFSET_FILL (0x8037) for glEnable."],
  [0xe3cf88, "draw-consumer-gl-polygon-offset-call-b", "97e56b9e", "0xe3ce74 can call glPolygonOffset after enabling polygon offset fill."],
  [0xe3cf90, "draw-consumer-gl-disable-polygon-offset-arg", "529006e0", "0xe3ce74 prepares GL_POLYGON_OFFSET_FILL (0x8037) for glDisable."],
  [0xe3cfbc, "draw-consumer-gl-disable-depth-call", "97e56fb9", "0xe3ce74 can disable GL_DEPTH_TEST (0xb71) from payload flags."],
  [0xe3cfd0, "draw-consumer-matrix-flag-test", "7216051f", "0xe3ce74 tests payload +0x220 transform bits 0xc00."],
  [0xe3d030, "draw-consumer-matrix-copy-load", "b8686b09", "0xe3ce74 copies either command matrix or default matrix into the global draw matrix."],
  [0xe3d034, "draw-consumer-matrix-copy-store", "b8286b49", "0xe3ce74 stores the selected matrix into the global draw matrix."],
  [0xe3d064, "draw-consumer-material-source-load", "f9410695", "0xe3ce74 reads payload node +0x208 as material/source object."],
  [0xe3d070, "draw-consumer-selected-source-index-load", "394a8108", "0xe3ce74 reads the selected source index byte from global 0x311a2a0."],
  [0xe3d078, "draw-consumer-source-entry-table-index", "8b080d28", "0xe3ce74 indexes the source object table by the selected source index."],
  [0xe3d07c, "draw-consumer-source-entry-load", "f940051c", "0xe3ce74 loads the selected source entry pointer from source table +0x8."],
  [0xe3d08c, "draw-consumer-program-wrapper-load", "f9400388", "0xe3ce74 loads the program wrapper from the selected source entry."],
  [0xe3d0a4, "draw-consumer-gl-use-program-call", "97e5490f", "0xe3ce74 calls glUseProgram with the selected source entry program."],
  [0xe3d0a8, "draw-consumer-source-entry-param-payload-load", "f9400780", "0xe3ce74 loads the selected source entry parameter payload."],
  [0xe3d0ac, "draw-consumer-source-object-fallback-payload-load", "f94006a1", "0xe3ce74 loads the material/source object fallback parameter payload."],
  [0xe3d0c0, "draw-consumer-param-apply-call", "94297e75", "0xe3ce74 applies selected/fallback parameter payloads through 0x189ca94."],
  [0xe3d0c8, "draw-consumer-no-source-zero-arg", "2a1f03e0", "0xe3ce74 uses zero as the no-source material helper argument."],
  [0xe3d0cc, "draw-consumer-no-source-state-helper-call", "942998d8", "0xe3ce74 calls 0x18a342c when no material/source object is present."],
  [0xe3d0d4, "draw-consumer-mode-low-nibble", "12000d08", "0xe3ce74 extracts payload +0x220 low-nibble primitive mode."],
  [0xe3d0e8, "draw-consumer-triangle-mode-mask-test", "6a19013f", "0xe3ce74 tests mode mask 0x183 for GL_TRIANGLES."],
  [0xe3d0f0, "draw-consumer-triangle-strip-mask-test", "721c093f", "0xe3ce74 tests mode mask 0x70 for GL_TRIANGLE_STRIP."],
  [0xe3cedc, "draw-consumer-attribute-layout-points", "52800221", "0xe3ce74 selects attribute layout 0x11 for GL_POINTS."],
  [0xe3d104, "draw-consumer-attribute-layout-strips", "52800621", "0xe3ce74 selects attribute layout 0x31 for GL_TRIANGLE_STRIP."],
  [0xe3d12c, "draw-consumer-attribute-layout-triangles", "52800621", "0xe3ce74 selects attribute layout 0x31 for GL_TRIANGLES."],
  [0xe3d10c, "draw-consumer-attribute-helper-call-strips", "97ff2b99", "0xe3ce74 calls 0xe07f70 to bind vertex attributes for strips."],
  [0xe3d134, "draw-consumer-attribute-helper-call-triangles", "97ff2b8f", "0xe3ce74 calls 0xe07f70 to bind vertex attributes for triangles."],
  [0xe3d118, "draw-consumer-gl-mode-triangle-strip", "528000a0", "0xe3ce74 selects GL_TRIANGLE_STRIP (5)."],
  [0xe3d140, "draw-consumer-gl-mode-triangles", "321e03e0", "0xe3ce74 selects GL_TRIANGLES (4)."],
  [0xe3cef0, "draw-consumer-gl-mode-points", "2a1f03e0", "0xe3ce74 selects GL_POINTS (0)."],
  [0xe3d14c, "draw-consumer-gl-draw-arrays-call", "97e56641", "0xe3ce74 calls glDrawArrays with segment start/count."],
  [0xe3d158, "draw-consumer-segment-loop-advance", "910042f7", "0xe3ce74 advances the segment cursor by the 0x10-byte segment stride."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ address, role, expectedOpcodeHex, evidence }));

const bufferLifecycleSpecs = [
  [0xe3d65c, "buffer-lifecycle-map-layout-arg", "52800621", "ownerB vtable +0x18 passes layout 0x31 to the buffer map helper."],
  [0xe3d660, "buffer-lifecycle-map-flags-arg", "321f07e2", "ownerB vtable +0x18 passes map/update flag 6 to the buffer map helper."],
  [0xe3d664, "buffer-lifecycle-map-helper-call", "9429a2e2", "ownerB vtable +0x18 calls 0x18a61ec to map/prepare the attribute buffer."],
  [0xe3d6c4, "buffer-lifecycle-unmap-layout-arg", "52800621", "ownerB vtable +0x20 passes layout 0x31 to the buffer flush helper."],
  [0xe3d6cc, "buffer-lifecycle-unmap-helper-tailcall", "1429a307", "ownerB vtable +0x20 tail-calls 0x18a62e8 to unmap/finalize the attribute buffer."],
  [0x18a6254, "buffer-lifecycle-map-gl-bind-buffer-call", "97bbbe53", "0x18a61ec calls glBindBuffer before creating/updating the mapped buffer."],
  [0x18a6288, "buffer-lifecycle-map-gl-buffer-data-call", "97bbc3f6", "0x18a61ec calls glBufferData for the prepared buffer span."],
  [0x18a6294, "buffer-lifecycle-map-gl-map-buffer-call", "97bbb4c3", "0x18a61ec calls glMapBufferOES to map the buffer."],
  [0x18a6340, "buffer-lifecycle-unmap-gl-bind-buffer-call", "97bbbe18", "0x18a62e8 calls glBindBuffer before unmapping the buffer."],
  [0x18a6354, "buffer-lifecycle-unmap-gl-unmap-buffer-call", "97bbae43", "0x18a62e8 calls glUnmapBufferOES to finalize the mapped buffer."],
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

function fileOffsetForVirtualAddress(elf, virtualAddress, byteLength = 4) {
  for (const segment of elf.loads) {
    if (virtualAddress >= segment.virtualAddress && virtualAddress + byteLength <= segment.virtualAddress + segment.fileSize) {
      return segment.fileOffset + (virtualAddress - segment.virtualAddress);
    }
  }
  return -1;
}

function opcodeRowsForSpecs(stage, buffer, elf, specs) {
  return specs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      stage,
      role: spec.role,
      source: "current-android-arm64",
      address: spec.address,
      addressHex: hex(spec.address),
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      expectedPointerHex: "",
      actualPointerHex: "",
      pointerMatches: "",
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function pointerRowsForSpecs(buffer, elf, specs) {
  return specs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 8);
    const actualPointer = fileOffset >= 0 ? buffer.readBigUInt64LE(fileOffset) : null;
    const expectedPointer = BigInt(spec.expectedPointer);
    return {
      stage: "command-vtable",
      role: spec.role,
      source: "current-android-arm64",
      address: spec.address,
      addressHex: hex(spec.address),
      expectedOpcodeHex: "",
      actualOpcodeHex: "",
      opcodeMatches: "",
      expectedPointerHex: hex(spec.expectedPointer),
      actualPointerHex: pointerHex(actualPointer),
      pointerMatches: actualPointer === expectedPointer,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function countRows(rows, predicate) {
  return rows.filter(predicate).length;
}

function buildCurrentNativeLayoutBFinalPrimitiveConsumerAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);

  const vtablePointerRows = pointerRowsForSpecs(buffer, elf, commandVtablePointerSpecs);
  const commandConstructorRows = opcodeRowsForSpecs("command-constructor", buffer, elf, commandConstructorSpecs);
  const segmentBuilderRows = opcodeRowsForSpecs("segment-builder", buffer, elf, segmentBuilderSpecs);
  const drawConsumerRows = opcodeRowsForSpecs("draw-consumer", buffer, elf, drawConsumerSpecs);
  const bufferLifecycleRows = opcodeRowsForSpecs("buffer-lifecycle", buffer, elf, bufferLifecycleSpecs);

  const opcodeRows = [
    ...commandConstructorRows,
    ...segmentBuilderRows,
    ...drawConsumerRows,
    ...bufferLifecycleRows,
  ];
  const allRows = [...vtablePointerRows, ...opcodeRows];
  const opcodeMismatchRows = countRows(opcodeRows, (row) => !row.opcodeMatches);
  const pointerMismatchRows = countRows(vtablePointerRows, (row) => !row.pointerMatches);
  const hasRole = (rows, role) => rows.some((row) => row.role === role && (row.opcodeMatches === true || row.pointerMatches === true));
  const commandVtableRecovered =
    pointerMismatchRows === 0 && hasRole(vtablePointerRows, "command-vtable-slot-0x8-draw-consumer");
  const segmentListRecovered =
    opcodeMismatchRows === 0 &&
    hasRole(segmentBuilderRows, "segment-builder-segment-list-store") &&
    hasRole(segmentBuilderRows, "segment-builder-segment-count-store") &&
    hasRole(segmentBuilderRows, "segment-builder-segment-start-store") &&
    hasRole(segmentBuilderRows, "segment-builder-segment-count-store-0xa");
  const currentDrawStateRecovered =
    opcodeMismatchRows === 0 &&
    hasRole(drawConsumerRows, "draw-consumer-render-state-low-word-call") &&
    hasRole(drawConsumerRows, "draw-consumer-gl-disable-depth-call") &&
    hasRole(drawConsumerRows, "draw-consumer-gl-polygon-offset-call-a");
  const currentProgramBindingRecovered =
    opcodeMismatchRows === 0 &&
    hasRole(drawConsumerRows, "draw-consumer-material-source-load") &&
    hasRole(drawConsumerRows, "draw-consumer-gl-use-program-call") &&
    hasRole(drawConsumerRows, "draw-consumer-param-apply-call");
  const currentDrawModeMappingRecovered =
    opcodeMismatchRows === 0 &&
    hasRole(drawConsumerRows, "draw-consumer-gl-mode-points") &&
    hasRole(drawConsumerRows, "draw-consumer-gl-mode-triangle-strip") &&
    hasRole(drawConsumerRows, "draw-consumer-gl-mode-triangles") &&
    hasRole(drawConsumerRows, "draw-consumer-gl-draw-arrays-call");
  const currentAttributeBindingRecovered =
    opcodeMismatchRows === 0 &&
    hasRole(drawConsumerRows, "draw-consumer-attribute-helper-call-strips") &&
    hasRole(drawConsumerRows, "draw-consumer-attribute-helper-call-triangles");
  const currentBufferLifecycleRecovered =
    opcodeMismatchRows === 0 &&
    hasRole(bufferLifecycleRows, "buffer-lifecycle-map-helper-call") &&
    hasRole(bufferLifecycleRows, "buffer-lifecycle-unmap-helper-tailcall") &&
    hasRole(bufferLifecycleRows, "buffer-lifecycle-map-gl-map-buffer-call") &&
    hasRole(bufferLifecycleRows, "buffer-lifecycle-unmap-gl-unmap-buffer-call");

  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only final primitive consumer audit; proves current command vtable, segment list, draw state, program binding, draw mode, attribute binding, and buffer lifecycle without enabling shader or texture takeover",
    summary: {
      commandConstructorRows: commandConstructorRows.length,
      segmentBuilderRows: segmentBuilderRows.length,
      drawConsumerRows: drawConsumerRows.length,
      bufferLifecycleRows: bufferLifecycleRows.length,
      opcodeRows: opcodeRows.length,
      vtablePointerRows: vtablePointerRows.length,
      opcodeMismatchRows,
      pointerMismatchRows,
      commandVtableRecovered,
      segmentListRecovered,
      currentFinalPrimitiveConsumerRecovered:
        commandVtableRecovered &&
        segmentListRecovered &&
        currentDrawStateRecovered &&
        currentProgramBindingRecovered &&
        currentDrawModeMappingRecovered &&
        currentAttributeBindingRecovered,
      currentDrawStateRecovered,
      currentProgramBindingRecovered,
      currentDrawModeMappingRecovered,
      currentAttributeBindingRecovered,
      currentBufferLifecycleRecovered,
      shaderTextureFormulaRecovered: false,
      textureSamplerFormulaRecovered: false,
      renderPromotionAllowedRows: countRows(allRows, (row) => row.renderPromotionAllowed),
    },
    interpretation: {
      command:
        "0xe3d184 creates the command object and installs vptr 0x272f2f0; vtable slot +0x8 is 0xe3ce74.",
      segment:
        "0xe3d400 builds the command segment list at command +0x68/+0x70 and records per-payload start/count spans at segment +0x8/+0xa.",
      draw:
        "0xe3ce74 is the current final primitive consumer: it applies render state, selects source/program parameters, binds attributes, maps low-nibble modes to GL draw modes, and calls glDrawArrays.",
      boundary:
        "This closes the current draw-command consumer chain, but not the shader texture formula, sampler state, UV animation, or atlas frame rules needed for viewer render takeover.",
    },
    unresolved: [
      "exact current shader texture and sampler parameter formulas below the 0xe08104/0x189ca94 state helpers",
      "texture atlas frame, UV scroll, emissive, reflection, and alpha/depth material parameter mapping",
      "safe viewer render-promotion rule that uses current shader/sampler formulas instead of broad material heuristics",
    ],
    vtablePointerRows,
    commandConstructorRows,
    segmentBuilderRows,
    drawConsumerRows,
    bufferLifecycleRows,
  };
}

function exportCurrentNativeLayoutBFinalPrimitiveConsumerAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBFinalPrimitiveConsumerAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.vtablePointerRows,
      ...manifest.commandConstructorRows,
      ...manifest.segmentBuilderRows,
      ...manifest.drawConsumerRows,
      ...manifest.bufferLifecycleRows,
    ],
    [
      "stage",
      "role",
      "source",
      "addressHex",
      "expectedOpcodeHex",
      "actualOpcodeHex",
      "opcodeMatches",
      "expectedPointerHex",
      "actualPointerHex",
      "pointerMatches",
      "evidence",
      "renderPromotionAllowed",
    ],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBFinalPrimitiveConsumerAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBFinalPrimitiveConsumerAudit,
  exportCurrentNativeLayoutBFinalPrimitiveConsumerAudit,
};
