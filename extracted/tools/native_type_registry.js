#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultSourcePath = "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/1004b.c";
const defaultRegistryTsvOut = "extracted/reports/native_type_registry.tsv";
const defaultSchemaTsvOut = "extracted/reports/native_skinrep_schema.tsv";

const defaultFocusTypes = [
  "SkinRep",
  "AnimatedMesh",
  "StaticMesh",
  "AttachmentSkinInfo",
  "Attachment",
  "StaticEntity",
  "AliasSet",
  "AlternateAnimation",
  "NamedAnimation",
  "AnimationPool",
  "NamedBone",
  "Path",
  "SubFlare",
];

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

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function findFunctionBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let pending = null;
  let active = null;
  let braceDepth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const signature = line.match(/^\w[\w\s*]*\b(FUN_[0-9a-fA-F]+)\s*\(/);
    if (!active && signature) {
      pending = {
        functionName: signature[1],
        startLine: index + 1,
        startIndex: index,
      };
    }

    if (pending && !active && line.includes("{")) {
      active = pending;
      pending = null;
      braceDepth = 0;
    }

    if (!active) continue;

    for (const char of line) {
      if (char === "{") braceDepth += 1;
      else if (char === "}") braceDepth -= 1;
    }

    if (braceDepth === 0) {
      blocks.push({
        functionName: active.functionName,
        startLine: active.startLine,
        endLine: index + 1,
        text: lines.slice(active.startIndex, index + 1).join("\n"),
      });
      active = null;
    }
  }

  return blocks;
}

function extractTypeRegistrations(blocks) {
  const rows = [];
  const byDataSymbol = new Map();
  const byName = new Map();

  for (const block of blocks) {
    const registration = block.text.match(/FUN_1010a3954\(&DAT_([0-9a-fA-F]+),\s*([^,]+),\s*"([^"]*)",\s*([^,]+),\s*([^)]+)\)/);
    if (!registration) continue;

    const fieldBase = block.text.match(/\*\(undefined4 \*\*\)\(lVar1 \+ 0x10\) = &(DAT_[0-9a-fA-F]+);/)?.[1] || "";
    const fieldCountSymbol = block.text.match(/\*\(undefined4 \*\*\)\(lVar1 \+ 0x18\) = &(DAT_[0-9a-fA-F]+);/)?.[1] || "";
    const row = {
      dataSymbol: `DAT_${registration[1]}`,
      dataAddress: `0x${registration[1]}`,
      typeKind: registration[2].trim(),
      typeName: registration[3],
      typeSize: parseNumber(registration[4]),
      typeSizeText: registration[4].trim(),
      align: parseNumber(registration[5]),
      alignText: registration[5].trim(),
      registrationFunction: block.functionName,
      registrationLine: block.startLine,
      fieldBase,
      fieldCountSymbol,
    };
    rows.push(row);
    byDataSymbol.set(row.dataSymbol, row);
    if (row.typeName) byName.set(row.typeName, row);
  }

  return { rows, byDataSymbol, byName };
}

function extractFieldDescriptorBlocks(blocks) {
  const output = new Map();

  for (const block of blocks) {
    const countUpdates = [...block.text.matchAll(/\b(DAT_[0-9a-fA-F]+) = \1 \+ (0x[0-9a-fA-F]+|\d+);/g)];
    if (!countUpdates.length) continue;

    const descriptors = [];
    const descriptorPattern =
      /(DAT_[0-9a-fA-F]+) = 0;\s*\n\s*(DAT_[0-9a-fA-F]+) = (0x[0-9a-fA-F]+|\d+);\s*\n\s*(DAT_[0-9a-fA-F]+) = (PTR_DAT_[0-9a-fA-F]+);/g;
    for (const match of block.text.matchAll(descriptorPattern)) {
      descriptors.push({
        descriptorSymbol: match[1],
        offsetSymbol: match[2],
        fieldOffset: parseNumber(match[3]),
        fieldOffsetText: match[3],
        typePointerSymbol: match[5],
      });
    }

    for (const update of countUpdates) {
      output.set(update[1], {
        fieldCountSymbol: update[1],
        declaredFieldCount: parseNumber(update[2]),
        initFunction: block.functionName,
        initLine: block.startLine,
        descriptors,
      });
    }
  }

  return output;
}

function candidateTypes(typePointerSymbol, fieldSpan, registrations) {
  const suffix = typePointerSymbol.match(/PTR_DAT_([0-9a-fA-F]+)/)?.[1];
  if (!suffix) return [];
  const pointerAddress = Number.parseInt(suffix, 16);
  return registrations
    .filter((registration) => {
      const address = Number.parseInt(registration.dataAddress.slice(2), 16);
      return Math.abs(address - pointerAddress) <= 0x70;
    })
    .map((registration) => {
      const address = Number.parseInt(registration.dataAddress.slice(2), 16);
      const delta = address - pointerAddress;
      const exactSpan = fieldSpan != null && registration.typeSize === fieldSpan;
      return {
        ...registration,
        delta,
        exactSpan,
      };
    })
    .sort((left, right) => {
      if (left.exactSpan !== right.exactSpan) return left.exactSpan ? -1 : 1;
      return Math.abs(left.delta) - Math.abs(right.delta);
    });
}

