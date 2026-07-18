#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { engineHashHex } = require("./engine_hash");

const defaultDataRoot = "extracted/ios_raw/Payload/GameKindred.app/Data";
const defaultBuildResourceIndexPath = "extracted/reports/build_resource_index.json";
const defaultDefinitionSymbolsPath = "extracted/reports/cff0_definition_symbols.tsv";
const defaultJsonOut = "extracted/reports/typed_object_runtime_key_payload_audit.json";
const defaultViewerOut = "extracted/viewer/typed-object-runtime-key-payload-audit.json";
const defaultTsvOut = "extracted/reports/typed_object_runtime_key_payload_audit.tsv";

const scanBytes = 64 * 1024;
const prefixBytes = 256;
const frameBufferCapacity = 0x2800;
const sampleLimit = 100;

const payloadTypes = new Map([
  [0x03e9, { name: "inline-runtime-key-writer", minimumBytes: 0x67, fieldSource: "payload +0x20" }],
  [0x03f3, { name: "object-builder-b", minimumBytes: 0x2ec, fieldSource: "payload word0" }],
  [0x046f, { name: "runtime-key-selection", minimumBytes: 0x47, fieldSource: "payload +0x0" }],
]);

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function normalizeHexWord(value) {
  return String(value || "").replace(/^0x/i, "").toUpperCase().padStart(8, "0");
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readFilePrefix(filePath, byteLimit) {
  let fileHandle;
  try {
    fileHandle = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(byteLimit);
    const bytesRead = fs.readSync(fileHandle, buffer, 0, byteLimit, 0);
    return buffer.subarray(0, bytesRead);
  } catch {
    return Buffer.alloc(0);
  } finally {
    if (fileHandle !== undefined) {
      try {
        fs.closeSync(fileHandle);
      } catch {
        // Best-effort diagnostic scan.
      }
    }
  }
}

function classifyPrefix(prefix) {
  if (prefix.length === 0) return "empty-or-unreadable";
  if (prefix.length >= 4 && prefix.subarray(0, 4).toString("ascii") === "RSC0") return "rsc0";
  if (prefix.length >= 4 && prefix.subarray(0, 4).toString("ascii") === "CFF0") return "cff0";
  if (prefix.length >= 4 && prefix.subarray(0, 4).toString("ascii") === "OggS") return "ogg";
  if (prefix.length >= 3 && prefix.subarray(0, 3).toString("ascii") === "ID3") return "mp3";
  if (prefix.length >= 2 && prefix[0] === 0xff && (prefix[1] & 0xe0) === 0xe0) return "mpeg-audio";
  if (prefix.length >= 4 && prefix.subarray(0, 4).toString("ascii") === "RIFF") return "riff";
  const printable = prefix
    .subarray(0, Math.min(prefix.length, 64))
    .filter((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 0x20 && byte <= 0x7e)).length;
  if (printable >= Math.min(prefix.length, 64) * 0.85) return "mostly-text";
  return "unknown-data";
}

function inspectRsc0(prefix, fileSize) {
  if (prefix.length < 0x24 || prefix.subarray(0, 4).toString("ascii") !== "RSC0") return null;
  const expectedPayloadSize = Math.max(0, fileSize - 0x20);
  const innerOffset = 0x20;
  const innerMagic = prefix.subarray(innerOffset, Math.min(prefix.length, innerOffset + 4)).toString("ascii");
  let innerClass = "rsc0-inner-unknown";
  if (innerMagic === "CFF0") {
    innerClass = "rsc0-inner-cff0";
  } else if (prefix.length >= innerOffset + 4 && prefix.readUInt32LE(innerOffset) === fileSize) {
    innerClass = "rsc0-inner-size-prefixed-resource";
  } else if (prefix.length >= innerOffset + 4 && prefix.readUInt32LE(innerOffset) === expectedPayloadSize) {
    innerClass = "rsc0-inner-payload-size-prefixed-resource";
  }
  return { innerClass };
}

function readPrintableCString(buffer, offset, maxBytes = 96, minBytes = 4) {
  if (offset < 0 || offset >= buffer.length) return "";
  const bytes = [];
  const end = Math.min(buffer.length, offset + maxBytes);
  for (let cursor = offset; cursor < end; cursor += 1) {
    const byte = buffer[cursor];
    if (byte === 0) {
      if (bytes.length < minBytes) return "";
      const value = Buffer.from(bytes).toString("utf8");
      return /^[\x20-\x7e]{4,96}$/.test(value) ? value : "";
    }
    if (byte < 0x20 || byte > 0x7e) return "";
    bytes.push(byte);
  }
  return "";
}

function isResourceLikeRuntimeKeyString(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_*:/.\-]{4,96}$/.test(value) &&
    /[A-Za-z]/.test(value)
  );
}

