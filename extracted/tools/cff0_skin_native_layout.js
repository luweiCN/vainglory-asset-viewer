#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultSkinFieldsPath = "extracted/reports/cff0_runtime_skin_fields.tsv";
const defaultNativeSchemaPath = "extracted/reports/native_skinrep_schema.tsv";
const defaultTsvOut = "extracted/reports/cff0_skin_native_layout.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readTsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
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

function parseHex(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = text.startsWith("0x") ? Number.parseInt(text, 16) : Number.parseInt(text, 10);
  return Number.isFinite(number) ? number : null;
}

function candidateHasType(candidates, typeName) {
  return String(candidates || "")
    .split("|")
    .some((candidate) => candidate.startsWith(`${typeName}@`));
}

function buildNativeRanges(schemaRows) {
  const rowsByType = new Map();
  for (const row of schemaRows) {
    if (!rowsByType.has(row.typeName)) rowsByType.set(row.typeName, []);
    rowsByType.get(row.typeName).push(row);
  }
  for (const rows of rowsByType.values()) {
    rows.sort((left, right) => parseHex(left.fieldOffset) - parseHex(right.fieldOffset));
  }

  const ranges = [];
  const skinRows = rowsByType.get("SkinRep") || [];
  for (const row of skinRows) {
    const start = parseHex(row.fieldOffset);
    const end = parseHex(row.nextFieldOffset);
    if (start == null || end == null) continue;
    ranges.push({
      start,
      end,
      priority: 0,
      nativePath: `SkinRep.field${row.fieldIndex}`,
      nativeTypeEvidence: row.exactSpanCandidates || row.candidateTypes,
    });

    if (candidateHasType(row.exactSpanCandidates, "AnimatedMesh")) {
      for (const animated of rowsByType.get("AnimatedMesh") || []) {
        const nestedStart = start + parseHex(animated.fieldOffset);
        const nestedEnd = start + parseHex(animated.nextFieldOffset);
        ranges.push({
          start: nestedStart,
          end: nestedEnd,
          priority: 1,
          nativePath: `SkinRep.field${row.fieldIndex}/AnimatedMesh.field${animated.fieldIndex}`,
          nativeTypeEvidence: animated.exactSpanCandidates || animated.candidateTypes,
        });
      }
    }
  }

  return ranges.sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    return left.start - right.start;
  });
}

function nativeSchemaOffsetForRow(row) {
  const localOffset = Number(row.localFieldOffset);
  if (!Number.isFinite(localOffset)) return null;

  // definitionFormatByte 4 stores SkinRep pointer-sized fields in the compact
  // 32-bit layout. Native schema offsets are from the 64-bit iOS binary.
  return Number(row.definitionFormatByte) === 4 ? localOffset * 2 : localOffset;
}

function annotateNativeLayout(fieldRows, schemaRows) {
  const ranges = buildNativeRanges(schemaRows);
  return fieldRows.map((row) => {
    const nativeOffset = nativeSchemaOffsetForRow(row);
    const range = ranges.find((candidate) => nativeOffset != null && nativeOffset >= candidate.start && nativeOffset < candidate.end);
    const insideSkinRep = nativeOffset != null && nativeOffset < 0x68;
    return {
      ...row,
      nativeComparableOffset: nativeOffset == null ? "" : String(nativeOffset),
      nativeInlineStatus: range ? "inside-native-inline" : insideSkinRep ? "inside-skinrep-unmapped" : "outside-skinrep-inline",
      nativeInlinePath: range?.nativePath || "",
      nativeInlineRange:
        range && Number.isFinite(range.start) && Number.isFinite(range.end)
          ? `0x${range.start.toString(16)}-0x${range.end.toString(16)}`
          : "",
      nativeTypeEvidence: range?.nativeTypeEvidence || "",
    };
  });
}

function exportSkinNativeLayout({
  skinFieldsPath = defaultSkinFieldsPath,
  nativeSchemaPath = defaultNativeSchemaPath,
  tsvOut = defaultTsvOut,
} = {}) {
  const rows = annotateNativeLayout(readTsv(skinFieldsPath), readTsv(nativeSchemaPath));
  writeTsv(tsvOut, rows, [
    "source",
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "modelLabel",
    "recordStartField",
    "recordEndField",
    "fieldOffset",
    "localFieldOffset",
    "nativeComparableOffset",
    "nativeInlineStatus",
    "nativeInlinePath",
    "nativeInlineRange",
    "referenceKind",
    "role",
    "value",
    "semantic",
    "resourceCategory",
    "targetRelativePath",
    "sourceOffset",
    "nativeTypeEvidence",
  ]);
  return {
    rows: rows.length,
    insideNativeInline: rows.filter((row) => row.nativeInlineStatus === "inside-native-inline").length,
    outsideSkinRepInline: rows.filter((row) => row.nativeInlineStatus === "outside-skinrep-inline").length,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  console.log(
    JSON.stringify(
      exportSkinNativeLayout({
        skinFieldsPath: optionValue(args, "--skin-fields", defaultSkinFieldsPath),
        nativeSchemaPath: optionValue(args, "--native-schema", defaultNativeSchemaPath),
        tsvOut: optionValue(args, "--out", defaultTsvOut),
      }),
      null,
      2,
    ),
  );
}

module.exports = {
  annotateNativeLayout,
  buildNativeRanges,
  exportSkinNativeLayout,
  nativeSchemaOffsetForRow,
};
