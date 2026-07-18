#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultSchemaPath = "extracted/reports/native_skinrep_schema.tsv";
const defaultTsvOut = "extracted/reports/native_skinrep_consumers.tsv";
const defaultJsonOut = "extracted/reports/native_skinrep_consumer_context.json";

const defaultFocusTypes = [
  "SkinRep",
  "AnimatedMesh",
  "StaticMesh",
  "AttachmentSkinInfo",
  "Attachment",
  "StaticEntity",
  "Locator",
  "AlternateAnimation",
  "AnimationPool",
  "NamedAnimation",
  "AliasSet",
];

function optionValues(args, name, fallback) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]);
  }
  return values.length ? values : fallback;
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function parseNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = text.startsWith("0x") ? Number.parseInt(text, 16) : Number.parseInt(text, 10);
  return Number.isFinite(number) ? number : null;
}

function hex(value) {
  if (!Number.isFinite(value)) return "";
  return `0x${value.toString(16)}`;
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

function parseTsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const columns = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    const row = {};
    columns.forEach((column, index) => {
      row[column] = values[index] ?? "";
    });
    return row;
  });
}

function loadSchemaRows(schemaPath) {
  if (!schemaPath || !fs.existsSync(schemaPath)) return [];
  return parseTsv(fs.readFileSync(schemaPath, "utf8"));
}

function contextHash(text) {
  return crypto.createHash("md5").update(text).digest("hex").slice(0, 12);
}

function contextAroundLine(lines, lineNumber, radius = 10) {
  const start = Math.max(0, lineNumber - 1 - radius);
  const end = Math.min(lines.length, lineNumber + radius);
  return lines.slice(start, end).join("\n");
}