function addLookupValue(lookup, value, match) {
  if (!value) return;
  if (!lookup.exact.has(value)) lookup.exact.set(value, []);
  lookup.exact.get(value).push(match);
  const lower = value.toLowerCase();
  if (!lookup.lower.has(lower)) lookup.lower.set(lower, []);
  lookup.lower.get(lower).push(match);
  const hash = engineHashHex(value);
  if (!lookup.engineHash.has(hash)) lookup.engineHash.set(hash, []);
  lookup.engineHash.get(hash).push({ ...match, hashSourceValue: value });
}

function loadResourceLookup({ buildResourceIndexPath, definitionSymbolsPath }) {
  const lookup = {
    buildResourceIndexPath,
    buildResourceIndexExists: fs.existsSync(buildResourceIndexPath),
    definitionSymbolsPath,
    definitionSymbolsExists: fs.existsSync(definitionSymbolsPath),
    exact: new Map(),
    lower: new Map(),
    engineHash: new Map(),
    indexedResourceRows: 0,
    symbolRows: 0,
  };

  if (lookup.buildResourceIndexExists) {
    const index = JSON.parse(fs.readFileSync(buildResourceIndexPath, "utf8"));
    for (const row of index.matched || []) {
      lookup.indexedResourceRows += 1;
      const baseMatch = {
        kind: "build-resource-index",
        relativePath: row.relativePath || "",
        buildPath: row.buildPath || "",
        filePath: row.filePath || "",
      };
      addLookupValue(lookup, row.relativePath, { ...baseMatch, valueKind: "relativePath" });
      addLookupValue(lookup, row.buildPath, { ...baseMatch, valueKind: "buildPath" });
      addLookupValue(
        lookup,
        row.relativePath ? `build://${row.relativePath}` : "",
        { ...baseMatch, valueKind: "build://relativePath" },
      );
    }
  }

  if (lookup.definitionSymbolsExists) {
    const lines = fs.readFileSync(definitionSymbolsPath, "utf8").split(/\r?\n/);
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const [relativePath, hash, symbol] = line.split("\t");
      lookup.symbolRows += 1;
      addLookupValue(lookup, symbol, {
        kind: "definition-symbol",
        valueKind: "symbol",
        relativePath: relativePath || "",
        hash: hash || "",
        symbol: symbol || "",
      });
    }
  }

  return lookup;
}

function pushSample(list, row) {
  if (list.length < sampleLimit) list.push(row);
}

function compactMatches(matches, limit = 5) {
  return (matches || []).slice(0, limit).map((match) => ({
    kind: match.kind,
    valueKind: match.valueKind,
    relativePath: match.relativePath || "",
    buildPath: match.buildPath || "",
    symbol: match.symbol || "",
    hashSourceValue: match.hashSourceValue || "",
  }));
}