function formatCandidates(candidates) {
  return candidates
    .map((candidate) => {
      const size = candidate.typeSize == null ? candidate.typeSizeText : `0x${candidate.typeSize.toString(16)}`;
      const exact = candidate.exactSpan ? "exact-span" : "nearby";
      const delta = candidate.delta >= 0 ? `+0x${candidate.delta.toString(16)}` : `-0x${Math.abs(candidate.delta).toString(16)}`;
      return `${candidate.typeName || "(anonymous)"}@${candidate.dataAddress}:${size}:kind${candidate.typeKind}:${delta}:${exact}`;
    })
    .join("|");
}

function buildSchemaRows({ registrations, descriptorBlocks, focusTypes = defaultFocusTypes }) {
  const focus = new Set(focusTypes);
  const rows = [];

  for (const registration of registrations) {
    if (!focus.has(registration.typeName)) continue;
    const descriptorBlock = descriptorBlocks.get(registration.fieldCountSymbol);
    const descriptors = descriptorBlock?.descriptors || [];
    const sorted = descriptors.slice().sort((left, right) => left.fieldOffset - right.fieldOffset);

    for (let index = 0; index < sorted.length; index += 1) {
      const descriptor = sorted[index];
      const nextOffset = sorted[index + 1]?.fieldOffset ?? registration.typeSize;
      const fieldSpan =
        Number.isFinite(descriptor.fieldOffset) && Number.isFinite(nextOffset) ? nextOffset - descriptor.fieldOffset : null;
      const candidates = candidateTypes(descriptor.typePointerSymbol, fieldSpan, registrations);
      rows.push({
        typeName: registration.typeName,
        typeSize: registration.typeSize == null ? registration.typeSizeText : `0x${registration.typeSize.toString(16)}`,
        fieldIndex: index,
        fieldOffset: `0x${descriptor.fieldOffset.toString(16)}`,
        nextFieldOffset: nextOffset == null ? "" : `0x${nextOffset.toString(16)}`,
        fieldSpan: fieldSpan == null ? "" : `0x${fieldSpan.toString(16)}`,
        typePointerSymbol: descriptor.typePointerSymbol,
        candidateTypes: formatCandidates(candidates),
        exactSpanCandidates: formatCandidates(candidates.filter((candidate) => candidate.exactSpan)),
        registrationFunction: registration.registrationFunction,
        descriptorInitFunction: descriptorBlock?.initFunction || "",
      });
    }
  }

  return rows;
}

function exportNativeTypeRegistry({
  sourcePath = defaultSourcePath,
  registryTsvOut = defaultRegistryTsvOut,
  schemaTsvOut = defaultSchemaTsvOut,
  focusTypes = defaultFocusTypes,
} = {}) {
  const text = fs.readFileSync(sourcePath, "utf8");
  const blocks = findFunctionBlocks(text);
  const { rows: registrations } = extractTypeRegistrations(blocks);
  if (registrations.length === 0) {
    throw new Error(`no native type registrations parsed from ${sourcePath}`);
  }
  const descriptorBlocks = extractFieldDescriptorBlocks(blocks);
  const schemaRows = buildSchemaRows({ registrations, descriptorBlocks, focusTypes });

  writeTsv(registryTsvOut, registrations, [
    "dataSymbol",
    "dataAddress",
    "typeKind",
    "typeName",
    "typeSize",
    "typeSizeText",
    "align",
    "alignText",
    "registrationFunction",
    "registrationLine",
    "fieldBase",
    "fieldCountSymbol",
  ]);
  writeTsv(schemaTsvOut, schemaRows, [
    "typeName",
    "typeSize",
    "fieldIndex",
    "fieldOffset",
    "nextFieldOffset",
    "fieldSpan",
    "typePointerSymbol",
    "candidateTypes",
    "exactSpanCandidates",
    "registrationFunction",
    "descriptorInitFunction",
  ]);

  return {
    registrations: registrations.length,
    schemaRows: schemaRows.length,
    focusTypes,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const sourcePath = optionValue(args, "--source", defaultSourcePath);
  const registryTsvOut = optionValue(args, "--registry-out", defaultRegistryTsvOut);
  const schemaTsvOut = optionValue(args, "--schema-out", defaultSchemaTsvOut);
  const focusArg = optionValue(args, "--focus", "");
  const focusTypes = focusArg ? focusArg.split(",").map((item) => item.trim()).filter(Boolean) : defaultFocusTypes;
  console.log(JSON.stringify(exportNativeTypeRegistry({ sourcePath, registryTsvOut, schemaTsvOut, focusTypes }), null, 2));
}

module.exports = {
  buildSchemaRows,
  candidateTypes,
  extractFieldDescriptorBlocks,
  extractTypeRegistrations,
  exportNativeTypeRegistry,
  findFunctionBlocks,
};
