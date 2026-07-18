#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { analyzeShadergraph } = require("./material_roles");
const { parseCff0Buffer } = require("./cff0_tools");

const defaultPathlessAuditPath = "extracted/reports/cff0_shadergraph_index_audit.json";
const defaultCharacterCandidatesPath = "extracted/reports/ios_character_shadergraph_candidates.tsv";
const defaultEffectCandidatesPath = "extracted/reports/ios_effect_shadergraph_candidates.tsv";
const defaultJsonOut = "extracted/reports/pathless_shadergraph_unique_candidate_diff_audit.json";
const defaultTsvOut = "extracted/reports/pathless_shadergraph_unique_candidate_diff_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function normalizeRel(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readShadergraphCandidateTsv(filePath, source) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [status, relativePath, hash, filePathValue] = line.split("\t");
      return {
        source,
        status: status || "",
        relativePath: normalizeRel(relativePath),
        hash: String(hash || "").toUpperCase(),
        filePath: normalizeRel(filePathValue),
      };
    })
    .filter((row) => row.relativePath);
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function sha256Prefix(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

function extractPrintableAsciiStrings(buffer, minLength = 4) {
  const strings = [];
  let start = -1;
  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index];
    const printable = byte >= 0x20 && byte <= 0x7e;
    if (printable) {
      if (start < 0) start = index;
      continue;
    }
    if (start >= 0 && index - start >= minLength) {
      strings.push(buffer.subarray(start, index).toString("ascii"));
    }
    start = -1;
  }
  if (start >= 0 && buffer.length - start >= minLength) {
    strings.push(buffer.subarray(start).toString("ascii"));
  }
  return strings;
}

function normalizeStringForSignature(value) {
  return String(value || "")
    .replace(/[0-9A-F]{32}/g, "<HASH>")
    .replace(/\s+/g, " ")
    .trim();
}

function roleSignature(analysis) {
  return Object.keys(analysis.roles || {}).sort().join("|") || "none";
}

function textureHashSignature(analysis) {
  return [...new Set(Object.values(analysis.samplerToHash || {}).filter(Boolean))].sort().join("|");
}

function diffRangesForBuffers(left, right, limit = 12) {
  const ranges = [];
  const firstDiffs = [];
  const minSize = Math.min(left.length, right.length);
  let byteDiffCount = 0;
  let current = null;
  for (let offset = 0; offset < minSize; offset += 1) {
    if (left[offset] === right[offset]) {
      if (current) {
        ranges.push(current);
        current = null;
      }
      continue;
    }
    byteDiffCount += 1;
    if (firstDiffs.length < limit) {
      firstDiffs.push({
        offset,
        rawByte: left[offset],
        candidateByte: right[offset],
      });
    }
    if (!current) {
      current = { start: offset, end: offset, length: 1 };
    } else {
      current.end = offset;
      current.length += 1;
    }
  }
  if (current) ranges.push(current);
  byteDiffCount += Math.abs(left.length - right.length);
  if (left.length !== right.length) {
    ranges.push({
      start: minSize,
      end: Math.max(left.length, right.length) - 1,
      length: Math.abs(left.length - right.length),
    });
  }
  return { byteDiffCount, firstDiffs, diffRanges: ranges.slice(0, limit), diffRangeCount: ranges.length };
}

function magicAt(buffer, offset) {
  if (!buffer || offset < 0 || offset + 4 > buffer.length) return "";
  return buffer.subarray(offset, offset + 4).toString("ascii");
}

function shadergraphCff0View(buffer) {
  if (magicAt(buffer, 0) === "CFF0") {
    return { containerMagic: "CFF0", cff0Offset: 0, cff0Buffer: buffer };
  }
  if (magicAt(buffer, 0) === "RSC0" && magicAt(buffer, 0x20) === "CFF0") {
    return { containerMagic: "RSC0", cff0Offset: 0x20, cff0Buffer: buffer.subarray(0x20) };
  }

  const scanLimit = Math.min(buffer.length - 4, 0x100);
  for (let offset = 0; offset <= scanLimit; offset += 4) {
    if (magicAt(buffer, offset) === "CFF0") {
      return { containerMagic: magicAt(buffer, 0) || "unknown", cff0Offset: offset, cff0Buffer: buffer.subarray(offset) };
    }
  }

  return { containerMagic: magicAt(buffer, 0) || "unknown", cff0Offset: -1, cff0Buffer: null };
}