function scanPrefixForPayloadFields(prefix, fileSize, fileInfo, lookup, audit) {
  for (let offset = 0; offset + 4 <= prefix.length; offset += 1) {
    const frameLength = prefix.readUInt16BE(offset);
    const typeId = prefix.readUInt16BE(offset + 2);
    const typeInfo = payloadTypes.get(typeId);
    if (!typeInfo) continue;
    if (frameLength < typeInfo.minimumBytes || frameLength > frameBufferCapacity) continue;
    if (offset + 2 + frameLength > fileSize) continue;

    const payloadOffset = offset + 4;
    const typeHex = hex(typeId);
    audit.frameCandidateCount += 1;
    audit.frameCandidateTypeCounts[typeHex] = (audit.frameCandidateTypeCounts[typeHex] || 0) + 1;

    const baseRow = {
      relativePath: fileInfo.relativePath,
      size: fileInfo.size,
      containerClass: fileInfo.containerClass,
      rsc0InnerClass: fileInfo.rsc0InnerClass,
      offset,
      offsetHex: hex(offset),
      frameLength,
      payloadOffset,
      payloadOffsetHex: hex(payloadOffset),
      typeId,
      typeIdHex: typeHex,
      typeName: typeInfo.name,
      fieldSource: typeInfo.fieldSource,
      headHex: prefix.subarray(offset, Math.min(prefix.length, offset + 16)).toString("hex"),
    };

    if (typeId === 0x046f || typeId === 0x03e9) {
      const fieldOffset = typeId === 0x046f ? payloadOffset : payloadOffset + 0x20;
      const keyString = readPrintableCString(prefix, fieldOffset);
      if (!keyString) {
        pushSample(audit.noKeyStringSamples, {
          ...baseRow,
          fieldOffset,
          fieldOffsetHex: hex(fieldOffset),
        });
        continue;
      }

      audit.keyStringCandidateCount += 1;
      audit.keyStringCandidateTypeCounts[typeHex] =
        (audit.keyStringCandidateTypeCounts[typeHex] || 0) + 1;
      const resourceLike = isResourceLikeRuntimeKeyString(keyString);
      if (resourceLike) {
        audit.resourceLikeKeyStringCount += 1;
        audit.resourceLikeKeyStringTypeCounts[typeHex] =
          (audit.resourceLikeKeyStringTypeCounts[typeHex] || 0) + 1;
      }

      const exactMatches = lookup.exact.get(keyString) || [];
      const lowerMatches = lookup.lower.get(keyString.toLowerCase()) || [];
      const caseInsensitiveOnly = exactMatches.length === 0 ? lowerMatches : [];
      if (exactMatches.length > 0) {
        audit.exactKeyStringMatchCount += 1;
        audit.exactKeyStringMatchTypeCounts[typeHex] =
          (audit.exactKeyStringMatchTypeCounts[typeHex] || 0) + 1;
      }
      if (caseInsensitiveOnly.length > 0) {
        audit.caseInsensitiveKeyStringMatchCount += 1;
      }

      const row = {
        ...baseRow,
        fieldOffset,
        fieldOffsetHex: hex(fieldOffset),
        keyString,
        resourceLike,
        exactMatchCount: exactMatches.length,
        caseInsensitiveOnlyMatchCount: caseInsensitiveOnly.length,
        exactMatches: compactMatches(exactMatches),
        caseInsensitiveOnlyMatches: compactMatches(caseInsensitiveOnly),
      };
      if (exactMatches.length > 0) {
        pushSample(audit.exactKeyStringMatchSamples, row);
      } else if (resourceLike) {
        pushSample(audit.resourceLikeKeyStringSamples, row);
      } else {
        pushSample(audit.lowConfidenceKeyStringSamples, row);
      }
      continue;
    }

    if (typeId === 0x03f3 && payloadOffset + 4 <= prefix.length) {
      const word0BigEndian = prefix.readUInt32BE(payloadOffset);
      const word0Native = prefix.readUInt32LE(payloadOffset);
      const word0BigEndianHex = normalizeHexWord(hex(word0BigEndian));
      const word0NativeHex = normalizeHexWord(hex(word0Native));
      audit.objectBuilderWord0CandidateCount += 1;
      const bigEndianMatches = lookup.engineHash.get(word0BigEndianHex) || [];
      const nativeMatches = lookup.engineHash.get(word0NativeHex) || [];
      const matchCount = bigEndianMatches.length + nativeMatches.length;
      if (bigEndianMatches.length > 0) audit.objectBuilderWord0BigEndianEngineHashMatchCount += 1;
      if (nativeMatches.length > 0) audit.objectBuilderWord0NativeEngineHashMatchCount += 1;
      if (matchCount > 0) {
        audit.objectBuilderWord0EngineHashMatchCount += 1;
        pushSample(audit.objectBuilderWord0EngineHashMatchSamples, {
          ...baseRow,
          resourceKeyWord0BigEndian: word0BigEndian,
          resourceKeyWord0BigEndianHex: `0x${word0BigEndianHex}`,
          resourceKeyWord0Native: word0Native,
          resourceKeyWord0NativeHex: `0x${word0NativeHex}`,
          bigEndianMatchCount: bigEndianMatches.length,
          nativeMatchCount: nativeMatches.length,
          matchCount,
          bigEndianMatches: compactMatches(bigEndianMatches),
          nativeMatches: compactMatches(nativeMatches),
        });
      } else {
        pushSample(audit.objectBuilderWord0Samples, {
          ...baseRow,
          resourceKeyWord0BigEndian: word0BigEndian,
          resourceKeyWord0BigEndianHex: `0x${word0BigEndianHex}`,
          resourceKeyWord0Native: word0Native,
          resourceKeyWord0NativeHex: `0x${word0NativeHex}`,
        });
      }
    }
  }
}