function quotedStrings(text) {
  return [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function sourcePlatform(sourceFile) {
  if (/android/i.test(sourceFile)) return "android";
  if (/GameKindred_decompile_output/.test(sourceFile)) return "ios";
  return "";
}

function lineForBlockMatch(block, matchIndex) {
  return block.startLine + block.text.slice(0, matchIndex).split(/\r?\n/).length - 1;
}

function buildFocusSchema(schemaRows, focusTypes = defaultFocusTypes) {
  const focus = new Set(focusTypes);
  const rows = schemaRows.filter((row) => focus.has(row.typeName));
  const byOffset = new Map();

  for (const row of rows) {
    const offset = parseNumber(row.fieldOffset);
    if (!Number.isFinite(offset)) continue;
    const offsetHex = hex(offset);
    if (!byOffset.has(offsetHex)) byOffset.set(offsetHex, []);
    byOffset.get(offsetHex).push(row);
  }

  return { rows, byOffset, focusTypes: [...focus] };
}

function formatSchemaRefs(rows) {
  return rows
    .map((row) => {
      const field = row.fieldIndex === "" ? "?" : row.fieldIndex;
      return `${row.typeName}.field${field}@${row.fieldOffset}`;
    })
    .join("|");
}

function anchorKindsForBlock(blockText, focusTypes, typeSymbols) {
  const anchors = new Set();
  for (const typeName of focusTypes) {
    if (new RegExp(`\\b${typeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(blockText)) {
      anchors.add("focus-type-name");
    }
  }
  for (const symbol of typeSymbols) {
    if (blockText.includes(symbol)) anchors.add("focus-type-symbol");
  }
  if (/KindredSkinManifest|SkinManifest|SkinEntry|SkinRep/.test(blockText)) anchors.add("skin-manifest");
  if (/AttachmentSkinInfo|AttachableEquipment|Attachment|AttachPoint|AttachTo/.test(blockText)) anchors.add("attachment");
  if (/build:\/\/[^"]+/.test(blockText)) anchors.add("build-resource");
  if (/"Bone_[^"]+"/.test(blockText)) anchors.add("bone-query");
  if (/"[^"]+_bnd"/.test(blockText)) anchors.add("bind-token");
  if (/"Effect_[^"]+"/.test(blockText)) anchors.add("effect");
  if (/"Sound_[^"]+"/.test(blockText)) anchors.add("sound");
  return [...anchors].sort();
}

function rowBase({ sourceFile, block, line, evidenceKind, accessKind = "", context = "" }) {
  return {
    platform: sourcePlatform(sourceFile),
    sourceFile,
    functionName: block?.functionName || "",
    line: line || "",
    evidenceKind,
    accessKind,
    focusTypes: "",
    fieldOffsets: "",
    fieldRefs: "",
    symbols: "",
    anchorKinds: "",
    stringLiterals: "",
    score: "",
    contextHash: context ? contextHash(context) : "",
    context,
  };
}

function extractTypeRegistrationsFromSource({ sourceFile, sourceText, focusTypes = defaultFocusTypes }) {
  const focus = new Set(focusTypes);
  const lines = sourceText.split(/\r?\n/);
  const blocks = findFunctionBlocks(lines);
  const rows = [];

  const pattern =
    /\b((?:FUN|thunk_FUN)_[0-9a-fA-F]+)\s*\(&(?<symbol>DAT_[0-9a-fA-F]+),\s*(?<kind>[^,]+),\s*"(?<typeName>[^"]+)",\s*(?<typeSize>[^,]+),\s*(?<align>[^)]+)\)/g;

  for (const block of blocks) {
    for (const match of block.text.matchAll(pattern)) {
      const typeName = match.groups.typeName;
      if (!focus.has(typeName)) continue;
      const line = lineForBlockMatch(block, match.index);
      const context = contextAroundLine(lines, line);
      rows.push({
        ...rowBase({ sourceFile, block, line, evidenceKind: "type-registration", accessKind: "native-type-registry", context }),
        focusTypes: typeName,
        symbols: match.groups.symbol,
        anchorKinds: "focus-type-name|focus-type-symbol",
        stringLiterals: typeName,
        score: 100,
        typeKind: match.groups.kind.trim(),
        typeSize: match.groups.typeSize.trim(),
        align: match.groups.align.trim(),
        registrarFunction: match[1],
      });
    }
  }

  return rows;
}

function extractSymbolXrefsFromSource({ sourceFile, sourceText, typeSymbols, focusTypes = defaultFocusTypes }) {
  if (!typeSymbols.size) return [];
  const lines = sourceText.split(/\r?\n/);
  const blocks = findFunctionBlocks(lines);
  const rows = [];

  for (const block of blocks) {
    const symbols = [...typeSymbols].filter((symbol) => block.text.includes(symbol));
    if (!symbols.length) continue;
    const firstIndex = Math.min(...symbols.map((symbol) => block.text.indexOf(symbol)).filter((index) => index >= 0));
    const line = lineForBlockMatch(block, firstIndex);
    const context = contextAroundLine(lines, line);
    const anchors = anchorKindsForBlock(block.text, focusTypes, typeSymbols);
    rows.push({
      ...rowBase({ sourceFile, block, line, evidenceKind: "type-symbol-xref", accessKind: "native-type-symbol", context }),
      focusTypes: focusTypes.filter((typeName) => block.text.includes(typeName)).join("|"),
      symbols: symbols.join("|"),
      anchorKinds: anchors.join("|"),
      stringLiterals: quotedStrings(context).slice(0, 8).join("|"),
      score: 90 + anchors.length,
    });
  }

  return rows;
}

function offsetAccessKind(context) {
  if (/code \*\*/.test(context)) return "virtual-call-offset";
  if (/\*\s*\([^)]+\*\)\s*\([^)]*\+\s*0x[0-9a-fA-F]+/.test(context)) return "memory-field-offset";
  return "address-offset";
}

function extractOffsetAccessesFromSource({
  sourceFile,
  sourceText,
  focusSchema,
  typeSymbols = new Set(),
  focusTypes = defaultFocusTypes,
}) {
  const lines = sourceText.split(/\r?\n/);
  const blocks = findFunctionBlocks(lines);
  const rows = [];
  const seen = new Set();

  for (const block of blocks) {
    const anchors = anchorKindsForBlock(block.text, focusTypes, typeSymbols);
    if (!anchors.length) continue;

    for (const match of block.text.matchAll(/\+\s*(0x[0-9a-fA-F]+)/g)) {
      const offset = hex(parseNumber(match[1]));
      const line = lineForBlockMatch(block, match.index);
      const lineText = lines[line - 1] || "";
      const context = contextAroundLine(lines, line);
      const accessKind = offsetAccessKind(lineText);
      const schemaRows = focusSchema.byOffset.get(offset);
      if (!schemaRows?.length && accessKind !== "virtual-call-offset") continue;
      const key = `${sourceFile}\t${block.functionName}\t${line}\t${offset}\t${accessKind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isVirtualCall = accessKind === "virtual-call-offset";

      rows.push({
        ...rowBase({ sourceFile, block, line, evidenceKind: "offset-access", accessKind, context }),
        focusTypes: isVirtualCall ? "virtual-dispatch" : [...new Set(schemaRows.map((row) => row.typeName))].join("|"),
        fieldOffsets: offset,
        fieldRefs: isVirtualCall ? `vtable.method@${offset}` : formatSchemaRefs(schemaRows),
        symbols: [...typeSymbols].filter((symbol) => block.text.includes(symbol)).join("|"),
        anchorKinds: anchors.join("|"),
        stringLiterals: quotedStrings(context).slice(0, 10).join("|"),
        score: 50 + anchors.length * 10 + (accessKind === "memory-field-offset" ? 5 : 0),
      });
    }
  }

  return rows;
}

function schemaEvidenceRows(focusSchema) {
  return focusSchema.rows.map((row) => ({
    ...rowBase({ sourceFile: "", block: null, line: "", evidenceKind: "native-field-schema", accessKind: "schema-layout" }),
    focusTypes: row.typeName,
    fieldOffsets: row.fieldOffset,
    fieldRefs: `${row.typeName}.field${row.fieldIndex}@${row.fieldOffset}`,
    symbols: row.typePointerSymbol || "",
    anchorKinds: "native-schema",
    stringLiterals: row.exactSpanCandidates || row.candidateTypes || "",
    score: 100,
  }));
}

function typeSymbolsFromRows(rows) {
  return new Set(
    rows
      .filter((row) => row.evidenceKind === "type-registration")
      .flatMap((row) => String(row.symbols || "").split("|"))
      .filter(Boolean),
  );
}

function extractNativeSkinrepConsumersFromSource({
  sourceFile,
  sourceText,
  focusSchema = buildFocusSchema([]),
  typeSymbols = new Set(),
  focusTypes = defaultFocusTypes,
} = {}) {
  const registrationRows = extractTypeRegistrationsFromSource({ sourceFile, sourceText, focusTypes });
  const localTypeSymbols = new Set([...typeSymbols, ...typeSymbolsFromRows(registrationRows)]);
  const symbolRows = extractSymbolXrefsFromSource({
    sourceFile,
    sourceText,
    typeSymbols: localTypeSymbols,
    focusTypes,
  });
  const offsetRows = extractOffsetAccessesFromSource({
    sourceFile,
    sourceText,
    focusSchema,
    typeSymbols: localTypeSymbols,
    focusTypes,
  });

  return [...registrationRows, ...symbolRows, ...offsetRows].sort((left, right) => {
    const lineDelta = (Number(left.line) || 0) - (Number(right.line) || 0);
    if (lineDelta !== 0) return lineDelta;
    return left.evidenceKind.localeCompare(right.evidenceKind);
  });
}

function reportSummary(rows, files) {
  const byKind = {};
  const byAccessKind = {};
  const byAnchor = {};
  for (const row of rows) {
    byKind[row.evidenceKind] = (byKind[row.evidenceKind] || 0) + 1;
    if (row.accessKind) byAccessKind[row.accessKind] = (byAccessKind[row.accessKind] || 0) + 1;
    for (const anchor of String(row.anchorKinds || "").split("|").filter(Boolean)) {
      byAnchor[anchor] = (byAnchor[anchor] || 0) + 1;
    }
  }
  return {
    files,
    rows: rows.length,
    byKind,
    byAccessKind,
    byAnchor,
  };
}

function exportNativeSkinrepConsumers({
  sourcePaths = defaultSourcePaths,
  schemaPath = defaultSchemaPath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
  focusTypes = defaultFocusTypes,
} = {}) {
  const schemaRows = loadSchemaRows(schemaPath);
  const focusSchema = buildFocusSchema(schemaRows, focusTypes);
  const files = collectCFiles(sourcePaths);

  const registrationRows = [];
  const sourceTexts = [];
  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, "utf8");
    sourceTexts.push({ sourceFile: filePath, sourceText });
    registrationRows.push(...extractTypeRegistrationsFromSource({ sourceFile: filePath, sourceText, focusTypes }));
  }

  const typeSymbols = typeSymbolsFromRows(registrationRows);
  const rows = [...schemaEvidenceRows(focusSchema)];
  for (const item of sourceTexts) {
    rows.push(
      ...extractNativeSkinrepConsumersFromSource({
        ...item,
        focusSchema,
        typeSymbols,
        focusTypes,
      }),
    );
  }

  rows.sort((left, right) => {
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
    if (left.sourceFile !== right.sourceFile) return left.sourceFile.localeCompare(right.sourceFile);
    return (Number(left.line) || 0) - (Number(right.line) || 0);
  });

  const columns = [
    "platform",
    "sourceFile",
    "functionName",
    "line",
    "evidenceKind",
    "accessKind",
    "focusTypes",
    "fieldOffsets",
    "fieldRefs",
    "symbols",
    "anchorKinds",
    "stringLiterals",
    "score",
    "contextHash",
  ];
  writeTsv(tsvOut, rows, columns);

  const contextItems = rows
    .filter((row) => row.context)
    .map((row) => ({
      platform: row.platform,
      sourceFile: row.sourceFile,
      functionName: row.functionName,
      line: row.line,
      evidenceKind: row.evidenceKind,
      accessKind: row.accessKind,
      focusTypes: row.focusTypes,
      fieldRefs: row.fieldRefs,
      anchorKinds: row.anchorKinds,
      stringLiterals: row.stringLiterals,
      contextHash: row.contextHash,
      context: row.context,
    }));
  const summary = reportSummary(rows, files.length);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(
    jsonOut,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: contextItems }, null, 2)}\n`,
  );

  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const focusArg = optionValue(args, "--focus", "");
  const focusTypes = focusArg ? focusArg.split(",").map((item) => item.trim()).filter(Boolean) : defaultFocusTypes;
  const summary = exportNativeSkinrepConsumers({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    schemaPath: optionValue(args, "--schema", defaultSchemaPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    focusTypes,
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildFocusSchema,
  extractNativeSkinrepConsumersFromSource,
  extractOffsetAccessesFromSource,
  extractTypeRegistrationsFromSource,
  exportNativeSkinrepConsumers,
  loadSchemaRows,
  parseTsv,
};