function parseShadergraphLayout(buffer) {
  const view = shadergraphCff0View(buffer);
  if (!view.cff0Buffer) {
    return { containerMagic: view.containerMagic, cff0Offset: view.cff0Offset, chunks: [], parseError: "missing-CFF0" };
  }

  try {
    const parsed = parseCff0Buffer(view.cff0Buffer);
    return {
      containerMagic: view.containerMagic,
      cff0Offset: view.cff0Offset,
      headerSize: parsed.headerSize,
      chunks: parsed.chunks.map((chunk, index) => ({
        index,
        magic: chunk.magic,
        cff0Offset: chunk.offset,
        cff0PayloadOffset: chunk.payloadOffset,
        absOffset: view.cff0Offset + chunk.offset,
        absPayloadOffset: view.cff0Offset + chunk.payloadOffset,
        size: chunk.size,
        payloadSize: chunk.payloadSize,
      })),
    };
  } catch (error) {
    return {
      containerMagic: view.containerMagic,
      cff0Offset: view.cff0Offset,
      chunks: [],
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

function chunkForRange(layout, start, end) {
  return (layout.chunks || []).find((chunk) => start >= chunk.absOffset && end < chunk.absOffset + chunk.size) || null;
}

const knownShadergraphSubrecordMagics = ["TCH0", "MTLB", "NAME", "SYMB", "PTCH", "DEF0", "INST", "SHD0"];

function nearestKnownSubrecord(buffer, chunk, absOffset) {
  if (!buffer || !chunk) return null;
  const payloadStart = chunk.absPayloadOffset;
  const payloadEnd = chunk.absPayloadOffset + chunk.payloadSize;
  const scanEnd = Math.min(absOffset, payloadEnd - 4);
  let best = null;

  for (let offset = payloadStart; offset <= scanEnd; offset += 1) {
    const magic = magicAt(buffer, offset);
    if (!knownShadergraphSubrecordMagics.includes(magic)) continue;
    best = {
      magic,
      absOffset: offset,
      payloadRelativeOffset: offset - payloadStart,
      relativeStart: absOffset - offset,
    };
  }

  return best;
}

function hexBytes(buffer, start, length) {
  if (!buffer || start < 0 || length <= 0 || start >= buffer.length) return "";
  return buffer.subarray(start, Math.min(buffer.length, start + length)).toString("hex").toUpperCase();
}

function readU32LEHex(buffer, start, length) {
  if (!buffer || length !== 4 || start < 0 || start + 4 > buffer.length) return { value: null, hex: "" };
  const value = buffer.readUInt32LE(start);
  return { value, hex: `0x${value.toString(16).toUpperCase().padStart(8, "0")}` };
}

function describeDiffRange(range, rawBuffer, candidateBuffer, rawLayout, candidateLayout) {
  const rawChunk = chunkForRange(rawLayout, range.start, range.end);
  const candidateChunk = chunkForRange(candidateLayout, range.start, range.end);
  const rawSubrecord = nearestKnownSubrecord(rawBuffer, rawChunk, range.start);
  const candidateSubrecord = nearestKnownSubrecord(candidateBuffer, candidateChunk, range.start);
  const rawU32 = readU32LEHex(rawBuffer, range.start, range.length);
  const candidateU32 = readU32LEHex(candidateBuffer, range.start, range.length);
  const rawPayloadRelativeStart = rawChunk ? range.start - rawChunk.absPayloadOffset : null;
  const candidatePayloadRelativeStart = candidateChunk ? range.start - candidateChunk.absPayloadOffset : null;
  const chunkMagic =
    rawChunk && candidateChunk && rawChunk.magic === candidateChunk.magic
      ? rawChunk.magic
      : `${rawChunk?.magic || "none"}->${candidateChunk?.magic || "none"}`;

  return {
    start: range.start,
    end: range.end,
    length: range.length,
    rawChunkMagic: rawChunk?.magic || "",
    rawChunkIndex: rawChunk?.index ?? null,
    rawChunkAbsOffset: rawChunk?.absOffset ?? null,
    rawChunkRelativeStart: rawChunk ? range.start - rawChunk.absOffset : null,
    rawPayloadRelativeStart,
    rawSubrecordMagic: rawSubrecord?.magic || "",
    rawSubrecordPayloadRelativeOffset: rawSubrecord?.payloadRelativeOffset ?? null,
    rawSubrecordRelativeStart: rawSubrecord?.relativeStart ?? null,
    candidateChunkMagic: candidateChunk?.magic || "",
    candidateChunkIndex: candidateChunk?.index ?? null,
    candidateChunkAbsOffset: candidateChunk?.absOffset ?? null,
    candidateChunkRelativeStart: candidateChunk ? range.start - candidateChunk.absOffset : null,
    candidatePayloadRelativeStart,
    candidateSubrecordMagic: candidateSubrecord?.magic || "",
    candidateSubrecordPayloadRelativeOffset: candidateSubrecord?.payloadRelativeOffset ?? null,
    candidateSubrecordRelativeStart: candidateSubrecord?.relativeStart ?? null,
    rawBytesHex: hexBytes(rawBuffer, range.start, range.length),
    candidateBytesHex: hexBytes(candidateBuffer, range.start, range.length),
    rawU32LE: rawU32.value,
    rawU32Hex: rawU32.hex,
    candidateU32LE: candidateU32.value,
    candidateU32Hex: candidateU32.hex,
    locationSignature: `${chunkMagic}:payload+${rawPayloadRelativeStart ?? "na"}:${range.length}`,
    subrecordLocationSignature:
      rawSubrecord && candidateSubrecord && rawSubrecord.magic === candidateSubrecord.magic
        ? `${rawSubrecord.magic}+${rawSubrecord.relativeStart}:${range.length}`
        : "",
  };
}

function byteDiffBucket(count) {
  if (count === 0) return "0";
  if (count <= 8) return "1-8";
  if (count <= 32) return "9-32";
  if (count <= 128) return "33-128";
  if (count <= 1024) return "129-1024";
  return ">1024";
}

function compareShadergraphs(rawPath, candidatePath) {
  if (!rawPath || !candidatePath || !fs.existsSync(rawPath) || !fs.existsSync(candidatePath)) {
    return { ok: false, diffClass: "missing-file" };
  }
  const rawBuffer = fs.readFileSync(rawPath);
  const candidateBuffer = fs.readFileSync(candidatePath);
  const rawStrings = extractPrintableAsciiStrings(rawBuffer);
  const candidateStrings = extractPrintableAsciiStrings(candidateBuffer);
  const exactStringSequenceMatch =
    rawStrings.length === candidateStrings.length &&
    rawStrings.every((value, index) => value === candidateStrings[index]);
  const normalizedStringSequenceMatch =
    rawStrings.length === candidateStrings.length &&
    rawStrings.every(
      (value, index) => normalizeStringForSignature(value) === normalizeStringForSignature(candidateStrings[index]),
    );
  const rawAnalysis = analyzeShadergraph(rawPath);
  const candidateAnalysis = analyzeShadergraph(candidatePath);
  const { byteDiffCount, firstDiffs, diffRanges, diffRangeCount } = diffRangesForBuffers(rawBuffer, candidateBuffer);
  const rawLayout = parseShadergraphLayout(rawBuffer);
  const candidateLayout = parseShadergraphLayout(candidateBuffer);
  const diffRangeDetails = diffRanges.map((range) =>
    describeDiffRange(range, rawBuffer, candidateBuffer, rawLayout, candidateLayout),
  );
  const sameSize = rawBuffer.length === candidateBuffer.length;
  const hashSequenceMatch = JSON.stringify(rawAnalysis.hashSequence || []) === JSON.stringify(candidateAnalysis.hashSequence || []);
  const samplerTableMatch = JSON.stringify(rawAnalysis.samplerTable || []) === JSON.stringify(candidateAnalysis.samplerTable || []);
  const uniformSamplerMatch =
    JSON.stringify(rawAnalysis.uniformSamplers || []) === JSON.stringify(candidateAnalysis.uniformSamplers || []);
  const roleSignatureMatch = roleSignature(rawAnalysis) === roleSignature(candidateAnalysis);
  const textureHashSignatureMatch = textureHashSignature(rawAnalysis) === textureHashSignature(candidateAnalysis);

  let diffClass = "shader-or-string-different";
  if (byteDiffCount === 0) {
    diffClass = "exact-binary";
  } else if (
    sameSize &&
    exactStringSequenceMatch &&
    hashSequenceMatch &&
    samplerTableMatch &&
    uniformSamplerMatch &&
    roleSignatureMatch &&
    textureHashSignatureMatch &&
    byteDiffCount <= 32
  ) {
    diffClass = "string-identical-small-metadata-diff";
  } else if (sameSize && exactStringSequenceMatch) {
    diffClass = "string-identical-binary-diff";
  } else if (sameSize && normalizedStringSequenceMatch) {
    diffClass = "normalized-string-identical-binary-diff";
  }

  return {
    ok: true,
    diffClass,
    rawSize: rawBuffer.length,
    candidateSize: candidateBuffer.length,
    sameSize,
    rawSha256Prefix: sha256Prefix(rawBuffer),
    candidateSha256Prefix: sha256Prefix(candidateBuffer),
    byteDiffCount,
    byteDiffBucket: byteDiffBucket(byteDiffCount),
    diffRangeCount,
    firstDiffs,
    diffRanges,
    diffRangeDetails,
    rawContainerMagic: rawLayout.containerMagic,
    rawCff0Offset: rawLayout.cff0Offset,
    rawCff0HeaderSize: rawLayout.headerSize ?? null,
    rawCff0ChunkCount: rawLayout.chunks?.length ?? 0,
    rawCff0ParseError: rawLayout.parseError || "",
    candidateContainerMagic: candidateLayout.containerMagic,
    candidateCff0Offset: candidateLayout.cff0Offset,
    candidateCff0HeaderSize: candidateLayout.headerSize ?? null,
    candidateCff0ChunkCount: candidateLayout.chunks?.length ?? 0,
    candidateCff0ParseError: candidateLayout.parseError || "",
    rawStringCount: rawStrings.length,
    candidateStringCount: candidateStrings.length,
    exactStringSequenceMatch,
    normalizedStringSequenceMatch,
    hashSequenceMatch,
    samplerTableMatch,
    uniformSamplerMatch,
    roleSignatureMatch,
    textureHashSignatureMatch,
    rawRoleSignature: roleSignature(rawAnalysis),
    candidateRoleSignature: roleSignature(candidateAnalysis),
    rawTextureHashSignature: textureHashSignature(rawAnalysis),
    candidateTextureHashSignature: textureHashSignature(candidateAnalysis),
  };
}

function buildAudit({
  pathlessAuditPath = defaultPathlessAuditPath,
  characterCandidatesPath = defaultCharacterCandidatesPath,
  effectCandidatesPath = defaultEffectCandidatesPath,
} = {}) {
  const pathlessAudit = readJson(pathlessAuditPath, { pathRecoveryCandidates: [] });
  const candidateRows = [
    ...readShadergraphCandidateTsv(characterCandidatesPath, "character"),
    ...readShadergraphCandidateTsv(effectCandidatesPath, "effect"),
  ];
  const candidateByPath = new Map(candidateRows.map((row) => [row.relativePath, row]));
  const uniqueRows = (pathlessAudit.pathRecoveryCandidates || []).filter(
    (row) => row.materialSignatureAmbiguityClass === "single-candidate-single-pfx",
  );
  const comparisons = uniqueRows.map((row) => {
    const candidatePath = normalizeRel(row.matchingMaterialSignatureCandidatePaths?.[0] || "");
    const materialPfxPath = normalizeRel(row.materialSignaturePfxPaths?.[0] || "");
    const candidate = candidateByPath.get(candidatePath) || {};
    const comparison = compareShadergraphs(row.filePath, candidate.filePath);
    return {
      rawHash: row.hash,
      rawFilePath: row.filePath,
      candidatePath,
      candidateHash: candidate.hash || "",
      candidateFilePath: candidate.filePath || "",
      candidateSource: candidate.source || "",
      materialPfxPath,
      normalizedTextSignature: row.normalizedTextSignature || "",
      textureHashes: row.textureHashes || [],
      ...comparison,
    };
  });

  const comparedRows = comparisons.filter((row) => row.ok);
  return {
    summary: {
      pathlessAuditPath,
      totalUniqueMaterialPfxCandidates: uniqueRows.length,
      comparedRows: comparedRows.length,
      missingFileRows: comparisons.length - comparedRows.length,
      diffClassCounts: countBy(comparisons, (row) => row.diffClass),
      byteDiffBucketCounts: countBy(comparedRows, (row) => row.byteDiffBucket),
      diffRangePatternCounts: countBy(comparedRows, (row) =>
        (row.diffRanges || []).map((range) => String(range.length)).join(",") || "none",
      ),
      diffChunkMagicCounts: countBy(
        comparedRows.flatMap((row) => row.diffRangeDetails || []),
        (detail) => detail.locationSignature.split(":")[0],
      ),
      diffLocationPatternCounts: countBy(comparedRows, (row) =>
        (row.diffRangeDetails || []).map((detail) => detail.locationSignature).join("|") || "none",
      ),
      diffSubrecordLocationPatternCounts: countBy(comparedRows, (row) =>
        (row.diffRangeDetails || [])
          .map((detail) => detail.subrecordLocationSignature || detail.locationSignature)
          .join("|") || "none",
      ),
      cff0ContainerCounts: countBy(comparedRows, (row) => `${row.rawContainerMagic}->${row.candidateContainerMagic}`),
      cff0ChunkCountCounts: countBy(comparedRows, (row) => `${row.rawCff0ChunkCount}->${row.candidateCff0ChunkCount}`),
      maxByteDiffCount: comparedRows.reduce((max, row) => Math.max(max, row.byteDiffCount || 0), 0),
      exactStringSequenceMatchCount: comparedRows.filter((row) => row.exactStringSequenceMatch).length,
      normalizedStringSequenceMatchCount: comparedRows.filter((row) => row.normalizedStringSequenceMatch).length,
      sameSizeCount: comparedRows.filter((row) => row.sameSize).length,
      hashSequenceMatchCount: comparedRows.filter((row) => row.hashSequenceMatch).length,
      samplerTableMatchCount: comparedRows.filter((row) => row.samplerTableMatch).length,
      uniformSamplerMatchCount: comparedRows.filter((row) => row.uniformSamplerMatch).length,
      roleSignatureMatchCount: comparedRows.filter((row) => row.roleSignatureMatch).length,
      textureHashSignatureMatchCount: comparedRows.filter((row) => row.textureHashSignatureMatch).length,
      topMaterialPfxGroups: countBy(comparedRows, (row) => row.materialPfxPath.split("/").slice(0, 2).join("/")),
      rendererTakeoverImpact: "diagnostic-only; this proves shadergraph content equivalence classes, not recovered path ownership",
    },
    comparisons,
  };
}

function writeTsv(filePath, audit) {
  const rows = [
    [
      "rawHash",
      "rawFilePath",
      "candidatePath",
      "candidateHash",
      "candidateFilePath",
      "materialPfxPath",
      "diffClass",
      "byteDiffCount",
      "diffRangeCount",
      "sameSize",
      "exactStringSequenceMatch",
      "normalizedStringSequenceMatch",
      "hashSequenceMatch",
      "samplerTableMatch",
      "roleSignatureMatch",
      "textureHashSignatureMatch",
      "diffRanges",
      "diffRangeDetails",
    ],
  ];
  for (const row of audit.comparisons) {
    rows.push([
      row.rawHash,
      row.rawFilePath,
      row.candidatePath,
      row.candidateHash,
      row.candidateFilePath,
      row.materialPfxPath,
      row.diffClass,
      row.byteDiffCount ?? "",
      row.diffRangeCount ?? "",
      row.sameSize ?? "",
      row.exactStringSequenceMatch ?? "",
      row.normalizedStringSequenceMatch ?? "",
      row.hashSequenceMatch ?? "",
      row.samplerTableMatch ?? "",
      row.roleSignatureMatch ?? "",
      row.textureHashSignatureMatch ?? "",
      (row.diffRanges || []).map((range) => `${range.start}-${range.end}:${range.length}`).join("|"),
      (row.diffRangeDetails || [])
        .map((detail) => {
          const rawValue = detail.rawU32Hex || detail.rawBytesHex;
          const candidateValue = detail.candidateU32Hex || detail.candidateBytesHex;
          const location = detail.subrecordLocationSignature || detail.locationSignature;
          return `${location}@${detail.start}:${rawValue}->${candidateValue}`;
        })
        .join("|"),
    ]);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => row.join("\t")).join("\n")}\n`);
}

function exportAudit({
  pathlessAuditPath = defaultPathlessAuditPath,
  characterCandidatesPath = defaultCharacterCandidatesPath,
  effectCandidatesPath = defaultEffectCandidatesPath,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildAudit({ pathlessAuditPath, characterCandidatesPath, effectCandidatesPath });
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, audit);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportAudit({
    pathlessAuditPath: optionValue(args, "--pathless-audit", defaultPathlessAuditPath),
    characterCandidatesPath: optionValue(args, "--character-candidates", defaultCharacterCandidatesPath),
    effectCandidatesPath: optionValue(args, "--effect-candidates", defaultEffectCandidatesPath),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildAudit,
  exportAudit,
};