function scanDataRoot({ dataRoot, lookup }) {
  const audit = {
    dataRoot,
    dataRootExists: fs.existsSync(dataRoot),
    scanBytes,
    policy:
      "diagnostic-only field-level scan using current-binary payload layouts; matches do not enable renderer takeover without active preview caller proof",
    lookup: {
      buildResourceIndexPath: lookup.buildResourceIndexPath,
      buildResourceIndexExists: lookup.buildResourceIndexExists,
      indexedResourceRows: lookup.indexedResourceRows,
      definitionSymbolsPath: lookup.definitionSymbolsPath,
      definitionSymbolsExists: lookup.definitionSymbolsExists,
      definitionSymbolRows: lookup.symbolRows,
      exactLookupValues: lookup.exact.size,
      engineHashValues: lookup.engineHash.size,
    },
    fileCount: 0,
    scannedFileCount: 0,
    scannedBytes: 0,
    prefixClassifications: {},
    frameCandidateCount: 0,
    frameCandidateTypeCounts: {},
    keyStringCandidateCount: 0,
    keyStringCandidateTypeCounts: {},
    resourceLikeKeyStringCount: 0,
    resourceLikeKeyStringTypeCounts: {},
    exactKeyStringMatchCount: 0,
    exactKeyStringMatchTypeCounts: {},
    caseInsensitiveKeyStringMatchCount: 0,
    objectBuilderWord0CandidateCount: 0,
    objectBuilderWord0EngineHashMatchCount: 0,
    objectBuilderWord0BigEndianEngineHashMatchCount: 0,
    objectBuilderWord0NativeEngineHashMatchCount: 0,
    resourceIndexedRuntimeKeyCandidateCount: 0,
    reviewableRuntimeKeyCandidateCount: 0,
    lowConfidenceStructuralCandidateCount: 0,
    exactKeyStringMatchSamples: [],
    resourceLikeKeyStringSamples: [],
    lowConfidenceKeyStringSamples: [],
    noKeyStringSamples: [],
    objectBuilderWord0EngineHashMatchSamples: [],
    objectBuilderWord0Samples: [],
  };

  if (!audit.dataRootExists) {
    audit.state = "ios-raw-data-root-missing";
    audit.activePreviewProof = false;
    audit.rendererTakeoverAllowed = false;
    return audit;
  }

  const visit = (directory) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      let stats;
      try {
        stats = fs.statSync(fullPath);
      } catch {
        continue;
      }
      audit.fileCount += 1;
      const prefix = readFilePrefix(fullPath, prefixBytes);
      const prefixClass = classifyPrefix(prefix);
      audit.prefixClassifications[prefixClass] = (audit.prefixClassifications[prefixClass] || 0) + 1;
      const rsc0 = inspectRsc0(prefix, stats.size);
      const shouldScan =
        prefixClass === "unknown-data" ||
        rsc0?.innerClass === "rsc0-inner-size-prefixed-resource" ||
        rsc0?.innerClass === "rsc0-inner-payload-size-prefixed-resource";
      if (!shouldScan) continue;

      const scanPrefix = readFilePrefix(fullPath, Math.min(stats.size, scanBytes));
      audit.scannedFileCount += 1;
      audit.scannedBytes += scanPrefix.length;
      scanPrefixForPayloadFields(
        scanPrefix,
        stats.size,
        {
          relativePath: path.relative(process.cwd(), fullPath).split(path.sep).join("/"),
          size: stats.size,
          containerClass: prefixClass,
          rsc0InnerClass: rsc0?.innerClass || "",
        },
        lookup,
        audit,
      );
    }
  };

  visit(dataRoot);
  audit.resourceIndexedRuntimeKeyCandidateCount =
    audit.exactKeyStringMatchCount + audit.objectBuilderWord0EngineHashMatchCount;
  audit.reviewableRuntimeKeyCandidateCount =
    audit.resourceIndexedRuntimeKeyCandidateCount + audit.resourceLikeKeyStringCount;
  audit.lowConfidenceStructuralCandidateCount = Math.max(
    0,
    audit.frameCandidateCount - audit.reviewableRuntimeKeyCandidateCount,
  );
  audit.concreteRuntimeKeyFieldMatchedResourceIndex =
    audit.resourceIndexedRuntimeKeyCandidateCount > 0;
  audit.activePreviewProof = false;
  audit.rendererTakeoverAllowed = false;
  audit.state = audit.concreteRuntimeKeyFieldMatchedResourceIndex
    ? "payload-fields-match-resource-index-diagnostic-only"
    : audit.resourceLikeKeyStringCount > 0
      ? "resource-like-runtime-key-fields-no-resource-index-match"
      : audit.frameCandidateCount > 0
        ? "structural-payload-fields-no-usable-runtime-key"
        : "no-runtime-key-payload-field-candidates";
  audit.blocker = audit.concreteRuntimeKeyFieldMatchedResourceIndex
    ? "Some payload fields match resource-index values, but no match is tied to the active hero/model preview caller yet."
    : audit.resourceLikeKeyStringCount > 0
      ? "Scanned local Data contains resource-like runtime key strings, but none match the current resource index or active hero/model preview caller."
      : "Scanned local Data only contains low-confidence structural typed-object hits; no resource-like key string or resource-index-matching object-builder word0 was recovered.";
  audit.requiredNextEvidence = [
    "active preview runtime capture at 0xbebf7c/0xbebf9c/0x8befac",
    "decoded frame/.vgr payload tied to the active hero/model preview session",
    "current-package caller chain proving a matched payload field reaches the Level setup descriptor path",
  ];
  return audit;
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, audit) {
  const rows = [
    [
      "category",
      "typeIdHex",
      "relativePath",
      "offsetHex",
      "fieldSource",
      "value",
      "matchCount",
      "detail",
    ],
    [
      "summary",
      "",
      "",
      "",
      "",
      audit.state,
      audit.resourceIndexedRuntimeKeyCandidateCount,
      `files=${audit.fileCount} scannedFiles=${audit.scannedFileCount} frameCandidates=${audit.frameCandidateCount} reviewable=${audit.reviewableRuntimeKeyCandidateCount} lowConfidence=${audit.lowConfidenceStructuralCandidateCount} keyStrings=${audit.keyStringCandidateCount} resourceLikeKeyStrings=${audit.resourceLikeKeyStringCount} exactKeyMatches=${audit.exactKeyStringMatchCount} word0HashMatches=${audit.objectBuilderWord0EngineHashMatchCount}`,
    ],
  ];
  for (const row of audit.exactKeyStringMatchSamples) {
    rows.push([
      "exact-key-string-match",
      row.typeIdHex,
      row.relativePath,
      row.offsetHex,
      row.fieldSource,
      row.keyString,
      row.exactMatchCount,
      JSON.stringify(row.exactMatches),
    ]);
  }
  for (const row of audit.resourceLikeKeyStringSamples) {
    rows.push([
      "resource-like-key-string-no-index-match",
      row.typeIdHex,
      row.relativePath,
      row.offsetHex,
      row.fieldSource,
      row.keyString,
      0,
      row.headHex,
    ]);
  }
  for (const row of audit.objectBuilderWord0EngineHashMatchSamples) {
    rows.push([
      "object-builder-word0-engine-hash-match",
      row.typeIdHex,
      row.relativePath,
      row.offsetHex,
      row.fieldSource,
      row.resourceKeyWord0NativeHex || row.resourceKeyWord0BigEndianHex,
      row.matchCount,
      JSON.stringify({
        nativeMatches: row.nativeMatches || [],
        bigEndianMatches: row.bigEndianMatches || [],
      }),
    ]);
  }
  fs.writeFileSync(filePath, `${rows.map((row) => row.map(tsvEscape).join("\t")).join("\n")}\n`);
}

