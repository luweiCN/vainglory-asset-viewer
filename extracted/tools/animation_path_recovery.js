const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function md5Upper(value) {
  return crypto.createHash("md5").update(value).digest("hex").toUpperCase();
}

function readTsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function expandPrintfIntegerPattern(pattern, maxValue) {
  const placeholder = /%[-+ #0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[diu]/;
  const count = (pattern.match(new RegExp(placeholder.source, "g")) || []).length;
  const output = [];

  function visit(value, index) {
    if (index === count) {
      output.push(value);
      return;
    }

    for (let number = 0; number <= maxValue; number += 1) {
      visit(value.replace(placeholder, String(number)), index + 1);
    }
  }

  visit(pattern, 0);
  return output;
}

function buildAnimationPathRecovery({ animationIndexPath, candidatePath, placeholderRows, placeholderMax = 15 }) {
  const candidates = readTsv(candidatePath);
  const candidateByHash = new Map(candidates.map((entry) => [entry.hash, entry]));
  const matchesByHash = new Map();

  function addMatch(hash, relativePath, matchSource) {
    if (!candidateByHash.has(hash) || matchesByHash.has(hash)) return;
    matchesByHash.set(hash, {
      ...candidateByHash.get(hash),
      relativePath,
      matchSource,
    });
  }

  for (const row of readTsv(animationIndexPath)) {
    addMatch(row.hash, row.relativePath, "known-build-path");
  }

  for (const row of placeholderRows) {
    const relativePath = row.relativePath || row;
    for (const expandedPath of expandPrintfIntegerPattern(relativePath, placeholderMax)) {
      addMatch(md5Upper(expandedPath), expandedPath, "placeholder-expansion");
    }
  }

  const matches = [...matchesByHash.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const unresolved = candidates
    .filter((entry) => !matchesByHash.has(entry.hash))
    .sort((left, right) => left.hash.localeCompare(right.hash));

  return { matches, unresolved };
}

function writeTsv(filePath, rows, columns) {
  const lines = [columns.join("\t")];
  for (const row of rows) {
    lines.push(columns.map((column) => String(row[column] ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

module.exports = {
  buildAnimationPathRecovery,
  expandPrintfIntegerPattern,
  md5Upper,
  readTsv,
  writeTsv,
};
