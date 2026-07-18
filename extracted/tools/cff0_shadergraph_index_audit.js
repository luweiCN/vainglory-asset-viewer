#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { analyzeShadergraph } = require("./material_roles");

const defaultDataRoot = "extracted/ios_raw/Payload/GameKindred.app/Data";
const defaultResourceIndexPath = "extracted/reports/build_resource_index.tsv";
const defaultCharacterCandidatesPath = "extracted/reports/ios_character_shadergraph_candidates.tsv";
const defaultEffectCandidatesPath = "extracted/reports/ios_effect_shadergraph_candidates.tsv";
const defaultMaterialPipelinePath = "extracted/reports/material_runtime_pipeline.tsv";
const defaultMaterialTextureMapPath = "extracted/reports/material_texture_map.tsv";
const defaultEffectMaterialTsvPath = "extracted/reports/effect_shadergraph_material_manifest.tsv";
const defaultEffectMaterialManifestPath = "extracted/viewer/effect-shadergraph-material-manifest.json";
const defaultEffectPfxManifestTsvPath = "extracted/reports/effect_pfx_resource_manifest.tsv";
const defaultJsonOut = "extracted/reports/cff0_shadergraph_index_audit.json";
const defaultTsvOut = "extracted/reports/cff0_shadergraph_index_audit.tsv";

function normalizeRel(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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
        // Ignore close failures in a best-effort diagnostic scan.
      }
    }
  }
}

function walkFiles(root) {
  const files = [];
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
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  };
  if (fs.existsSync(root)) visit(root);
  return files;
}

function firstCff0Chunk(prefix, cff0Offset) {
  if (
    cff0Offset < 0 ||
    prefix.length < cff0Offset + 0x18 ||
    prefix.subarray(cff0Offset, cff0Offset + 4).toString("ascii") !== "CFF0"
  ) {
    return "";
  }
  const headerSize = prefix.readUInt32LE(cff0Offset + 20) || 64;
  const chunkOffset = cff0Offset + headerSize;
  if (prefix.length < chunkOffset + 8) return "";
  const magic = prefix.subarray(chunkOffset, chunkOffset + 4).toString("ascii");
  return /^[A-Z0-9]{4}$/.test(magic) ? magic : "";
}

function classifyRawCff0Resource(prefix) {
  if (prefix.length >= 0x24 && prefix.subarray(0, 4).toString("ascii") === "RSC0") {
    const innerOffset = 0x20;
    if (prefix.subarray(innerOffset, innerOffset + 4).toString("ascii") !== "CFF0") {
      return { container: "rsc0", cff0Offset: -1, firstChunk: "", className: "rsc0-non-cff0" };
    }
    const firstChunk = firstCff0Chunk(prefix, innerOffset);
    return {
      container: "rsc0",
      cff0Offset: innerOffset,
      firstChunk,
      className: firstChunk === "SHD0" ? "cff0-shadergraph" : firstChunk ? "cff0-other" : "cff0-unparsed",
    };
  }
  if (prefix.length >= 4 && prefix.subarray(0, 4).toString("ascii") === "CFF0") {
    const firstChunk = firstCff0Chunk(prefix, 0);
    return {
      container: "direct",
      cff0Offset: 0,
      firstChunk,
      className: firstChunk === "SHD0" ? "cff0-shadergraph" : firstChunk ? "cff0-definition-or-instance" : "cff0-unparsed",
    };
  }
  return { container: "", cff0Offset: -1, firstChunk: "", className: "" };
}

function readTsvWithHeader(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] || "";
    });
    return row;
  });
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
    .filter((row) => row.hash || row.relativePath);
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function addCounts(target, values) {
  for (const value of values || []) {
    if (!value) continue;
    target[value] = (target[value] || 0) + 1;
  }
}

function pushMapList(map, key, value, limit = 12) {
  if (!key) return;
  const values = map.get(key) || [];
  if (values.length < limit) values.push(value);
  map.set(key, values);
}

function splitHashList(value) {
  return String(value || "")
    .split(/[|,;]/)
    .map((item) => item.trim().toUpperCase())
    .filter((item) => /^[0-9A-F]{32}$/.test(item));
}

function splitPathList(value) {
  return String(value || "")
    .split(/[|,;]/)
    .map((item) => normalizeRel(item.trim()))
    .filter(Boolean);
}

function uniqueList(values, limit = 12) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function uniqueCount(values) {
  return uniqueList(values, Number.POSITIVE_INFINITY).length;
}

function canonicalOwnerPath(value) {
  const normalized = normalizeRel(value);
  for (const prefix of [
    "extracted/hero_assets/shadergraphs/",
    "extracted/hero_assets/effects_shadergraphs/",
    "extracted/build_resources_by_path/",
  ]) {
    if (normalized.startsWith(prefix)) return normalized.slice(prefix.length);
  }
  return normalized;
}

function ownerTopLevel(reference) {
  const value = canonicalOwnerPath(reference.ownerPath || reference.path || reference.shadergraph || "");
  const [first, second] = value.split("/");
  if (!first) return "";
  if (first === "Effects" && second) return `${first}/${second}`;
  if (first === "Characters" && second) return `${first}/${second}`;
  return first;
}

function buildTextureReferenceIndex({ resourceRows, materialTextureRows, effectMaterialRows }) {
  const byHash = new Map();

  for (const row of resourceRows || []) {
    if (!/^[0-9A-F]{32}$/.test(row.hash || "")) continue;
    if (row.category !== "image") continue;
    pushMapList(byHash, row.hash, {
      source: "build-image-resource",
      ownerPath: row.relativePath,
      path: row.relativePath,
    });
  }

  for (const row of materialTextureRows || []) {
    const hash = String(row.hash || "").toUpperCase();
    if (!/^[0-9A-F]{32}$/.test(hash)) continue;
    pushMapList(byHash, hash, {
      source: "character-material-texture",
      ownerPath: canonicalOwnerPath(row.shadergraph),
      path: normalizeRel(row.texture),
    });
  }

  for (const row of effectMaterialRows || []) {
    const ownerPath = normalizeRel(row.relativePath);
    const hashes = new Set([
      ...splitHashList(row.textureHashes),
      ...splitHashList(row.baseColorHash),
      ...splitHashList(row.normalHash),
      ...splitHashList(row.reflectionHash),
    ]);
    for (const hash of hashes) {
      pushMapList(byHash, hash, {
        source: "effect-material-texture",
        ownerPath,
        path: normalizeRel(row.previewTexture),
      });
    }
  }

  return byHash;
}