function main() {
  const args = process.argv.slice(2);
  const dataRoot = optionValue(args, "--data-root", defaultDataRoot);
  const buildResourceIndexPath = optionValue(args, "--resource-index", defaultBuildResourceIndexPath);
  const definitionSymbolsPath = optionValue(args, "--definition-symbols", defaultDefinitionSymbolsPath);
  const jsonOut = optionValue(args, "--json-out", defaultJsonOut);
  const viewerOut = optionValue(args, "--viewer-out", defaultViewerOut);
  const tsvOut = optionValue(args, "--tsv-out", defaultTsvOut);

  const lookup = loadResourceLookup({ buildResourceIndexPath, definitionSymbolsPath });
  const audit = scanDataRoot({ dataRoot, lookup });
  ensureDirFor(jsonOut);
  ensureDirFor(viewerOut);
  ensureDirFor(tsvOut);
  fs.writeFileSync(jsonOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, audit);

  console.log(
    JSON.stringify(
      {
        state: audit.state,
        files: audit.fileCount,
        scannedFiles: audit.scannedFileCount,
        frameCandidates: audit.frameCandidateCount,
        keyStringCandidates: audit.keyStringCandidateCount,
        resourceLikeKeyStrings: audit.resourceLikeKeyStringCount,
        exactKeyStringMatches: audit.exactKeyStringMatchCount,
        objectBuilderWord0Candidates: audit.objectBuilderWord0CandidateCount,
        objectBuilderWord0EngineHashMatches: audit.objectBuilderWord0EngineHashMatchCount,
        objectBuilderWord0NativeEngineHashMatches:
          audit.objectBuilderWord0NativeEngineHashMatchCount,
        objectBuilderWord0BigEndianEngineHashMatches:
          audit.objectBuilderWord0BigEndianEngineHashMatchCount,
        resourceIndexedRuntimeKeyCandidates: audit.resourceIndexedRuntimeKeyCandidateCount,
        reviewableRuntimeKeyCandidates: audit.reviewableRuntimeKeyCandidateCount,
        lowConfidenceStructuralCandidates: audit.lowConfidenceStructuralCandidateCount,
        activePreviewProof: audit.activePreviewProof,
        rendererTakeoverAllowed: audit.rendererTakeoverAllowed,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  loadResourceLookup,
  scanDataRoot,
};
