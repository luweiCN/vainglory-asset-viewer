const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function normalizeBuildPath(value) {
  if (!value?.startsWith("build://")) return null;
  const relativePath = value.slice("build://".length).trim();
  return relativePath ? relativePath : null;
}

function hasPrintfPlaceholder(relativePath) {
  return /%[-+ #0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[bcdeEfgGiosuxX]/.test(relativePath);
}

function md5Upper(value) {
  return crypto.createHash("md5").update(value).digest("hex").toUpperCase();
}

function dataFileForHash(dataRoot, hash) {
  return path.join(dataRoot, hash.slice(0, 2), hash);
}

function readMagic4(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(4);
    const bytesRead = fs.readSync(fd, buffer, 0, 4, 0);
    return buffer.subarray(0, bytesRead).toString("latin1").replace(/[^\x20-\x7e]/g, ".");
  } finally {
    fs.closeSync(fd);
  }
}

function entryFor(relativePath, dataRoot) {
  const hash = md5Upper(relativePath);
  const filePath = dataFileForHash(dataRoot, hash);
  return { relativePath, hash, filePath };
}

function buildResourceIndex(lines, dataRoot) {
  const matched = [];
  const missing = [];
  const skippedPlaceholders = [];
  const skippedInvalid = [];
  const seen = new Set();

  for (const rawLine of lines) {
    const buildPath = rawLine.trim();
    if (!buildPath || seen.has(buildPath)) continue;
    seen.add(buildPath);

    const relativePath = normalizeBuildPath(buildPath);
    if (!relativePath) {
      skippedInvalid.push({ buildPath });
      continue;
    }

    if (hasPrintfPlaceholder(relativePath)) {
      skippedPlaceholders.push({ buildPath, relativePath });
      continue;
    }

    const entry = { buildPath, ...entryFor(relativePath, dataRoot) };
    if (!fs.existsSync(entry.filePath)) {
      missing.push(entry);
      continue;
    }

    const stat = fs.statSync(entry.filePath);
    matched.push({
      ...entry,
      size: stat.size,
      magic4: readMagic4(entry.filePath),
    });
  }

  return { matched, missing, skippedPlaceholders, skippedInvalid };
}

module.exports = {
  buildResourceIndex,
  dataFileForHash,
  hasPrintfPlaceholder,
  md5Upper,
  normalizeBuildPath,
  readMagic4,
};
