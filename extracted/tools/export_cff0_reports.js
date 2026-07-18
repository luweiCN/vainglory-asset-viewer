#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { decodeInstanceChunks, parseCff0File, parsePatchTable } = require("./cff0_tools");
const {
  buildDefinitionBindingTokenRows,
  buildDefinitionInstanceStringRows,
} = require("./definition_instance_graph");

const defaultDefinitionIndex = "extracted/reports/definition_resource_index.tsv";
const defaultOutDir = "extracted/reports";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function readDefinitionIndex(filePath) {
  const [headerLine, ...lines] = fs.readFileSync(filePath, "utf8").trimEnd().split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function summarizeParsed(entry, parsed) {
  const chunkCounts = parsed.chunks.reduce((acc, chunk) => {
    acc[chunk.magic] = (acc[chunk.magic] || 0) + 1;
    return acc;
  }, {});

  return {
    relativePath: entry.relativePath,
    hash: entry.hash,
    size: parsed.actualSize,
    declaredSize: parsed.declaredSize,
    headerSize: parsed.headerSize,
    chunkCount: parsed.chunks.length,
    chunks: Object.entries(chunkCounts)
      .map(([magic, count]) => `${magic}:${count}`)
      .join(","),
    symbols: parsed.symbols.join("|"),
    linkedPath: entry.linkedPath,
  };
}

function exportCff0Reports({ definitionIndex, outDir }) {
  const definitions = readDefinitionIndex(definitionIndex);
  const summaryRows = [];
  const chunkRows = [];
  const decodedInstanceRows = [];
  const decodedInstances = [];
  const patchRows = [];
  const symbolRows = [];

  for (const entry of definitions) {
    const filePath = entry.linkedPath || entry.filePath;
    const fileBuffer = fs.readFileSync(filePath);
    const parsed = parseCff0File(filePath);
    summaryRows.push(summarizeParsed(entry, parsed));

    for (const decoded of decodeInstanceChunks(parsed, fileBuffer)) {
      decodedInstances.push({
        relativePath: entry.relativePath,
        hash: entry.hash,
        blockIndex: decoded.blockIndex,
        definitionFormatByte: decoded.definitionFormatByte,
        definitionVersionByte: decoded.definitionVersionByte,
        payloadSize: decoded.payloadSize,
        stringRecords: decoded.stringRecords,
      });
      decodedInstanceRows.push({
        relativePath: entry.relativePath,
        hash: entry.hash,
        blockIndex: decoded.blockIndex,
        definitionFormatByte: decoded.definitionFormatByte,
        definitionVersionByte: decoded.definitionVersionByte,
        offset: decoded.offset,
        payloadSize: decoded.payloadSize,
        stringCount: decoded.strings.length,
        strings: decoded.strings.join("|"),
      });
    }

    for (const chunk of parsed.chunks) {
      chunkRows.push({
        relativePath: entry.relativePath,
        hash: entry.hash,
        magic: chunk.magic,
        offset: chunk.offset,
        size: chunk.size,
        payloadSize: chunk.payloadSize,
        strings: chunk.magic === "SYMB" ? chunk.symbols.join("|") : "",
      });

      if (chunk.magic === "PTCH") {
        const buffer = fileBuffer.subarray(chunk.payloadOffset, chunk.payloadOffset + chunk.payloadSize);
        const table = parsePatchTable(buffer);
        patchRows.push({
          relativePath: entry.relativePath,
          hash: entry.hash,
          offset: chunk.offset,
          payloadSize: chunk.payloadSize,
          entryCount: table.entryCount,
          firstEntries: table.entries
            .slice(0, 8)
            .map((item) => `${item.sourceOffset}:${item.targetOffset}`)
            .join(","),
          lastEntries: table.entries
            .slice(-8)
            .map((item) => `${item.sourceOffset}:${item.targetOffset}`)
            .join(","),
          tailValues: table.tailValues.join(","),
        });
      }
    }

    for (const symbol of parsed.symbols) {
      symbolRows.push({
        relativePath: entry.relativePath,
        hash: entry.hash,
        symbol,
      });
    }
  }

  const instanceStringRows = buildDefinitionInstanceStringRows(decodedInstances);
  const bindingTokenRows = buildDefinitionBindingTokenRows(instanceStringRows);

  writeTsv(path.join(outDir, "cff0_definition_summary.tsv"), summaryRows, [
    "relativePath",
    "hash",
    "size",
    "declaredSize",
    "headerSize",
    "chunkCount",
    "chunks",
    "symbols",
    "linkedPath",
  ]);
  writeTsv(path.join(outDir, "cff0_definition_chunks.tsv"), chunkRows, [
    "relativePath",
    "hash",
    "magic",
    "offset",
    "size",
    "payloadSize",
    "strings",
  ]);
  writeTsv(path.join(outDir, "cff0_definition_symbols.tsv"), symbolRows, ["relativePath", "hash", "symbol"]);
  writeTsv(path.join(outDir, "cff0_decoded_instances.tsv"), decodedInstanceRows, [
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "offset",
    "payloadSize",
    "stringCount",
    "strings",
  ]);
  writeTsv(path.join(outDir, "cff0_patch_tables.tsv"), patchRows, [
    "relativePath",
    "hash",
    "offset",
    "payloadSize",
    "entryCount",
    "firstEntries",
    "lastEntries",
    "tailValues",
  ]);
  writeTsv(path.join(outDir, "definition_instance_strings.tsv"), instanceStringRows, [
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "payloadSize",
    "stringIndex",
    "payloadOffset",
    "semantic",
    "labelBefore",
    "value",
    "resourceCategory",
    "targetRelativePath",
    "targetBuildPath",
  ]);
  writeTsv(path.join(outDir, "definition_binding_tokens.tsv"), bindingTokenRows, [
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "stringIndex",
    "payloadOffset",
    "bindToken",
    "labelBefore",
    "nearbyResourceCount",
    "nearbyResources",
  ]);

  return {
    definitions: definitions.length,
    chunks: chunkRows.length,
    decodedInstances: decodedInstanceRows.length,
    patchTables: patchRows.length,
    symbols: symbolRows.length,
    instanceStrings: instanceStringRows.length,
    bindingTokens: bindingTokenRows.length,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCff0Reports({
    definitionIndex: optionValue(args, "--definitions", defaultDefinitionIndex),
    outDir: optionValue(args, "--out", defaultOutDir),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  exportCff0Reports,
  readDefinitionIndex,
  summarizeParsed,
};