function buildPfxShadergraphIndex(effectPfxRows) {
  const byShadergraph = new Map();
  for (const row of effectPfxRows || []) {
    const pfxPath = normalizeRel(row.relativePath);
    for (const shadergraphPath of splitPathList(row.shadergraphRefs)) {
      const values = byShadergraph.get(shadergraphPath) || [];
      values.push({
        pfxPath,
        surfaceIndices: row.surfaceIndices || "",
        surfaceRenderFamilies: row.surfaceRenderFamilies || "",
        surfaceRuntimeHints: row.surfaceRuntimeHints || "",
        hookTokens: row.hookTokens || "",
        hookEffectTokens: row.hookEffectTokens || "",
        hookAbilityNames: row.hookAbilityNames || "",
        hookBindingProfiles: row.hookBindingProfiles || "",
      });
      byShadergraph.set(shadergraphPath, values);
    }
  }
  return byShadergraph;
}

function intersectionCount(left, right) {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) count += 1;
  }
  return count;
}

function textureFileExists(dataRoot, hash) {
  if (!hash || !/^[0-9A-F]{32}$/i.test(hash)) return false;
  return fs.existsSync(path.join(dataRoot, hash.slice(0, 2), hash));
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

function normalizedShadergraphTextSignature(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const normalizedStrings = extractPrintableAsciiStrings(buffer)
      .map((value) =>
        value
          .replace(/[0-9A-F]{32}/g, "<HASH>")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
    return crypto.createHash("sha256").update(normalizedStrings.join("\n")).digest("hex").slice(0, 16).toUpperCase();
  } catch {
    return "";
  }
}

function shadergraphAnalysisFor(filePath, dataRoot) {
  let analysis;
  try {
    analysis = analyzeShadergraph(filePath);
  } catch (error) {
    return {
      ok: false,
      error: error?.message || String(error),
      roleNames: [],
      roleSignature: "",
      textureHashes: [],
      textureHashSignature: "",
      normalizedTextSignature: "",
      samplerCount: 0,
      uniformSamplerCount: 0,
      resolvedTextureHashCount: 0,
    };
  }

  const roleNames = Object.keys(analysis.roles || {}).sort();
  const textureHashes = [...new Set(Object.values(analysis.samplerToHash || {}).filter(Boolean))].sort();
  const resolvedTextureHashCount = textureHashes.filter((hash) => textureFileExists(dataRoot, hash)).length;
  return {
    ok: true,
    roleNames,
    roleSignature: roleNames.join("|") || "none",
    textureHashes,
    textureHashSignature: textureHashes.join("|"),
    normalizedTextSignature: normalizedShadergraphTextSignature(filePath),
    samplerCount: (analysis.samplerTable || []).length,
    uniformSamplerCount: (analysis.uniformSamplers || []).length,
    resolvedTextureHashCount,
  };
}

function buildFoundCandidateTextureSignatureIndex(foundCandidates, dataRoot) {
  const index = new Map();
  for (const candidate of foundCandidates) {
    if (!candidate.filePath || !fs.existsSync(candidate.filePath)) continue;
    const analysis = shadergraphAnalysisFor(candidate.filePath, dataRoot);
    if (!analysis.ok || !analysis.textureHashSignature) continue;
    const rows = index.get(analysis.textureHashSignature) || [];
    rows.push({
      source: candidate.source,
      relativePath: candidate.relativePath,
      hash: candidate.hash,
      roleSignature: analysis.roleSignature,
      normalizedTextSignature: analysis.normalizedTextSignature,
    });
    index.set(analysis.textureHashSignature, rows);
  }
  return index;
}

function materialSignatureAmbiguityClass(candidatePathCount, pfxPathCount) {
  if (candidatePathCount === 0) return "none";
  if (candidatePathCount === 1 && pfxPathCount === 1) return "single-candidate-single-pfx";
  if (candidatePathCount === 1 && pfxPathCount > 1) return "single-candidate-multiple-pfx";
  if (candidatePathCount > 1 && pfxPathCount === 1) return "multiple-candidates-single-pfx";
  if (candidatePathCount > 1 && pfxPathCount > 1) return "multiple-candidates-multiple-pfx";
  if (candidatePathCount === 1) return "single-candidate-no-pfx";
  return "multiple-candidates-no-pfx";
}

function recoveryCandidateForPathlessShadergraph({
  record,
  analysis,
  signatureMatches,
  materialSignatureMatches,
  ownerRefs,
  pfxShadergraphIndex,
}) {
  const matchingCandidatePathsAll = uniqueList(
    signatureMatches.map((row) => normalizeRel(row.relativePath)),
    Number.POSITIVE_INFINITY,
  );
  const matchingMaterialSignatureCandidatePathsAll = uniqueList(
    materialSignatureMatches.map((row) => normalizeRel(row.relativePath)),
    Number.POSITIVE_INFINITY,
  );
  const materialSignaturePfxEntries = [];
  for (const candidatePath of matchingMaterialSignatureCandidatePathsAll) {
    for (const pfxEntry of pfxShadergraphIndex.get(candidatePath) || []) {
      materialSignaturePfxEntries.push(pfxEntry);
    }
  }
  const signaturePfxEntries = [];
  for (const candidatePath of matchingCandidatePathsAll) {
    for (const pfxEntry of pfxShadergraphIndex.get(candidatePath) || []) {
      signaturePfxEntries.push(pfxEntry);
    }
  }

  const ownerPfxEntries = [];
  const ownerPaths = [];
  const ownerSources = [];
  const ownerTopLevels = [];
  for (const ref of ownerRefs) {
    const ownerPath = canonicalOwnerPath(ref.ownerPath || ref.path || "");
    if (ownerPath) ownerPaths.push(ownerPath);
    if (ref.source) ownerSources.push(ref.source);
    const topLevel = ownerTopLevel(ref);
    if (topLevel) ownerTopLevels.push(topLevel);
    for (const pfxEntry of pfxShadergraphIndex.get(ownerPath) || []) {
      ownerPfxEntries.push(pfxEntry);
    }
  }

  let tier = "no-texture-or-vertex-only";
  let confidence = "low-diagnostic";
  if (materialSignaturePfxEntries.length > 0) {
    tier = "pfx-sibling-exact-material-signature";
    confidence = "high-diagnostic";
  } else if (materialSignatureMatches.length > 0) {
    tier = "exact-material-signature";
    confidence = "medium-diagnostic";
  } else if (signaturePfxEntries.length > 0) {
    tier = "pfx-sibling-exact-texture-signature";
    confidence = "high-diagnostic";
  } else if (signatureMatches.length > 0) {
    tier = "exact-texture-signature";
    confidence = "medium-diagnostic";
  } else if (ownerPfxEntries.length > 0) {
    tier = "texture-owner-pfx-context";
    confidence = "medium-diagnostic";
  } else if (ownerSources.includes("effect-material-texture")) {
    tier = "texture-owner-effect-context";
    confidence = "low-diagnostic";
  } else if (ownerSources.includes("character-material-texture")) {
    tier = "character-texture-owner-context";
    confidence = "low-diagnostic";
  } else if (analysis.textureHashes.length > 0) {
    tier = "raw-only-texture-signature";
    confidence = "low-diagnostic";
  }

  const pfxEntries = [...materialSignaturePfxEntries, ...signaturePfxEntries, ...ownerPfxEntries];
  const pfxPathsAll = uniqueList(pfxEntries.map((entry) => entry.pfxPath), Number.POSITIVE_INFINITY);
  const materialSignaturePfxPathsAll = uniqueList(
    materialSignaturePfxEntries.map((entry) => entry.pfxPath),
    Number.POSITIVE_INFINITY,
  );
  const textureSignaturePfxPathsAll = uniqueList(
    signaturePfxEntries.map((entry) => entry.pfxPath),
    Number.POSITIVE_INFINITY,
  );
  const materialSignaturePfxPathCount = uniqueCount(materialSignaturePfxEntries.map((entry) => entry.pfxPath));
  const textureSignaturePfxPathCount = uniqueCount(signaturePfxEntries.map((entry) => entry.pfxPath));
  const matchingCandidatePathCount = matchingCandidatePathsAll.length;
  const matchingMaterialSignatureCandidatePathCount = matchingMaterialSignatureCandidatePathsAll.length;
  const materialAmbiguityClass = materialSignatureAmbiguityClass(
    matchingMaterialSignatureCandidatePathCount,
    materialSignaturePfxPathCount,
  );
  return {
    hash: record.hash,
    filePath: record.filePath,
    tier,
    confidence,
    roleSignature: analysis.roleSignature,
    normalizedTextSignature: analysis.normalizedTextSignature,
    textureHashCount: analysis.textureHashes.length,
    resolvedTextureHashCount: analysis.resolvedTextureHashCount,
    textureHashes: analysis.textureHashes.slice(0, 8),
    matchingCandidatePathCount,
    matchingMaterialSignatureCandidatePathCount,
    materialSignaturePfxPathCount,
    textureSignaturePfxPathCount,
    pfxPathCount: pfxPathsAll.length,
    materialSignatureAmbiguityClass: materialAmbiguityClass,
    matchingCandidatePaths: matchingCandidatePathsAll.slice(0, 8),
    matchingMaterialSignatureCandidatePaths: matchingMaterialSignatureCandidatePathsAll.slice(0, 8),
    matchingCandidateSources: uniqueList(signatureMatches.map((row) => row.source), 6),
    ownerSources: uniqueList(ownerSources, 6),
    ownerTopLevels: uniqueList(ownerTopLevels, 8),
    ownerPaths: uniqueList(ownerPaths, 8),
    pfxPaths: pfxPathsAll.slice(0, 8),
    materialSignaturePfxPaths: materialSignaturePfxPathsAll.slice(0, 8),
    textureSignaturePfxPaths: textureSignaturePfxPathsAll.slice(0, 8),
    pfxSurfaceFamilies: uniqueList(pfxEntries.map((entry) => entry.surfaceRenderFamilies), 6),
    pfxHookEffectTokens: uniqueList(
      pfxEntries.flatMap((entry) => splitPathList(entry.hookEffectTokens || entry.hookTokens)),
      8,
    ),
    evidence:
      pfxPathsAll.length > 0
        ? "PFX surface/hook context is present, but this is still a path recovery candidate until direct hash-to-path evidence is found."
        : "No direct hash-to-path evidence; keep diagnostic-only.",
  };
}

function summarizePathlessRawShadergraphs(
  records,
  candidateTextureSignatureIndex,
  textureReferenceIndex,
  pfxShadergraphIndex,
  dataRoot,
  sampleLimit = 50,
) {
  const summary = {
    analyzed: 0,
    analysisErrorCount: 0,
    roleCounts: {},
    roleSignatureCounts: {},
    textureHashCountDistribution: {},
    samplerCountDistribution: {},
    noTextureHashCount: 0,
    allTextureHashesResolvedCount: 0,
    partialTextureHashesResolvedCount: 0,
    noTextureHashesResolvedCount: 0,
    textureSignatureMatchesFoundCandidateCount: 0,
    textureSignatureMatchSourceCounts: {},
    uniqueTextureSignatureCount: 0,
    textureOwnerAnyReferenceCount: 0,
    textureOwnerAllReferencesCount: 0,
    textureOwnerNoReferenceCount: 0,
    textureOwnerSourceCounts: {},
    textureOwnerTopLevelCounts: {},
    uniqueTextureHashCount: 0,
    uniqueTextureHashesWithOwnerReferenceCount: 0,
    uniqueTextureHashesWithoutOwnerReferenceCount: 0,
    pathRecoveryTierCounts: {},
    pathRecoveryConfidenceCounts: {},
    pathRecoveryPfxLinkedCount: 0,
    pathRecoveryExactTextureSignatureCount: 0,
    pathRecoveryExactMaterialSignatureCount: 0,
    pathRecoverySingleMaterialSignatureCandidateCount: 0,
    pathRecoveryUniqueMaterialSignaturePfxCandidateCount: 0,
    pathRecoverySingleTextureSignatureCandidateCount: 0,
    pathRecoveryMaterialSignatureAmbiguityCounts: {},
    textureAndTextSignatureMatchesFoundCandidateCount: 0,
    textureAndTextSignatureMatchSourceCounts: {},
  };
  const textureSignatures = new Set();
  const uniqueTextureHashes = new Set();
  const uniqueTextureHashesWithOwnerReference = new Set();
  const samples = [];
  const recoveryCandidates = [];

  for (const record of records) {
    const analysis = shadergraphAnalysisFor(record.filePath, dataRoot);
    if (!analysis.ok) {
      summary.analysisErrorCount += 1;
      if (samples.length < sampleLimit) samples.push({ ...record, analysisError: analysis.error });
      continue;
    }

    summary.analyzed += 1;
    addCounts(summary.roleCounts, analysis.roleNames);
    summary.roleSignatureCounts[analysis.roleSignature] = (summary.roleSignatureCounts[analysis.roleSignature] || 0) + 1;
    summary.textureHashCountDistribution[analysis.textureHashes.length] =
      (summary.textureHashCountDistribution[analysis.textureHashes.length] || 0) + 1;
    summary.samplerCountDistribution[analysis.samplerCount] =
      (summary.samplerCountDistribution[analysis.samplerCount] || 0) + 1;
    if (analysis.textureHashSignature) textureSignatures.add(analysis.textureHashSignature);

    if (analysis.textureHashes.length === 0) {
      summary.noTextureHashCount += 1;
    } else if (analysis.resolvedTextureHashCount === analysis.textureHashes.length) {
      summary.allTextureHashesResolvedCount += 1;
    } else if (analysis.resolvedTextureHashCount > 0) {
      summary.partialTextureHashesResolvedCount += 1;
    } else {
      summary.noTextureHashesResolvedCount += 1;
    }

    const signatureMatches = analysis.textureHashSignature
      ? candidateTextureSignatureIndex.get(analysis.textureHashSignature) || []
      : [];
    const materialSignatureMatches = signatureMatches.filter(
      (row) => row.normalizedTextSignature && row.normalizedTextSignature === analysis.normalizedTextSignature,
    );
    if (signatureMatches.length) {
      summary.textureSignatureMatchesFoundCandidateCount += 1;
      addCounts(summary.textureSignatureMatchSourceCounts, [...new Set(signatureMatches.map((row) => row.source))]);
    }
    if (materialSignatureMatches.length) {
      summary.textureAndTextSignatureMatchesFoundCandidateCount += 1;
      addCounts(
        summary.textureAndTextSignatureMatchSourceCounts,
        [...new Set(materialSignatureMatches.map((row) => row.source))],
      );
    }

    const ownerReferences = [];
    const ownerRefsFlat = [];
    const ownerSources = new Set();
    const ownerTopLevels = new Set();
    let textureHashesWithOwnerReference = 0;
    for (const hash of analysis.textureHashes) {
      uniqueTextureHashes.add(hash);
      const refs = textureReferenceIndex.get(hash) || [];
      if (refs.length > 0) {
        textureHashesWithOwnerReference += 1;
        uniqueTextureHashesWithOwnerReference.add(hash);
      }
      for (const ref of refs) {
        ownerRefsFlat.push(ref);
        ownerSources.add(ref.source);
        const topLevel = ownerTopLevel(ref);
        if (topLevel) ownerTopLevels.add(topLevel);
      }
      if (ownerReferences.length < 8) {
        ownerReferences.push({
          hash,
          references: refs.slice(0, 4),
        });
      }
    }
    if (analysis.textureHashes.length > 0) {
      if (textureHashesWithOwnerReference === 0) {
        summary.textureOwnerNoReferenceCount += 1;
      } else {
        summary.textureOwnerAnyReferenceCount += 1;
        if (textureHashesWithOwnerReference === analysis.textureHashes.length) {
          summary.textureOwnerAllReferencesCount += 1;
        }
      }
    }
    addCounts(summary.textureOwnerSourceCounts, [...ownerSources]);
    addCounts(summary.textureOwnerTopLevelCounts, [...ownerTopLevels]);

    const recoveryCandidate = recoveryCandidateForPathlessShadergraph({
      record,
      analysis,
      signatureMatches,
      materialSignatureMatches,
      ownerRefs: ownerRefsFlat,
      pfxShadergraphIndex,
    });
    recoveryCandidates.push(recoveryCandidate);
    summary.pathRecoveryTierCounts[recoveryCandidate.tier] =
      (summary.pathRecoveryTierCounts[recoveryCandidate.tier] || 0) + 1;
    summary.pathRecoveryConfidenceCounts[recoveryCandidate.confidence] =
      (summary.pathRecoveryConfidenceCounts[recoveryCandidate.confidence] || 0) + 1;
    if (recoveryCandidate.pfxPathCount > 0) summary.pathRecoveryPfxLinkedCount += 1;
    if (recoveryCandidate.matchingCandidatePathCount > 0) {
      summary.pathRecoveryExactTextureSignatureCount += 1;
    }
    if (recoveryCandidate.matchingMaterialSignatureCandidatePathCount > 0) {
      summary.pathRecoveryExactMaterialSignatureCount += 1;
    }
    if (recoveryCandidate.matchingMaterialSignatureCandidatePathCount === 1) {
      summary.pathRecoverySingleMaterialSignatureCandidateCount += 1;
    }
    if (
      recoveryCandidate.matchingMaterialSignatureCandidatePathCount === 1 &&
      recoveryCandidate.materialSignaturePfxPathCount === 1
    ) {
      summary.pathRecoveryUniqueMaterialSignaturePfxCandidateCount += 1;
    }
    if (recoveryCandidate.matchingCandidatePathCount === 1) {
      summary.pathRecoverySingleTextureSignatureCandidateCount += 1;
    }
    summary.pathRecoveryMaterialSignatureAmbiguityCounts[recoveryCandidate.materialSignatureAmbiguityClass] =
      (summary.pathRecoveryMaterialSignatureAmbiguityCounts[
        recoveryCandidate.materialSignatureAmbiguityClass
      ] || 0) + 1;

    if (samples.length < sampleLimit) {
      samples.push({
        ...record,
        roleSignature: analysis.roleSignature,
        textureHashCount: analysis.textureHashes.length,
        resolvedTextureHashCount: analysis.resolvedTextureHashCount,
        samplerCount: analysis.samplerCount,
        uniformSamplerCount: analysis.uniformSamplerCount,
        textureHashes: analysis.textureHashes.slice(0, 8),
        matchingFoundCandidates: signatureMatches.slice(0, 3),
        matchingMaterialSignatureCandidates: materialSignatureMatches.slice(0, 3),
        textureOwnerReferences: ownerReferences,
      });
    }
  }

  summary.uniqueTextureSignatureCount = textureSignatures.size;
  summary.uniqueTextureHashCount = uniqueTextureHashes.size;
  summary.uniqueTextureHashesWithOwnerReferenceCount = uniqueTextureHashesWithOwnerReference.size;
  summary.uniqueTextureHashesWithoutOwnerReferenceCount =
    uniqueTextureHashes.size - uniqueTextureHashesWithOwnerReference.size;
  return { summary, samples, recoveryCandidates };
}

function differenceSamples(leftRecords, rightSet, limit = 50, keyFn = (record) => record.hash || record.relativePath) {
  const samples = [];
  for (const record of leftRecords) {
    const key = keyFn(record);
    if (rightSet.has(key)) continue;
    samples.push(record);
    if (samples.length >= limit) break;
  }
  return samples;
}

function auditRawCff0Resources({ dataRoot, prefixBytes = 4096 }) {
  const records = [];
  for (const filePath of walkFiles(dataRoot)) {
    const name = path.basename(filePath);
    const parent = path.basename(path.dirname(filePath));
    const hashNamed = /^[0-9A-F]{32}$/i.test(name) && /^[0-9A-F]{2}$/i.test(parent);
    const prefix = readFilePrefix(filePath, prefixBytes);
    const classification = classifyRawCff0Resource(prefix);
    if (!classification.className) continue;
    records.push({
      hash: name.toUpperCase(),
      filePath: normalizeRel(path.relative(process.cwd(), filePath)),
      hashNamed,
      ...classification,
    });
  }
  return records;
}

function buildAudit({
  dataRoot = defaultDataRoot,
  resourceIndexPath = defaultResourceIndexPath,
  characterCandidatesPath = defaultCharacterCandidatesPath,
  effectCandidatesPath = defaultEffectCandidatesPath,
  materialPipelinePath = defaultMaterialPipelinePath,
  materialTextureMapPath = defaultMaterialTextureMapPath,
  effectMaterialTsvPath = defaultEffectMaterialTsvPath,
  effectMaterialManifestPath = defaultEffectMaterialManifestPath,
  effectPfxManifestTsvPath = defaultEffectPfxManifestTsvPath,
} = {}) {
  const rawRecords = auditRawCff0Resources({ dataRoot });
  const rawShadergraphRecords = rawRecords.filter((row) => row.className === "cff0-shadergraph");
  const rawShadergraphHashes = new Set(rawShadergraphRecords.map((row) => row.hash));

  const resourceRows = readTsvWithHeader(resourceIndexPath).map((row) => ({
    ...row,
    relativePath: normalizeRel(row.relativePath),
    filePath: normalizeRel(row.filePath),
    linkedPath: normalizeRel(row.linkedPath),
    hash: String(row.hash || "").toUpperCase(),
  }));
  const resourceHashes = new Set(resourceRows.map((row) => row.hash).filter(Boolean));

  const characterCandidates = readShadergraphCandidateTsv(characterCandidatesPath, "character");
  const effectCandidates = readShadergraphCandidateTsv(effectCandidatesPath, "effect");
  const allCandidates = [...characterCandidates, ...effectCandidates];
  const foundCandidates = allCandidates.filter((row) => row.status === "FOUND");
  const candidateHashes = new Set(foundCandidates.map((row) => row.hash).filter(Boolean));
  const characterCandidatePaths = new Set(characterCandidates.map((row) => row.relativePath).filter(Boolean));
  const effectCandidatePaths = new Set(effectCandidates.map((row) => row.relativePath).filter(Boolean));

  const materialRows = readTsvWithHeader(materialPipelinePath);
  const materialTextureRows = readTsvWithHeader(materialTextureMapPath);
  const effectMaterialRows = readTsvWithHeader(effectMaterialTsvPath);
  const effectPfxRows = readTsvWithHeader(effectPfxManifestTsvPath);
  const textureReferenceIndex = buildTextureReferenceIndex({
    resourceRows,
    materialTextureRows,
    effectMaterialRows,
  });
  const pfxShadergraphIndex = buildPfxShadergraphIndex(effectPfxRows);
  const materialShadergraphPaths = new Set(
    materialRows.map((row) => normalizeRel(row.shadergraphRel)).filter(Boolean),
  );

  const effectManifest = readJson(effectMaterialManifestPath, { items: [] });
  const effectManifestItems = Array.isArray(effectManifest) ? effectManifest : effectManifest.items || [];
  const effectManifestPaths = new Set(
    effectManifestItems.map((row) => normalizeRel(row.relativePath)).filter(Boolean),
  );

  const rawShadergraphHashesWithCandidate = intersectionCount(rawShadergraphHashes, candidateHashes);
  const rawShadergraphHashesWithoutCandidate = rawShadergraphHashes.size - rawShadergraphHashesWithCandidate;
  const rawShadergraphWithoutCandidateRecords = rawShadergraphRecords.filter((row) => !candidateHashes.has(row.hash));
  const foundCandidateTextureSignatureIndex = buildFoundCandidateTextureSignatureIndex(foundCandidates, dataRoot);
  const pathlessAnalysis = summarizePathlessRawShadergraphs(
    rawShadergraphWithoutCandidateRecords,
    foundCandidateTextureSignatureIndex,
    textureReferenceIndex,
    pfxShadergraphIndex,
    dataRoot,
  );
  const characterCandidatesWithMaterialPipeline = intersectionCount(characterCandidatePaths, materialShadergraphPaths);
  const effectCandidatesWithMaterialManifest = intersectionCount(effectCandidatePaths, effectManifestPaths);

  return {
    summary: {
      dataRoot,
      rawCff0ResourceCount: rawRecords.length,
      rawCff0ByClass: countBy(rawRecords, (row) => row.className),
      rawCff0ByContainer: countBy(rawRecords, (row) => row.container),
      rawShadergraphCff0Count: rawShadergraphRecords.length,
      rawShadergraphCff0HashCount: rawShadergraphHashes.size,
      resourceIndexRows: resourceRows.length,
      resourceIndexByMagic: countBy(resourceRows, (row) => row.magic4),
      resourceIndexHashMatchesRawShadergraph: intersectionCount(rawShadergraphHashes, resourceHashes),
      characterShadergraphCandidateRows: characterCandidates.length,
      characterShadergraphCandidateStatusCounts: countBy(characterCandidates, (row) => row.status),
      characterShadergraphCandidateHashCount: new Set(characterCandidates.map((row) => row.hash).filter(Boolean)).size,
      effectShadergraphCandidateRows: effectCandidates.length,
      effectShadergraphCandidateStatusCounts: countBy(effectCandidates, (row) => row.status),
      effectShadergraphCandidateHashCount: new Set(effectCandidates.map((row) => row.hash).filter(Boolean)).size,
      effectPfxResourceRows: effectPfxRows.length,
      effectPfxShadergraphPathCount: pfxShadergraphIndex.size,
      shadergraphCandidateRows: allCandidates.length,
      shadergraphCandidateFoundRows: foundCandidates.length,
      shadergraphCandidateHashCount: candidateHashes.size,
      rawShadergraphHashesWithCandidate,
      rawShadergraphHashesWithoutCandidate,
      rawShadergraphWithoutCandidateAnalyzed: pathlessAnalysis.summary.analyzed,
      rawShadergraphWithoutCandidateAnalysisErrors: pathlessAnalysis.summary.analysisErrorCount,
      rawShadergraphWithoutCandidateRoleCounts: pathlessAnalysis.summary.roleCounts,
      rawShadergraphWithoutCandidateRoleSignatureCounts: pathlessAnalysis.summary.roleSignatureCounts,
      rawShadergraphWithoutCandidateTextureHashCountDistribution:
        pathlessAnalysis.summary.textureHashCountDistribution,
      rawShadergraphWithoutCandidateSamplerCountDistribution: pathlessAnalysis.summary.samplerCountDistribution,
      rawShadergraphWithoutCandidateNoTextureHashCount: pathlessAnalysis.summary.noTextureHashCount,
      rawShadergraphWithoutCandidateAllTextureHashesResolvedCount:
        pathlessAnalysis.summary.allTextureHashesResolvedCount,
      rawShadergraphWithoutCandidatePartialTextureHashesResolvedCount:
        pathlessAnalysis.summary.partialTextureHashesResolvedCount,
      rawShadergraphWithoutCandidateNoTextureHashesResolvedCount:
        pathlessAnalysis.summary.noTextureHashesResolvedCount,
      rawShadergraphWithoutCandidateTextureSignatureMatchesFoundCandidateCount:
        pathlessAnalysis.summary.textureSignatureMatchesFoundCandidateCount,
      rawShadergraphWithoutCandidateTextureSignatureMatchSourceCounts:
        pathlessAnalysis.summary.textureSignatureMatchSourceCounts,
      rawShadergraphWithoutCandidateTextureAndTextSignatureMatchesFoundCandidateCount:
        pathlessAnalysis.summary.textureAndTextSignatureMatchesFoundCandidateCount,
      rawShadergraphWithoutCandidateTextureAndTextSignatureMatchSourceCounts:
        pathlessAnalysis.summary.textureAndTextSignatureMatchSourceCounts,
      rawShadergraphWithoutCandidateUniqueTextureSignatureCount:
        pathlessAnalysis.summary.uniqueTextureSignatureCount,
      rawShadergraphWithoutCandidateTextureOwnerAnyReferenceCount:
        pathlessAnalysis.summary.textureOwnerAnyReferenceCount,
      rawShadergraphWithoutCandidateTextureOwnerAllReferencesCount:
        pathlessAnalysis.summary.textureOwnerAllReferencesCount,
      rawShadergraphWithoutCandidateTextureOwnerNoReferenceCount:
        pathlessAnalysis.summary.textureOwnerNoReferenceCount,
      rawShadergraphWithoutCandidateTextureOwnerSourceCounts:
        pathlessAnalysis.summary.textureOwnerSourceCounts,
      rawShadergraphWithoutCandidateTextureOwnerTopLevelCounts:
        pathlessAnalysis.summary.textureOwnerTopLevelCounts,
      rawShadergraphWithoutCandidateUniqueTextureHashCount:
        pathlessAnalysis.summary.uniqueTextureHashCount,
      rawShadergraphWithoutCandidateUniqueTextureHashesWithOwnerReferenceCount:
        pathlessAnalysis.summary.uniqueTextureHashesWithOwnerReferenceCount,
      rawShadergraphWithoutCandidateUniqueTextureHashesWithoutOwnerReferenceCount:
        pathlessAnalysis.summary.uniqueTextureHashesWithoutOwnerReferenceCount,
      rawShadergraphPathRecoveryCandidateCount: pathlessAnalysis.recoveryCandidates.length,
      rawShadergraphPathRecoveryTierCounts: pathlessAnalysis.summary.pathRecoveryTierCounts,
      rawShadergraphPathRecoveryConfidenceCounts: pathlessAnalysis.summary.pathRecoveryConfidenceCounts,
      rawShadergraphPathRecoveryPfxLinkedCount: pathlessAnalysis.summary.pathRecoveryPfxLinkedCount,
      rawShadergraphPathRecoveryExactTextureSignatureCount:
        pathlessAnalysis.summary.pathRecoveryExactTextureSignatureCount,
      rawShadergraphPathRecoveryExactMaterialSignatureCount:
        pathlessAnalysis.summary.pathRecoveryExactMaterialSignatureCount,
      rawShadergraphPathRecoverySingleMaterialSignatureCandidateCount:
        pathlessAnalysis.summary.pathRecoverySingleMaterialSignatureCandidateCount,
      rawShadergraphPathRecoveryUniqueMaterialSignaturePfxCandidateCount:
        pathlessAnalysis.summary.pathRecoveryUniqueMaterialSignaturePfxCandidateCount,
      rawShadergraphPathRecoverySingleTextureSignatureCandidateCount:
        pathlessAnalysis.summary.pathRecoverySingleTextureSignatureCandidateCount,
      rawShadergraphPathRecoveryMaterialSignatureAmbiguityCounts:
        pathlessAnalysis.summary.pathRecoveryMaterialSignatureAmbiguityCounts,
      candidateHashesWithoutRawShadergraph: candidateHashes.size - intersectionCount(candidateHashes, rawShadergraphHashes),
      materialPipelineShadergraphPathCount: materialShadergraphPaths.size,
      characterCandidatePathsWithMaterialPipeline: characterCandidatesWithMaterialPipeline,
      characterCandidatePathsWithoutMaterialPipeline:
        characterCandidatePaths.size - characterCandidatesWithMaterialPipeline,
      effectMaterialManifestPathCount: effectManifestPaths.size,
      effectCandidatePathsWithMaterialManifest: effectCandidatesWithMaterialManifest,
      effectCandidatePathsWithoutMaterialManifest: effectCandidatePaths.size - effectCandidatesWithMaterialManifest,
      rendererTakeoverImpact: "diagnostic-only; this audit does not prove active preview profile selection",
    },
    samples: {
      rawShadergraphWithoutCandidate: differenceSamples(rawShadergraphRecords, candidateHashes, 50),
      rawShadergraphWithoutCandidateAnalysis: pathlessAnalysis.samples,
      characterCandidateWithoutMaterialPipeline: differenceSamples(
        characterCandidates,
        materialShadergraphPaths,
        50,
        (row) => row.relativePath,
      ),
      effectCandidateWithoutMaterialManifest: differenceSamples(
        effectCandidates,
        effectManifestPaths,
        50,
        (row) => row.relativePath,
      ),
      candidateWithoutRawShadergraph: differenceSamples(foundCandidates, rawShadergraphHashes, 50),
    },
    pathRecoveryCandidates: pathlessAnalysis.recoveryCandidates,
  };
}

function writeTsv(filePath, audit) {
  const rows = [
    ["summary", "rawShadergraphCff0Count", "", audit.summary.rawShadergraphCff0Count],
    ["summary", "rawShadergraphHashesWithCandidate", "", audit.summary.rawShadergraphHashesWithCandidate],
    ["summary", "rawShadergraphHashesWithoutCandidate", "", audit.summary.rawShadergraphHashesWithoutCandidate],
    [
      "summary",
      "rawShadergraphWithoutCandidateTextureSignatureMatchesFoundCandidateCount",
      "",
      audit.summary.rawShadergraphWithoutCandidateTextureSignatureMatchesFoundCandidateCount,
    ],
    [
      "summary",
      "rawShadergraphWithoutCandidateTextureAndTextSignatureMatchesFoundCandidateCount",
      "",
      audit.summary.rawShadergraphWithoutCandidateTextureAndTextSignatureMatchesFoundCandidateCount,
    ],
    [
      "summary",
      "rawShadergraphWithoutCandidateRoleSignatureCounts",
      "",
      JSON.stringify(audit.summary.rawShadergraphWithoutCandidateRoleSignatureCounts || {}),
    ],
    [
      "summary",
      "rawShadergraphWithoutCandidateTextureOwnerTopLevelCounts",
      "",
      JSON.stringify(audit.summary.rawShadergraphWithoutCandidateTextureOwnerTopLevelCounts || {}),
    ],
    [
      "summary",
      "rawShadergraphWithoutCandidateUniqueTextureHashesWithOwnerReferenceCount",
      "",
      audit.summary.rawShadergraphWithoutCandidateUniqueTextureHashesWithOwnerReferenceCount,
    ],
    [
      "summary",
      "rawShadergraphWithoutCandidateUniqueTextureHashesWithoutOwnerReferenceCount",
      "",
      audit.summary.rawShadergraphWithoutCandidateUniqueTextureHashesWithoutOwnerReferenceCount,
    ],
    [
      "summary",
      "rawShadergraphPathRecoveryTierCounts",
      "",
      JSON.stringify(audit.summary.rawShadergraphPathRecoveryTierCounts || {}),
    ],
    [
      "summary",
      "rawShadergraphPathRecoveryConfidenceCounts",
      "",
      JSON.stringify(audit.summary.rawShadergraphPathRecoveryConfidenceCounts || {}),
    ],
    [
      "summary",
      "rawShadergraphPathRecoveryPfxLinkedCount",
      "",
      audit.summary.rawShadergraphPathRecoveryPfxLinkedCount,
    ],
    [
      "summary",
      "rawShadergraphPathRecoveryExactMaterialSignatureCount",
      "",
      audit.summary.rawShadergraphPathRecoveryExactMaterialSignatureCount,
    ],
    [
      "summary",
      "rawShadergraphPathRecoverySingleMaterialSignatureCandidateCount",
      "",
      audit.summary.rawShadergraphPathRecoverySingleMaterialSignatureCandidateCount,
    ],
    [
      "summary",
      "rawShadergraphPathRecoveryUniqueMaterialSignaturePfxCandidateCount",
      "",
      audit.summary.rawShadergraphPathRecoveryUniqueMaterialSignaturePfxCandidateCount,
    ],
    [
      "summary",
      "rawShadergraphPathRecoveryMaterialSignatureAmbiguityCounts",
      "",
      JSON.stringify(audit.summary.rawShadergraphPathRecoveryMaterialSignatureAmbiguityCounts || {}),
    ],
    ["summary", "characterCandidatePathsWithoutMaterialPipeline", "", audit.summary.characterCandidatePathsWithoutMaterialPipeline],
    ["summary", "effectCandidatePathsWithoutMaterialManifest", "", audit.summary.effectCandidatePathsWithoutMaterialManifest],
  ];
  for (const row of audit.samples.rawShadergraphWithoutCandidate) {
    rows.push(["raw-shadergraph-without-candidate", row.hash, row.filePath, row.className]);
  }
  for (const row of audit.samples.rawShadergraphWithoutCandidateAnalysis || []) {
    rows.push([
      "raw-shadergraph-without-candidate-analysis",
      row.hash,
      row.filePath,
      `roles=${row.roleSignature || ""} textureHashes=${row.textureHashCount ?? ""} resolved=${row.resolvedTextureHashCount ?? ""} samplers=${row.samplerCount ?? ""} matches=${(row.matchingFoundCandidates || []).map((candidate) => candidate.relativePath).join("|")} materialMatches=${(row.matchingMaterialSignatureCandidates || []).map((candidate) => candidate.relativePath).join("|")} owners=${(row.textureOwnerReferences || []).flatMap((item) => (item.references || []).map((ref) => ref.ownerPath)).slice(0, 6).join("|")}`,
    ]);
  }
  for (const row of audit.pathRecoveryCandidates || []) {
    rows.push([
      "raw-shadergraph-path-recovery-candidate",
      row.hash,
      row.filePath,
      `tier=${row.tier} confidence=${row.confidence} roles=${row.roleSignature || ""} textSig=${row.normalizedTextSignature || ""} textures=${row.textureHashCount} resolved=${row.resolvedTextureHashCount} materialAmbiguity=${row.materialSignatureAmbiguityClass || ""} materialCandidateCount=${row.matchingMaterialSignatureCandidatePathCount || 0} materialPfxCount=${row.materialSignaturePfxPathCount || 0} textureCandidateCount=${row.matchingCandidatePathCount || 0} pfxCount=${row.pfxPathCount || 0} materialCandidates=${(row.matchingMaterialSignatureCandidatePaths || []).join("|")} materialPfx=${(row.materialSignaturePfxPaths || []).join("|")} candidates=${(row.matchingCandidatePaths || []).join("|")} texturePfx=${(row.textureSignaturePfxPaths || []).join("|")} pfx=${(row.pfxPaths || []).join("|")} ownerSources=${(row.ownerSources || []).join("|")} ownerTopLevels=${(row.ownerTopLevels || []).join("|")}`,
    ]);
  }
  for (const row of audit.samples.characterCandidateWithoutMaterialPipeline) {
    rows.push(["character-candidate-without-material-pipeline", row.relativePath, row.filePath, row.status]);
  }
  for (const row of audit.samples.effectCandidateWithoutMaterialManifest) {
    rows.push(["effect-candidate-without-material-manifest", row.relativePath, row.filePath, row.status]);
  }
  for (const row of audit.samples.candidateWithoutRawShadergraph) {
    rows.push(["candidate-without-raw-shadergraph", row.hash, row.relativePath, row.source]);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `category\tkey\tpath\tdetail\n${rows.map((row) => row.join("\t")).join("\n")}\n`);
}

function exportAudit({
  dataRoot = defaultDataRoot,
  resourceIndexPath = defaultResourceIndexPath,
  characterCandidatesPath = defaultCharacterCandidatesPath,
  effectCandidatesPath = defaultEffectCandidatesPath,
  materialPipelinePath = defaultMaterialPipelinePath,
  materialTextureMapPath = defaultMaterialTextureMapPath,
  effectMaterialTsvPath = defaultEffectMaterialTsvPath,
  effectMaterialManifestPath = defaultEffectMaterialManifestPath,
  effectPfxManifestTsvPath = defaultEffectPfxManifestTsvPath,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildAudit({
    dataRoot,
    resourceIndexPath,
    characterCandidatesPath,
    effectCandidatesPath,
    materialPipelinePath,
    materialTextureMapPath,
    effectMaterialTsvPath,
    effectMaterialManifestPath,
    effectPfxManifestTsvPath,
  });
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, audit);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportAudit({
    dataRoot: optionValue(args, "--data-root", defaultDataRoot),
    resourceIndexPath: optionValue(args, "--resource-index", defaultResourceIndexPath),
    characterCandidatesPath: optionValue(args, "--character-candidates", defaultCharacterCandidatesPath),
    effectCandidatesPath: optionValue(args, "--effect-candidates", defaultEffectCandidatesPath),
    materialPipelinePath: optionValue(args, "--material-pipeline", defaultMaterialPipelinePath),
    materialTextureMapPath: optionValue(args, "--material-texture-map", defaultMaterialTextureMapPath),
    effectMaterialTsvPath: optionValue(args, "--effect-material-tsv", defaultEffectMaterialTsvPath),
    effectMaterialManifestPath: optionValue(args, "--effect-material-manifest", defaultEffectMaterialManifestPath),
    effectPfxManifestTsvPath: optionValue(args, "--effect-pfx-manifest-tsv", defaultEffectPfxManifestTsvPath),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildAudit,
  exportAudit,
};
