#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { findFunctionBlocks } = require("./native_bind_xrefs");
const { parseElf64 } = require("./current_native_anchor_audit");

const defaultAndroidSource =
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00cf5.c";
const defaultIosSource = "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/1003c.c";
const defaultAndroidBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultBinaryAuditPath = "extracted/viewer/native-binary-version-audit.json";
const defaultViewerOut = "extracted/viewer/native-transient-record-runtime-executor.json";
const defaultTsvOut = "extracted/reports/native_transient_record_runtime_executor.tsv";
const defaultJsonOut = "extracted/reports/native_transient_record_runtime_executor_summary.json";

const stageSpecs = [
  {
    stage: "constructor-vtable",
    semanticClass: "runtime-record-constructor",
    android: {
      functionName: "FUN_00cf5400",
      fields: ["vtable=PTR_FUN_0280f9c8"],
      patterns: [/PTR_FUN_0280f9c8/],
      calls: [],
    },
    ios: {
      functionName: "FUN_1003c3778",
      fields: ["vtable=PTR_FUN_101496188"],
      patterns: [/PTR_FUN_101496188/],
      calls: [],
    },
    conclusion: "constructs the runtime record object; current-package vtable identity is not enough by itself to prove visual rendering",
  },
  {
    stage: "enabled-flag",
    semanticClass: "runtime-record-gate",
    android: {
      functionName: "FUN_00cf55fc",
      fields: ["0xa8 bit0"],
      patterns: [/\*\(byte \*\)\(param_4 \+ 0xa8\).*& 1/],
      calls: [],
    },
    ios: {
      functionName: "FUN_1003c37d0",
      fields: ["0xa8 bit0"],
      patterns: [/\*\(byte \*\)\(param_1 \+ 0xa8\).*& 1/],
      calls: [],
    },
    conclusion: "record execution is gated by a runtime active flag",
  },
  {
    stage: "shape-record-copy",
    semanticClass: "shape-query-record",
    android: {
      functionName: "FUN_00cf55fc",
      fields: ["0x18", "0x20", "0x24..0x6a"],
      patterns: [/param_4 \+ 0x18/, /param_4 \+ 0x20/, /memcpy\(auStack_6f4,\(void \*\)\(param_4 \+ 0x24\),0x47\)/],
      calls: ["FUN_00d4db40", "FUN_00d4db48"],
    },
    ios: {
      functionName: "FUN_1003c37d0",
      fields: ["0x18", "0x20", "0x24..0x6a"],
      patterns: [/param_1 \+ 0x18/, /param_1 \+ 0x20/, /param_1 \+ 0x24/, /param_1 \+ 0x5c/],
      calls: [],
    },
    conclusion: "copies a shape/query descriptor into a local query object, not a draw mesh",
  },
  {
    stage: "source-anchor",
    semanticClass: "runtime-anchor-resolution",
    android: {
      functionName: "FUN_00cf55fc",
      fields: ["0x98", "0xa8 bit3"],
      patterns: [/param_4 \+ 0x98/, /0x811c9dc5/, /FUN_00d58298/, /FUN_00d55794/],
      calls: ["FUN_00d5048c", "FUN_00d58298", "FUN_00d55794", "FUN_00d51a94"],
    },
    ios: {
      functionName: "FUN_1003c37d0",
      fields: ["0x98", "0xa8 bit3"],
      patterns: [/param_1 \+ 0x98/, /0x811c9dc5/, /FUN_1003ab468/, /param_2 \+ 0x1c8/],
      calls: ["FUN_1003ab468"],
    },
    conclusion: "resolves owner/target/hashed anchor context before querying affected objects",
  },
  {
    stage: "radius-source",
    semanticClass: "query-radius-source",
    android: {
      functionName: "FUN_00cf55fc",
      fields: ["0x70", "0x78", "0xa0", "0xa4"],
      patterns: [/param_4 \+ 0xa0/, /param_4 \+ 0x70/, /param_4 \+ 0x78/, /param_4 \+ 0xa4/],
      calls: ["FUN_00d4db94"],
    },
    ios: {
      functionName: "FUN_1003c37d0",
      fields: ["0x70", "0x78", "0xa0", "0xa4"],
      patterns: [/param_1 \+ 0xa0/, /param_1 \+ 0x70/, /param_1 \+ 0x78/, /param_1 \+ 0xa4/],
      calls: [],
    },
    conclusion: "computes query radius/extent from constant or callback sources",
  },
  {
    stage: "secondary-filter",
    semanticClass: "query-filter-source",
    android: {
      functionName: "FUN_00cf55fc",
      fields: ["0x80", "0x90", "0xa8 bit1", "0xa8 bit4"],
      patterns: [/param_4 \+ 0x90/, /param_4 \+ 0x80/, /FUN_00cf5968/, /FUN_00d4eb08/],
      calls: ["FUN_00cf5968", "FUN_00d4eb08"],
    },
    ios: {
      functionName: "FUN_1003c37d0",
      fields: ["0x80", "0x90", "0xa8 bit1", "0xa8 bit4"],
      patterns: [/param_1 \+ 0x90/, /param_1 \+ 0x80/, /FUN_1003c3bf0/, /PTR_FUN_101499a08/],
      calls: ["FUN_1003c3bf0"],
    },
    conclusion: "adds runtime callback-derived query filters, still before any target application",
  },
  {
    stage: "target-query",
    semanticClass: "target-query",
    android: {
      functionName: "FUN_00cf55fc",
      fields: ["local query object", "maxResults=200"],
      patterns: [/FUN_00d9e840\(&local_708,local_6a8,200,puVar6\)/],
      calls: ["FUN_00d9e840"],
    },
    ios: {
      functionName: "FUN_1003c37d0",
      fields: ["local query object", "maxResults=200"],
      patterns: [/FUN_1003a6ce4\(&local_718,local_6b8,200,pppuVar6\)/],
      calls: ["FUN_1003a6ce4"],
    },
    conclusion: "queries up to 200 runtime targets/entities",
  },
  {
    stage: "apply-results",
    semanticClass: "target-effect-application",
    android: {
      functionName: "FUN_00cf55fc",
      fields: ["0xa8 bit2"],
      patterns: [/FUN_00d518f4\(param_5,\*\(undefined8 \*\)pfVar7\)/],
      calls: ["FUN_00d518f4", "FUN_00d51a94", "FUN_00d51778"],
    },
    ios: {
      functionName: "FUN_1003c37d0",
      fields: ["0xa8 bit2"],
      patterns: [/FUN_1003b4bec\(param_2,\*\(undefined8 \*\)pfVar11\)/],
      calls: ["FUN_1003b4bec"],
    },
    conclusion: "applies the effect/action to matched target entities; this is not a visual draw call",
  },
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function hexBigInt(value) {
  return typeof value === "bigint" ? `0x${value.toString(16)}` : "";
}

function tsvEscape(value) {
  if (Array.isArray(value)) return value.join("|").replace(/\t/g, " ").replace(/\r?\n/g, " ");
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function compactLine(text) {
  const trimmed = String(text || "").trim().replace(/\s+/g, " ");
  return trimmed.length > 220 ? `${trimmed.slice(0, 217)}...` : trimmed;
}

function loadFunctionBlock(sourceFile, functionName) {
  if (!sourceFile || !functionName || !fs.existsSync(sourceFile)) return null;
  const lines = fs.readFileSync(sourceFile, "utf8").split(/\r?\n/);
  const block = findFunctionBlocks(lines).find((item) => item.functionName === functionName);
  return block ? { ...block, sourceFile, lines } : null;
}

function findPatternEvidence(block, patterns) {
  if (!block) return [];
  const localLines = block.text.split(/\r?\n/);
  return patterns
    .map((pattern) => {
      const index = localLines.findIndex((line) => pattern.test(line));
      if (index < 0) return null;
      return {
        line: block.startLine + index,
        sample: compactLine(localLines[index]),
      };
    })
    .filter(Boolean);
}

function buildRowsForPlatform(platform, sourceFile, sideKey) {
  const rows = [];
  for (const spec of stageSpecs) {
    const side = spec[sideKey];
    const block = loadFunctionBlock(sourceFile, side.functionName);
    const evidence = findPatternEvidence(block, side.patterns);
    rows.push({
      id: `${platform}:${spec.stage}`,
      platform,
      stage: spec.stage,
      semanticClass: spec.semanticClass,
      sourceFile,
      sourceFunction: side.functionName,
      sourceStartLine: block?.startLine || "",
      sourceEndLine: block?.endLine || "",
      evidenceLines: evidence.map((item) => item.line),
      evidenceSamples: evidence.map((item) => item.sample),
      requiredPatternCount: side.patterns.length,
      matchedPatternCount: evidence.length,
      fields: side.fields,
      nativeCalls: side.calls,
      conclusion: spec.conclusion,
      evidenceStatus: evidence.length === side.patterns.length ? "source-patterns-matched" : "source-patterns-partial",
      renderTakeoverStatus:
        spec.semanticClass === "target-query" || spec.semanticClass === "target-effect-application"
          ? "blocked-runtime-target-query-not-visual-renderer"
          : "blocked-source-semantics-not-visual-renderer",
    });
  }
  return rows;
}

function fileOffsetForVirtualAddress(elf, virtualAddress, byteLength = 8) {
  for (const segment of elf.loads) {
    if (virtualAddress >= segment.virtualAddress && virtualAddress + byteLength <= segment.virtualAddress + segment.fileSize) {
      return segment.fileOffset + (virtualAddress - segment.virtualAddress);
    }
  }
  return -1;
}

function sectionForVirtualAddress(elf, virtualAddress) {
  return (
    elf.sections.find((section) => {
      if (!section.size) return false;
      return virtualAddress >= section.virtualAddress && virtualAddress < section.virtualAddress + section.size;
    }) || null
  );
}

function safeNumberFromPointer(value) {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : NaN;
}

function currentAndroidPointerProbe(binaryPath, centerVirtualAddress = 0x280f9c8) {
  if (!binaryPath || !fs.existsSync(binaryPath)) {
    return { status: "missing-current-android-binary", rows: [] };
  }
  const buffer = fs.readFileSync(binaryPath);
  let elf;
  try {
    elf = parseElf64(buffer);
  } catch (error) {
    return { status: `unreadable-current-android-binary:${error.message}`, rows: [] };
  }

  const rows = [];
  for (let address = centerVirtualAddress - 0x20; address <= centerVirtualAddress + 0x60; address += 8) {
    const fileOffset = fileOffsetForVirtualAddress(elf, address, 8);
    if (fileOffset < 0) continue;
    const pointerValue = buffer.readBigUInt64LE(fileOffset);
    const safeValue = safeNumberFromPointer(pointerValue);
    const valueSection = Number.isFinite(safeValue) ? sectionForVirtualAddress(elf, safeValue)?.name || "" : "";
    rows.push({
      slotAddress: address,
      slotAddressHex: hex(address),
      relativeOffset: address - centerVirtualAddress,
      relativeOffsetHex: hex(address - centerVirtualAddress),
      slotSection: sectionForVirtualAddress(elf, address)?.name || "",
      pointerValueHex: hexBigInt(pointerValue),
      pointerValueSection: valueSection,
      currentCodePointer: valueSection === ".text",
      currentPackageStatus:
        valueSection === ".text" ? "current-android-code-pointer" : "current-android-non-code-or-packed-data",
    });
  }
  const codePointerRows = rows.filter((row) => row.currentCodePointer).length;
  return {
    status: codePointerRows ? "current-android-readable-but-cross-build-symbol-unvalidated" : "current-android-readable-no-code-pointer",
    rows,
  };
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const values = Array.isArray(row[key]) ? row[key] : [row[key]];
    for (const value of values.length ? values : [""]) counts[value || ""] = (counts[value || ""] || 0) + 1;
  }
  return counts;
}

function summarize(rows, pointerProbe, binaryAudit) {
  const stagesByPlatform = new Map();
  for (const row of rows) {
    const key = row.stage;
    if (!stagesByPlatform.has(key)) stagesByPlatform.set(key, new Set());
    stagesByPlatform.get(key).add(row.platform);
  }
  const crossPlatformAlignedStages = [...stagesByPlatform.values()].filter((platforms) => {
    return platforms.has("android") && platforms.has("ios");
  }).length;
  const targetQueryRows = rows.filter((row) => row.semanticClass === "target-query").length;
  const targetApplyRows = rows.filter((row) => row.semanticClass === "target-effect-application").length;
  const fullyMatchedRows = rows.filter((row) => row.evidenceStatus === "source-patterns-matched").length;
  const pointerRows = pointerProbe.rows || [];
  return {
    rows: rows.length,
    androidRows: rows.filter((row) => row.platform === "android").length,
    iosRows: rows.filter((row) => row.platform === "ios").length,
    stages: stagesByPlatform.size,
    crossPlatformAlignedStages,
    fullyMatchedRows,
    partialEvidenceRows: rows.length - fullyMatchedRows,
    targetQueryRows,
    targetApplyRows,
    visualDrawRows: 0,
    renderTakeoverAllowedRows: 0,
    currentAndroidPointerProbeRows: pointerRows.length,
    currentAndroidPointerProbeCodePointers: pointerRows.filter((row) => row.currentCodePointer).length,
    currentAndroidPointerProbeStatus: pointerProbe.status,
    exactBuilds: binaryAudit?.summary?.exactBuilds || 0,
    crossBuildReferences: binaryAudit?.summary?.crossBuildReferences || 0,
    byPlatform: countBy(rows, "platform"),
    bySemanticClass: countBy(rows, "semanticClass"),
    byEvidenceStatus: countBy(rows, "evidenceStatus"),
    byRenderTakeoverStatus: countBy(rows, "renderTakeoverStatus"),
  };
}

function buildNativeTransientRecordRuntimeExecutor({
  androidSource = defaultAndroidSource,
  iosSource = defaultIosSource,
  androidBinary = defaultAndroidBinary,
  binaryAuditPath = defaultBinaryAuditPath,
} = {}) {
  const pointerProbe = currentAndroidPointerProbe(androidBinary);
  const binaryAudit = readJsonIfExists(binaryAuditPath);
  const items = [
    ...buildRowsForPlatform("android", androidSource, "android"),
    ...buildRowsForPlatform("ios", iosSource, "ios"),
  ];
  return {
    generatedAt: new Date().toISOString(),
    policy:
      "diagnostic-only native runtime executor evidence; do not render from this chain because both platforms show target query/application semantics, not visual draw semantics",
    sourceBoundary:
      "HackedGlory structured source is cross-build guidance for this local package; current-package renderer takeover remains blocked until every native anchor is revalidated against the local binary",
    summary: summarize(items, pointerProbe, binaryAudit),
    currentAndroidPointerProbe: pointerProbe,
    items,
  };
}

function exportNativeTransientRecordRuntimeExecutor({
  androidSource = defaultAndroidSource,
  iosSource = defaultIosSource,
  androidBinary = defaultAndroidBinary,
  binaryAuditPath = defaultBinaryAuditPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const manifest = buildNativeTransientRecordRuntimeExecutor({ androidSource, iosSource, androidBinary, binaryAuditPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "id",
    "platform",
    "stage",
    "semanticClass",
    "sourceFile",
    "sourceFunction",
    "sourceStartLine",
    "sourceEndLine",
    "evidenceLines",
    "requiredPatternCount",
    "matchedPatternCount",
    "fields",
    "nativeCalls",
    "evidenceStatus",
    "renderTakeoverStatus",
    "conclusion",
  ]);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeTransientRecordRuntimeExecutor({
    androidSource: optionValue(args, "--android-source", defaultAndroidSource),
    iosSource: optionValue(args, "--ios-source", defaultIosSource),
    androidBinary: optionValue(args, "--android-binary", defaultAndroidBinary),
    binaryAuditPath: optionValue(args, "--binary-audit", defaultBinaryAuditPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildNativeTransientRecordRuntimeExecutor,
  currentAndroidPointerProbe,
  exportNativeTransientRecordRuntimeExecutor,
  summarize,
};
