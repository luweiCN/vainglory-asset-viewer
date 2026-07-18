#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const defaultBinaryPath = "extracted/ios_raw/Payload/GameKindred.app/GameKindred";
const defaultCallbackTableScanPath = "extracted/viewer/native-particle-callback-table-scan.json";
const defaultSourceDir = "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions";
const defaultViewerOut = "extracted/viewer/native-particle-callback-semantics.json";
const defaultTsvOut = "extracted/reports/native_particle_callback_semantics.tsv";
const defaultJsonOut = "extracted/reports/native_particle_callback_semantics_summary.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function readAddressSet(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return new Set();
  const addresses = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim().toLowerCase())
    .filter((line) => /^0x[0-9a-f]+$/i.test(line));
  return new Set(addresses);
}

function decodeHexBytes(value) {
  const text = String(value || "")
    .replace(/^0x/i, "")
    .replace(/[^0-9a-f]/gi, "");
  if (!text || text.length % 2 !== 0) return null;
  return Buffer.from(text, "hex");
}

function decodeVirtualMemoryOverlayBytes(entry) {
  if (Array.isArray(entry?.bytes)) return Buffer.from(entry.bytes.map((value) => Number(value) & 0xff));
  if (entry?.bytesHex || entry?.hex) return decodeHexBytes(entry.bytesHex || entry.hex);
  if (entry?.bytesBase64 || entry?.base64) return Buffer.from(String(entry.bytesBase64 || entry.base64), "base64");
  return null;
}

function readVirtualMemoryOverlays(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  let records = [];
  try {
    const parsed = JSON.parse(text);
    records = Array.isArray(parsed)
      ? parsed
      : parsed.ranges || parsed.items || parsed.records || (decodeVirtualMemoryOverlayBytes(parsed) ? [parsed] : []);
  } catch {
    records = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
  return records
    .map((entry) => {
      const virtualAddress = parseIntegerLiteral(
        entry.virtualAddress || entry.address || entry.start || entry.baseAddress || entry.sourceAddress,
      );
      const bytes = decodeVirtualMemoryOverlayBytes(entry);
      if (!Number.isFinite(virtualAddress) || !Buffer.isBuffer(bytes) || !bytes.length) return null;
      return {
        virtualAddress,
        bytes,
        source: entry.source || entry.type || "",
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.virtualAddress - right.virtualAddress);
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

function instructionText(line) {
  return String(line || "")
    .replace(/^\s*[0-9a-f]+:\s+[0-9a-f]+\s+/i, "")
    .trim();
}

function roundFloat(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function parseIntegerLiteral(value) {
  const text = String(value || "").trim();
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text, 16);
  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);
  return null;
}

function parseSignedIntegerLiteral(value) {
  const text = String(value || "").trim();
  if (/^-0x[0-9a-f]+$/i.test(text)) return -Number.parseInt(text.slice(3), 16);
  if (/^\+?0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text.replace(/^\+/, ""), 16);
  if (/^[-+]?\d+$/.test(text)) return Number.parseInt(text, 10);
  return null;
}

function immediateBits32Literal(value) {
  const parsed = parseSignedIntegerLiteral(value);
  if (parsed === null || !Number.isFinite(parsed)) return "";
  return `0x${(parsed >>> 0).toString(16)}`;
}

function float32FromHexBits(bits) {
  const value = parseIntegerLiteral(bits);
  if (!Number.isFinite(value)) return null;
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  const floatValue = buffer.readFloatLE(0);
  return Number.isFinite(floatValue) ? roundFloat(floatValue) : null;
}

function sourceAddressForDataSymbol(symbol) {
  const match = String(symbol || "").match(/^DAT_([0-9a-f]+)$/i);
  if (!match) return "";
  const value = Number.parseInt(match[1], 16);
  return Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function pattern16StoreFromSource(sourceText) {
  const matches = [
    ...String(sourceText || "").matchAll(
      /\b_memset_pattern16\s*\(\s*param_2\s*,\s*&\s*(DAT_[0-9a-f]+)\s*,/gi,
    ),
  ].map((match) => match[1]);
  const symbols = [...new Set(matches)];
  if (symbols.length !== 1) return null;
  const pattern16SourceAddress = sourceAddressForDataSymbol(symbols[0]);
  if (!pattern16SourceAddress) return null;
  return {
    pattern16Symbol: symbols[0],
    pattern16SourceAddress,
  };
}

function neonFmovVectorConstantFromSource(sourceText) {
  const text = String(sourceText || "");
  const match = text.match(/\bNEON_fmov\s*\(\s*(0x[0-9a-f]{1,8})\s*,\s*4\s*\)/i);
  if (!match) return null;
  if (!/param_2\s*\[\s*1\s*\]\s*=\s*\w+\._8_8_\s*;/i.test(text)) return null;
  if (!/\*\s*param_2\s*=\s*\w+\._0_8_\s*;/i.test(text)) return null;
  const value = float32FromHexBits(match[1]);
  if (!Number.isFinite(value)) return null;
  return [value, value, value, value];
}

function firstComponentConstantFromSource(sourceText) {
  const text = String(sourceText || "");
  const packed64 = text.match(/\*\s*(param_[23])\s*=\s*(0x[0-9a-f]{9,16})\s*;/i);
  if (packed64) {
    const firstComponentBits = `0x${packed64[2].slice(2).padStart(16, "0").slice(-8)}`.toLowerCase();
    const value = float32FromHexBits(firstComponentBits);
    if (Number.isFinite(value)) {
      const targetName = packed64[1].toLowerCase().replace("_", "");
      return {
        outputStore: `source-packed64-first-component-to-${targetName}`,
        firstComponentBits,
        firstComponentValue: value,
      };
    }
  }

  const direct = text.match(/\*\s*(param_[23])\s*=\s*(0x[0-9a-f]{1,8})\s*;/i);
  if (direct) {
    const value = float32FromHexBits(direct[2]);
    if (Number.isFinite(value)) {
      const targetName = direct[1].toLowerCase().replace("_", "");
      return {
        outputStore: `source-first-component-constant-to-${targetName}`,
        firstComponentBits: direct[2].toLowerCase(),
        firstComponentValue: value,
      };
    }
  }

  for (const match of text.matchAll(/\b(\w+)\s*=\s*NEON_fmov\s*\(\s*(0x[0-9a-f]{1,8})\s*,\s*4\s*\)\s*;/gi)) {
    const variableName = match[1];
    const target = text.match(new RegExp(`\\*\\s*(param_[23])\\s*=\\s*${variableName}\\s*;`, "i"));
    if (!target) continue;
    const value = float32FromHexBits(match[2]);
    if (!Number.isFinite(value)) continue;
    const targetName = target[1].toLowerCase().replace("_", "");
    return {
      outputStore: `source-neon-fmov-first-component-to-${targetName}`,
      firstComponentBits: match[2].toLowerCase(),
      firstComponentValue: value,
    };
  }
  return null;
}

function randomAffineScalarRange(sourceText) {
  const match = String(sourceText || "").match(
    /\*\s*(param_[23])\s*=\s*\(float\)iVar\d+\s*\*\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)(?:\s*\*\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?))?(?:\s*\+\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?))?\s*;/i,
  );
  if (!match) return null;
  const targetName = match[1].toLowerCase().replace("_", "");
  const firstScale = Number(match[2]);
  const secondScale = match[3] === undefined ? 1 : Number(match[3]);
  const scale = firstScale * secondScale;
  const base = match[4] === undefined ? 0 : Number(match[4]);
  if (!Number.isFinite(firstScale) || !Number.isFinite(secondScale) || !Number.isFinite(scale) || !Number.isFinite(base)) {
    return null;
  }
  const endpoint = base + scale * 2147483647;
  return {
    outputStore: `random-affine-to-${targetName}`,
    randomScale: scale,
    randomBase: roundFloat(base),
    randomMinValue: roundFloat(Math.min(base, endpoint)),
    randomMaxValue: roundFloat(Math.max(base, endpoint)),
  };
}

function randomAffineExpressionRange(expression) {
  const numberPattern = "[-+]?\\d*\\.?\\d+(?:e[-+]?\\d+)?";
  const match = String(expression || "").match(
    new RegExp(
      `\\(float\\)[\\s\\S]*?\\*\\s*(${numberPattern})(?:\\s*\\*\\s*(${numberPattern}))?(?:\\s*\\+\\s*(${numberPattern}))?\\s*$`,
      "i",
    ),
  );
  if (!match) return null;
  const firstScale = Number(match[1]);
  const secondScale = match[2] === undefined ? 1 : Number(match[2]);
  const scale = firstScale * secondScale;
  const base = match[3] === undefined ? 0 : Number(match[3]);
  if (!Number.isFinite(firstScale) || !Number.isFinite(secondScale) || !Number.isFinite(scale) || !Number.isFinite(base)) {
    return null;
  }
  const endpoint = base + scale * 2147483647;
  return {
    scale,
    base: roundFloat(base),
    minValue: roundFloat(Math.min(base, endpoint)),
    maxValue: roundFloat(Math.max(base, endpoint)),
  };
}

function randomAffineVector2Range(sourceText) {
  const match = String(sourceText || "").match(/\*\s*(param_[23])\s*=\s*CONCAT44\s*\(([\s\S]*?),\s*([\s\S]*?)\)\s*;/i);
  if (!match) return null;
  const highRange = randomAffineExpressionRange(match[2]);
  const lowRange = randomAffineExpressionRange(match[3]);
  if (!highRange || !lowRange) return null;
  const targetName = match[1].toLowerCase().replace("_", "");
  return {
    outputStore: `random-affine-vector2-to-${targetName}`,
    randomScale: lowRange.scale,
    randomBase: lowRange.base,
    randomMinValue: lowRange.minValue,
    randomMaxValue: lowRange.maxValue,
    vectorRandomMinValues: [lowRange.minValue, highRange.minValue],
    vectorRandomMaxValues: [lowRange.maxValue, highRange.maxValue],
  };
}

function computedScalarOutputStoreFromSource(sourceText) {
  const match = String(sourceText || "").match(/\*\s*(param_[23])\s*=\s*[^;]+;/i);
  if (!match) return null;
  const targetName = match[1].toLowerCase().replace("_", "");
  return {
    outputStore: `computed-scalar-to-${targetName}`,
  };
}

function param1ByteGridOutputStoreFromSource(sourceText) {
  const text = String(sourceText || "");
  if (/\bparam_[23]\b/.test(text)) return null;
  const indexedWrites = [...text.matchAll(/\bparam_1\s*\[\s*(?:0x[0-9a-f]+|\d+)\s*\]\s*=/gi)];
  if (indexedWrites.length < 4) return null;
  return {
    outputStore: "computed-byte-grid-to-param1",
  };
}

function sideEffectOnlyCallbackFromSource(sourceText) {
  const text = String(sourceText || "");
  if (/(?:\*\s*param_[23]\s*=|\bparam_[23]\s*\[\s*\d+\s*\]\s*=)/i.test(text)) return null;
  if (/\b_send\s*\(/i.test(text)) {
    return {
      outputStore: "side-effect-no-particle-output",
    };
  }
  return null;
}

function callbackDependencyFlagsFromSource(sourceText) {
  const text = String(sourceText || "");
  const flags = [];
  if (/\b(?:time|age|lifetime|elapsed|delta)\b/i.test(text) && /\bparam_1\b/.test(text)) flags.push("time-input");
  if (/\b_rand\s*\(/.test(text)) flags.push("random");
  if (/\bparam_4\b/.test(text)) flags.push("particle-index-array");
  if (/\bparam_5\b/.test(text)) flags.push("particle-source-array");
  if (/\b0x48000\b|\b0x50000\b/i.test(text)) flags.push("particle-lifetime-window");
  if (/\bDAT_[0-9a-f]+\b/i.test(text)) flags.push("data-symbol");
  if (/\b_memset_pattern16\b/i.test(text)) flags.push("pattern16-data");
  if (/curve|DAT_[0-9a-f]+/i.test(text) && /param_1|param_5|param_4/i.test(text)) flags.push("curve-or-table-data");
  return [...new Set(flags)];
}

function halfFloatUnpackOutputStoreFromSource(sourceText) {
  const text = String(sourceText || "");
  if (!/\bushort\s*\*\s*param_2\b/i.test(text)) return null;
  if (!/\*\s*param_1\s*=/.test(text) || !/\bparam_1\s*\[\s*\d+\s*\]\s*=/.test(text)) return null;
  if (!/\bparam_2\s*\[\s*\d+\s*\]/.test(text)) return null;
  return {
    outputStore: "half-float-unpack-vector-to-param1",
  };
}

function helperDispatchOutputStoreFromSource(sourceText) {
  const text = String(sourceText || "");
  const matches = [
    ...text.matchAll(
      /\(\s*\*\s*(DAT_[0-9a-f]+)\s*\)\s*\(\s*param_1(?:\s*\+\s*(?:0x[0-9a-f]+|\d+))?\s*,\s*param_2(?:\s*\+\s*(0x[0-9a-f]+|\d+))?\s*\)/gi,
    ),
  ];
  if (matches.length < 2) return null;
  const helpers = new Set(matches.map((match) => match[1].toLowerCase()));
  if (helpers.size !== 1) return null;
  const offsets = matches.map((match) => parseIntegerLiteral(match[2] || "0")).filter((value) => Number.isFinite(value));
  if (!offsets.includes(0) || !offsets.some((value) => value > 0)) return null;
  return {
    outputStore: offsets.some((value) => value >= 0x80) ? "helper-dispatch-to-param2-strided" : "helper-dispatch-to-param2",
  };
}

const numberPattern = "[-+]?\\d*\\.?\\d+(?:e[-+]?\\d+)?";

function curveOutputStoreName(target, componentIndex) {
  const targetName = String(target || "").toLowerCase().replace("_", "");
  return componentIndex > 0 ? `curve-table-range-to-${targetName}[${componentIndex}]` : `curve-table-range-to-${targetName}`;
}

function curveOutputAssignmentsFromSource(sourceText) {
  const text = String(sourceText || "");
  const outputs = [];
  const expressionSuffix = `\\s*(?:\\*\\s*(${numberPattern}))?\\s*;`;

  for (const match of text.matchAll(new RegExp(`\\*\\s*(param_[23])\\s*=\\s*(\\w+)${expressionSuffix}`, "gi"))) {
    outputs.push({
      matchIndex: match.index || 0,
      target: match[1],
      outputVariable: match[2],
      multiplier: match[3] === undefined ? 1 : Number(match[3]),
      componentIndex: 0,
    });
  }

  for (const match of text.matchAll(new RegExp(`(param_[23])\\s*\\[\\s*(\\d+)\\s*\\]\\s*=\\s*(\\w+)${expressionSuffix}`, "gi"))) {
    outputs.push({
      matchIndex: match.index || 0,
      target: match[1],
      outputVariable: match[3],
      multiplier: match[4] === undefined ? 1 : Number(match[4]),
      componentIndex: Number(match[2]),
    });
  }

  for (const match of text.matchAll(
    new RegExp(
      `\\*\\s*\\(\\s*float\\s*\\*\\s*\\)\\s*\\(\\s*\\(long\\)\\s*(param_[23])\\s*\\+\\s*(0x[0-9a-f]+|\\d+)\\s*\\)\\s*=\\s*(\\w+)${expressionSuffix}`,
      "gi",
    ),
  )) {
    const byteOffset = parseIntegerLiteral(match[2]);
    outputs.push({
      matchIndex: match.index || 0,
      target: match[1],
      outputVariable: match[3],
      multiplier: match[4] === undefined ? 1 : Number(match[4]),
      componentIndex: Number.isInteger(byteOffset) && byteOffset >= 0 ? byteOffset / 4 : NaN,
    });
  }

  return outputs
    .filter(
      (output) =>
        /^\w+$/.test(output.outputVariable || "") &&
        Number.isFinite(output.multiplier) &&
        Number.isInteger(output.componentIndex) &&
        output.componentIndex >= 0,
    )
    .sort((left, right) => left.componentIndex - right.componentIndex || left.matchIndex - right.matchIndex);
}

function curveTableAssignmentForOutput(text, output) {
  const beforeOutput = String(text || "").slice(0, output.matchIndex);
  const assignments = [
    ...beforeOutput.matchAll(new RegExp(`\\b${output.outputVariable}\\s*=\\s*([\\s\\S]*?);`, "g")),
  ].filter((match) => /\bDAT_[0-9a-f]+\b/i.test(match[1]));
  const assignment = assignments.at(-1);
  if (!assignment) return null;
  const tableSymbols = [...assignment[1].matchAll(/\b(DAT_[0-9a-f]+)\b/gi)].map((match) => match[1]);
  const uniqueTableSymbols = [...new Set(tableSymbols)];
  if (uniqueTableSymbols.length !== 1) return null;
  return uniqueTableSymbols[0];
}

function curveBoundaryValuesForVariable(text, outputVariable, endIndex) {
  const beforeOutput = String(text || "").slice(0, endIndex);
  const boundaryValues = [];
  const variables = new Set([outputVariable]);
  for (const match of beforeOutput.matchAll(new RegExp(`\\b${outputVariable}\\s*=\\s*(\\w+)\\s*;`, "g"))) {
    if (match[1] !== outputVariable) variables.add(match[1]);
  }
  for (const variable of variables) {
    const assignment = new RegExp(`\\b${variable}\\s*=\\s*(${numberPattern})\\s*[,;]`, "gi");
    for (const match of beforeOutput.matchAll(assignment)) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) boundaryValues.push(roundFloat(value));
    }
  }
  return [...new Set(boundaryValues)].sort((left, right) => left - right);
}

function curveTableRangeFromSource(sourceText) {
  const text = String(sourceText || "");
  const sampleCountCandidates = [
    ...[...text.matchAll(/\b\w+\s*<\s*(0x[0-9a-f]+|\d+)\b/gi)].map((match) => parseIntegerLiteral(match[1])),
    ...[...text.matchAll(/\b(0x[0-9a-f]+|\d+)\s*<\s*\w+\b/gi)]
      .map((match) => parseIntegerLiteral(match[1]))
      .filter((value) => Number.isInteger(value) && value >= 2)
      .map((value) => value + 1),
    ...[...text.matchAll(/\bparam_1\s*\*\s*(\d+)(?:\.0)?\b/gi)].map((match) => parseIntegerLiteral(match[1])),
  ].filter((value) => Number.isInteger(value) && value > 1);
  const sampleCount = sampleCountCandidates.length ? Math.max(...sampleCountCandidates) : null;
  if (!Number.isInteger(sampleCount) || sampleCount <= 0 || sampleCount > 4096) return null;

  for (const output of curveOutputAssignmentsFromSource(text)) {
    const curveTableSymbol = curveTableAssignmentForOutput(text, output);
    if (!curveTableSymbol) continue;
    const curveTableSourceAddress = sourceAddressForDataSymbol(curveTableSymbol);
    if (!curveTableSourceAddress) continue;
    return {
      outputStore: curveOutputStoreName(output.target, output.componentIndex),
      curveOutputComponentIndex: output.componentIndex,
      curveTableSymbol,
      curveTableSourceAddress,
      curveTableSampleCount: sampleCount,
      curveTableMultiplier: roundFloat(output.multiplier),
      curveBoundaryValues: curveBoundaryValuesForVariable(text, output.outputVariable, output.matchIndex),
    };
  }

  return null;
}

function binaryCanUseObjdumpDisassembly(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 6 && buffer.toString("binary", 0, 4) === "\x7fELF";
}

function normalizedCallbackAddress(callbackAddress) {
  const match = String(callbackAddress || "").toLowerCase().match(/^0x([0-9a-f]+)$/);
  return match ? match[1] : "";
}

function sourcePathForCallbackAddress(sourceDir, callbackAddress) {
  const address = normalizedCallbackAddress(callbackAddress).padStart(8, "0");
  if (!sourceDir || address.length < 5) return "";
  return path.join(sourceDir, `${address.slice(0, 5)}.c`);
}

function sourceFunctionsFromText(sourceText) {
  const functions = [...String(sourceText || "").matchAll(/^[A-Za-z_][^\n]*\bFUN_([0-9a-f]{8,16})\s*\(/gim)]
    .map((match) => ({
      functionName: `FUN_${match[1].toLowerCase()}`,
      functionAddress: Number.parseInt(match[1], 16),
      markerIndex: match.index || 0,
    }))
    .filter((item) => Number.isFinite(item.functionAddress))
    .sort((left, right) => left.functionAddress - right.functionAddress || left.markerIndex - right.markerIndex);
  return functions.map((item, index) => ({
    ...item,
    nextFunctionAddress: functions[index + 1]?.functionAddress ?? Infinity,
    nextMarkerIndex: functions[index + 1]?.markerIndex ?? String(sourceText || "").length,
  }));
}

function sourceFunctionText(sourceText, sourceFunction) {
  if (!sourceFunction) return "";
  const nextSeparatorIndex = String(sourceText || "").indexOf("\n\n\n\n", sourceFunction.markerIndex + sourceFunction.functionName.length);
  const endIndex =
    nextSeparatorIndex >= 0 && nextSeparatorIndex < sourceFunction.nextMarkerIndex
      ? nextSeparatorIndex
      : sourceFunction.nextMarkerIndex;
  return String(sourceText || "").slice(sourceFunction.markerIndex, endIndex).trim();
}

function sourceFunctionContainingAddress(sourceFunctions, callbackAddressValue) {
  let low = 0;
  let high = sourceFunctions.length - 1;
  let candidate = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const item = sourceFunctions[middle];
    if (callbackAddressValue < item.functionAddress) {
      high = middle - 1;
    } else {
      candidate = item;
      low = middle + 1;
    }
  }
  if (
    !candidate ||
    callbackAddressValue < candidate.functionAddress ||
    callbackAddressValue >= candidate.nextFunctionAddress ||
    candidate.markerIndex >= candidate.nextMarkerIndex
  ) {
    return null;
  }
  return candidate;
}

function sourceRecordForPath(sourcePath, sourceCache) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  if (sourceCache?.has(sourcePath)) return sourceCache.get(sourcePath);
  const sourceText = fs.readFileSync(sourcePath, "utf8");
  const record = {
    sourceText,
    sourceFunctions: sourceFunctionsFromText(sourceText),
  };
  if (sourceCache) sourceCache.set(sourcePath, record);
  return record;
}

function functionSourceForCallbackAddress(sourceDir, callbackAddress, sourceCache = null) {
  const address = normalizedCallbackAddress(callbackAddress);
  const sourcePath = sourcePathForCallbackAddress(sourceDir, callbackAddress);
  if (!address || !sourcePath) return null;
  const sourceRecord = sourceRecordForPath(sourcePath, sourceCache);
  if (!sourceRecord) return null;
  const { sourceText, sourceFunctions } = sourceRecord;
  const callbackAddressValue = Number.parseInt(address, 16);
  const sourceFunction = sourceFunctionContainingAddress(sourceFunctions, callbackAddressValue);
  if (!sourceFunction) return null;
  const functionOffset = callbackAddressValue - sourceFunction.functionAddress;
  return {
    functionName: sourceFunction.functionName,
    functionOffset,
    sourcePath,
    sourceText: sourceFunctionText(sourceText, sourceFunction),
  };
}

function sourceInstructionSummary(sourceText) {
  return String(sourceText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        line !== "{" &&
        line !== "}" &&
        !/^FUN_/.test(line) &&
        !/^(?:undefined|ulong|void|float|uint|long)/.test(line),
    )
    .slice(0, 8)
    .join(" ");
}

function classifyCallbackSource(sourceText) {
  const text = String(sourceText || "");
  const returnsOne = /\breturn\s+1\s*;/i.test(text);
  const dependencyFlags = callbackDependencyFlagsFromSource(text);
  const result = {
    semanticClass: "computed-callback",
    returnValue: returnsOne ? 1 : null,
    outputStore: "",
    ...(dependencyFlags.length ? { dependencyFlags } : {}),
  };
  if (/\*\s*param_2\s*=\s*0\s*;[\s\S]*\*\s*\(undefined4\s*\*\)\s*\(\s*param_2\s*\+\s*1\s*\)\s*=\s*0\s*;/i.test(text)) {
    return { ...result, semanticClass: "constant-zero-vector3-store", outputStore: "zero-to-param2-12" };
  }
  if (/\*\s*param_2\s*=\s*0\s*;/i.test(text)) {
    return { ...result, semanticClass: "constant-zero-scalar-store", outputStore: "zero-to-param2-4" };
  }
  const memsetZero =
    text.match(/\b_?memset\s*\(\s*(param_[23])\s*,\s*0\s*,/i) ||
    text.match(/\b_bzero\s*\(\s*(param_[23])\s*,/i);
  if (memsetZero) {
    const target = memsetZero[1];
    const targetWritePattern = new RegExp(`(?:\\*\\s*${target}\\s*=|${target}\\s*\\[\\s*\\d+\\s*\\]\\s*=)`, "i");
    if (!targetWritePattern.test(text)) {
      const targetName = target.toLowerCase().replace("_", "");
      return { ...result, semanticClass: "constant-zero-scalar-store", outputStore: `zero-to-${targetName}-array` };
    }
  }
  const immediate = text.match(/\*\s*param_2\s*=\s*(0x[0-9a-f]{1,8})\s*;/i)?.[1]?.toLowerCase();
  if (immediate) {
    return {
      ...result,
      semanticClass: "constant-scalar-store",
      outputStore: "source-immediate-to-param2",
      immediateBits: immediate,
    };
  }
  const pattern16Store = pattern16StoreFromSource(text);
  if (pattern16Store) {
    return {
      ...result,
      semanticClass: "constant-pattern16-store",
      outputStore: "pattern16-to-param2",
      ...pattern16Store,
    };
  }
  const neonVectorValues = neonFmovVectorConstantFromSource(text);
  if (neonVectorValues) {
    return {
      ...result,
      semanticClass: "constant-vector4-load-store",
      outputStore: "source-neon-fmov-to-param2",
      vectorValues: neonVectorValues,
    };
  }
  if (/\b(?:_bzero|_memset_pattern16)\b/i.test(text)) {
    return { ...result, semanticClass: "helper-call-callback" };
  }
  const firstComponentConstant = firstComponentConstantFromSource(text);
  if (firstComponentConstant) {
    return {
      ...result,
      ...firstComponentConstant,
    };
  }
  const randomVectorRange = randomAffineVector2Range(text);
  if (randomVectorRange) {
    return {
      ...result,
      ...randomVectorRange,
    };
  }
  const randomRange = randomAffineScalarRange(text);
  if (randomRange) {
    return {
      ...result,
      outputStore: "random-affine-to-param2",
      ...randomRange,
    };
  }
  const curveRange = curveTableRangeFromSource(text);
  if (curveRange) {
    return {
      ...result,
      ...curveRange,
    };
  }
  const halfFloatUnpackOutputStore = halfFloatUnpackOutputStoreFromSource(text);
  if (halfFloatUnpackOutputStore) {
    return {
      ...result,
      ...halfFloatUnpackOutputStore,
    };
  }
  const helperDispatchOutputStore = helperDispatchOutputStoreFromSource(text);
  if (helperDispatchOutputStore) {
    return {
      ...result,
      ...helperDispatchOutputStore,
    };
  }
  const computedScalarOutputStore = computedScalarOutputStoreFromSource(text);
  if (computedScalarOutputStore) {
    return {
      ...result,
      ...computedScalarOutputStore,
    };
  }
  const param1ByteGridOutputStore = param1ByteGridOutputStoreFromSource(text);
  if (param1ByteGridOutputStore) {
    return {
      ...result,
      ...param1ByteGridOutputStore,
    };
  }
  const sideEffectOnlyCallback = sideEffectOnlyCallbackFromSource(text);
  if (sideEffectOnlyCallback) {
    return {
      ...result,
      ...sideEffectOnlyCallback,
    };
  }
  return result;
}

function elfVirtualAddressToFileOffset(buffer, virtualAddress, byteLength = 16) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 0x40) return null;
  if (buffer.toString("binary", 0, 4) !== "\x7fELF") return null;
  if (buffer[4] !== 2 || buffer[5] !== 1) return null;
  const phoff = Number(buffer.readBigUInt64LE(0x20));
  const phentsize = buffer.readUInt16LE(0x36);
  const phnum = buffer.readUInt16LE(0x38);
  if (!Number.isFinite(phoff) || phentsize < 56 || phoff < 0 || phoff >= buffer.length) return null;
  for (let index = 0; index < phnum; index += 1) {
    const offset = phoff + index * phentsize;
    if (offset + 56 > buffer.length) break;
    const type = buffer.readUInt32LE(offset);
    if (type !== 1) continue;
    const fileOffset = Number(buffer.readBigUInt64LE(offset + 8));
    const vaddr = Number(buffer.readBigUInt64LE(offset + 16));
    const filesz = Number(buffer.readBigUInt64LE(offset + 32));
    if (!Number.isFinite(fileOffset) || !Number.isFinite(vaddr) || !Number.isFinite(filesz)) continue;
    if (virtualAddress < vaddr || virtualAddress + byteLength > vaddr + filesz) continue;
    const resolved = fileOffset + (virtualAddress - vaddr);
    return resolved >= 0 && resolved + byteLength <= buffer.length ? resolved : null;
  }
  return null;
}

function machO64VirtualAddressToFileOffset(buffer, virtualAddress, byteLength = 16, sliceOffset = 0, sliceSize = buffer.length - sliceOffset) {
  const result = machO64VirtualAddressLookup(buffer, virtualAddress, byteLength, sliceOffset, sliceSize);
  return result?.status === "readable" ? result.fileOffset : null;
}

function machO64VirtualAddressLookup(buffer, virtualAddress, byteLength = 16, sliceOffset = 0, sliceSize = buffer.length - sliceOffset) {
  if (!Buffer.isBuffer(buffer) || sliceOffset < 0 || sliceOffset + 32 > buffer.length) return null;
  if (buffer.readUInt32LE(sliceOffset) !== 0xfeedfacf) return null;
  const ncmds = buffer.readUInt32LE(sliceOffset + 16);
  const sizeofcmds = buffer.readUInt32LE(sliceOffset + 20);
  const commandEnd = Math.min(sliceOffset + 32 + sizeofcmds, sliceOffset + sliceSize, buffer.length);
  const encryptedRanges = [];

  let commandOffset = sliceOffset + 32;
  for (let index = 0; index < ncmds; index += 1) {
    if (commandOffset + 8 > commandEnd) break;
    const command = buffer.readUInt32LE(commandOffset);
    const commandSize = buffer.readUInt32LE(commandOffset + 4);
    if (commandSize < 8 || commandOffset + commandSize > commandEnd) break;
    if ((command === 0x21 || command === 0x2c) && commandSize >= 20) {
      const cryptoff = buffer.readUInt32LE(commandOffset + 8);
      const cryptsize = buffer.readUInt32LE(commandOffset + 12);
      const cryptid = buffer.readUInt32LE(commandOffset + 16);
      if (cryptid !== 0 && cryptsize > 0) encryptedRanges.push([cryptoff, cryptoff + cryptsize]);
    }
    commandOffset += commandSize;
  }

  commandOffset = sliceOffset + 32;
  for (let index = 0; index < ncmds; index += 1) {
    if (commandOffset + 8 > commandEnd) break;
    const command = buffer.readUInt32LE(commandOffset);
    const commandSize = buffer.readUInt32LE(commandOffset + 4);
    if (commandSize < 8 || commandOffset + commandSize > commandEnd) break;
    if (command === 0x19 && commandSize >= 72) {
      const vmaddr = Number(buffer.readBigUInt64LE(commandOffset + 24));
      const vmsize = Number(buffer.readBigUInt64LE(commandOffset + 32));
      const fileoff = Number(buffer.readBigUInt64LE(commandOffset + 40));
      const filesize = Number(buffer.readBigUInt64LE(commandOffset + 48));
      if (
        Number.isFinite(vmaddr) &&
        Number.isFinite(vmsize) &&
        Number.isFinite(fileoff) &&
        Number.isFinite(filesize) &&
        virtualAddress >= vmaddr &&
        virtualAddress + byteLength <= vmaddr + vmsize &&
        virtualAddress + byteLength <= vmaddr + filesize
      ) {
        const sliceRelativeOffset = fileoff + (virtualAddress - vmaddr);
        const encrypted = encryptedRanges.some(([start, end]) => sliceRelativeOffset < end && sliceRelativeOffset + byteLength > start);
        if (encrypted) return { status: "encrypted-range" };
        const resolved = sliceOffset + sliceRelativeOffset;
        return resolved >= sliceOffset && resolved + byteLength <= sliceOffset + sliceSize && resolved + byteLength <= buffer.length
          ? { status: "readable", fileOffset: resolved }
          : { status: "file-offset-out-of-range" };
      }
    }
    commandOffset += commandSize;
  }
  return { status: "address-unmapped" };
}

function fatMachO64VirtualAddressToFileOffset(buffer, virtualAddress, byteLength = 16) {
  const result = fatMachO64VirtualAddressLookup(buffer, virtualAddress, byteLength);
  return result?.status === "readable" ? result.fileOffset : null;
}

function fatMachO64VirtualAddressLookup(buffer, virtualAddress, byteLength = 16) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null;
  const magic = buffer.readUInt32BE(0);
  if (magic !== 0xcafebabe && magic !== 0xcafebabf) return null;
  const archCount = buffer.readUInt32BE(4);
  const archSize = magic === 0xcafebabf ? 32 : 20;
  let bestStatus = "address-unmapped";
  for (let index = 0; index < archCount; index += 1) {
    const archOffset = 8 + index * archSize;
    if (archOffset + archSize > buffer.length) break;
    const sliceOffset = magic === 0xcafebabf ? Number(buffer.readBigUInt64BE(archOffset + 8)) : buffer.readUInt32BE(archOffset + 8);
    const sliceSize = magic === 0xcafebabf ? Number(buffer.readBigUInt64BE(archOffset + 16)) : buffer.readUInt32BE(archOffset + 12);
    if (!Number.isFinite(sliceOffset) || !Number.isFinite(sliceSize) || sliceOffset < 0 || sliceOffset + 32 > buffer.length) continue;
    const result = machO64VirtualAddressLookup(buffer, virtualAddress, byteLength, sliceOffset, sliceSize);
    if (!result) continue;
    if (result.status === "readable") return result;
    if (result.status === "encrypted-range") bestStatus = "encrypted-range";
  }
  return { status: bestStatus };
}

function binaryVirtualAddressToFileOffset(buffer, virtualAddress, byteLength = 16) {
  return (
    elfVirtualAddressToFileOffset(buffer, virtualAddress, byteLength) ??
    machO64VirtualAddressToFileOffset(buffer, virtualAddress, byteLength) ??
    fatMachO64VirtualAddressToFileOffset(buffer, virtualAddress, byteLength)
  );
}

function binaryVirtualAddressReadStatus(buffer, virtualAddress, byteLength = 16) {
  if (!Buffer.isBuffer(buffer)) return "missing-binary";
  if (!Number.isFinite(virtualAddress)) return "invalid-address";
  if (elfVirtualAddressToFileOffset(buffer, virtualAddress, byteLength) !== null) return "readable";
  const machOResult = machO64VirtualAddressLookup(buffer, virtualAddress, byteLength);
  if (machOResult) return machOResult.status;
  const fatMachOResult = fatMachO64VirtualAddressLookup(buffer, virtualAddress, byteLength);
  if (fatMachOResult) return fatMachOResult.status;
  return "unsupported-binary";
}

function virtualMemoryOverlayBytes(overlays = [], virtualAddress, byteLength) {
  if (!Number.isFinite(virtualAddress) || !Number.isFinite(byteLength) || byteLength <= 0) return null;
  for (const overlay of overlays || []) {
    const start = Number(overlay.virtualAddress);
    const bytes = overlay.bytes;
    if (!Number.isFinite(start) || !Buffer.isBuffer(bytes)) continue;
    const relativeOffset = virtualAddress - start;
    if (relativeOffset < 0 || relativeOffset + byteLength > bytes.length) continue;
    return bytes.subarray(relativeOffset, relativeOffset + byteLength);
  }
  return null;
}

function virtualMemoryBytes(binaryBuffer, overlays, virtualAddress, byteLength) {
  const overlayBytes = virtualMemoryOverlayBytes(overlays, virtualAddress, byteLength);
  if (overlayBytes) return overlayBytes;
  const fileOffset = binaryVirtualAddressToFileOffset(binaryBuffer, virtualAddress, byteLength);
  if (fileOffset === null) return null;
  return binaryBuffer.subarray(fileOffset, fileOffset + byteLength);
}

function virtualMemoryReadStatus(binaryBuffer, overlays, virtualAddress, byteLength = 16) {
  if (virtualMemoryOverlayBytes(overlays, virtualAddress, byteLength)) return "readable";
  return binaryVirtualAddressReadStatus(binaryBuffer, virtualAddress, byteLength);
}

function q0VectorConstantFromDisassembly(instructions, binaryBuffer, virtualMemoryOverlays = []) {
  if (!Buffer.isBuffer(binaryBuffer)) return null;
  const adrpRegisters = new Map();
  for (const instruction of instructions) {
    const adrp = instruction.match(/\badrp\s+(x\d+),\s*(0x[0-9a-f]+|\d+)/i);
    if (adrp) {
      const base = parseIntegerLiteral(adrp[2]);
      if (base !== null) adrpRegisters.set(adrp[1].toLowerCase(), base);
    }
    const load = instruction.match(/\bldr\s+q0,\s*\[(x\d+),\s*#(0x[0-9a-f]+|\d+)\]/i);
    if (!load) continue;
    const base = adrpRegisters.get(load[1].toLowerCase());
    const relativeOffset = parseIntegerLiteral(load[2]);
    if (!Number.isFinite(base) || !Number.isFinite(relativeOffset)) continue;
    const sourceAddress = base + relativeOffset;
    const bytes = virtualMemoryBytes(binaryBuffer, virtualMemoryOverlays, sourceAddress, 16);
    if (!bytes) continue;
    return {
      vectorSourceAddress: `0x${sourceAddress.toString(16)}`,
      vectorValues: [0, 4, 8, 12].map((offset) => roundFloat(bytes.readFloatLE(offset))),
    };
  }
  return null;
}

function d0VectorConstantFromDisassembly(instructions, binaryBuffer, virtualMemoryOverlays = []) {
  const adrpRegisters = new Map();
  const registerBits = new Map();
  for (const instruction of instructions) {
    const adrp = instruction.match(/\badrp\s+(x\d+),\s*(0x[0-9a-f]+|\d+)/i);
    if (adrp) {
      const base = parseIntegerLiteral(adrp[2]);
      if (base !== null) adrpRegisters.set(adrp[1].toLowerCase(), base);
    }

    const fmov = instruction.match(/\bfmov\s+v0\.2s,\s*#([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\b/i);
    if (fmov) {
      const value = Number(fmov[1]);
      if (Number.isFinite(value)) return { vectorValues: [roundFloat(value), roundFloat(value)] };
    }

    const movi = instruction.match(/\bmovi\s+v0\.2s,\s*#(0x[0-9a-f]+|\d+)(?:,\s*lsl\s*#(\d+))?/i);
    if (movi) {
      const immediate = parseIntegerLiteral(movi[1]);
      const shift = movi[2] === undefined ? 0 : Number(movi[2]);
      if (immediate !== null && Number.isInteger(shift) && shift >= 0 && shift <= 24) {
        const bits = (immediate << shift) >>> 0;
        const value = float32FromHexBits(`0x${bits.toString(16)}`);
        if (Number.isFinite(value)) return { vectorValues: [value, value] };
      }
    }

    const mov = instruction.match(/\b(?:mov|movz)\s+(w\d+),\s*#(0x[0-9a-f]+|\d+)/i);
    if (mov) {
      const value = parseIntegerLiteral(mov[2]);
      if (value !== null) registerBits.set(mov[1].toLowerCase(), value & 0xffff);
    }

    const movk = instruction.match(/\bmovk\s+(w\d+),\s*#(0x[0-9a-f]+|\d+),\s*lsl\s*#(\d+)/i);
    if (movk) {
      const registerName = movk[1].toLowerCase();
      const value = parseIntegerLiteral(movk[2]);
      const shift = Number(movk[3]);
      if (value !== null && Number.isInteger(shift) && shift >= 0 && shift <= 16) {
        const mask = 0xffff << shift;
        const current = registerBits.get(registerName) || 0;
        registerBits.set(registerName, (current & ~mask) | ((value & 0xffff) << shift));
      }
    }

    const dup = instruction.match(/\bdup\s+v0\.2s,\s*(w\d+)/i);
    if (dup) {
      const bits = registerBits.get(dup[1].toLowerCase());
      if (Number.isFinite(bits)) {
        const value = float32FromHexBits(`0x${(bits >>> 0).toString(16)}`);
        if (Number.isFinite(value)) return { vectorValues: [value, value] };
      }
    }

    const load = instruction.match(/\bldr\s+d0,\s*\[(x\d+),\s*#(0x[0-9a-f]+|\d+)\]/i);
    if (!load || !Buffer.isBuffer(binaryBuffer)) continue;
    const base = adrpRegisters.get(load[1].toLowerCase());
    const relativeOffset = parseIntegerLiteral(load[2]);
    if (!Number.isFinite(base) || !Number.isFinite(relativeOffset)) continue;
    const sourceAddress = base + relativeOffset;
    const bytes = virtualMemoryBytes(binaryBuffer, virtualMemoryOverlays, sourceAddress, 8);
    if (!bytes) continue;
    return {
      vectorSourceAddress: `0x${sourceAddress.toString(16)}`,
      vectorValues: [0, 4].map((offset) => roundFloat(bytes.readFloatLE(offset))),
    };
  }
  return null;
}

function pattern16FloatValuesFromAddress(binaryBuffer, sourceAddress, virtualMemoryOverlays = []) {
  if (!Buffer.isBuffer(binaryBuffer)) return null;
  const virtualAddress = parseIntegerLiteral(sourceAddress);
  if (!Number.isFinite(virtualAddress)) return null;
  const bytes = virtualMemoryBytes(binaryBuffer, virtualMemoryOverlays, virtualAddress, 16);
  if (!bytes) return null;
  const values = [0, 4, 8, 12].map((offset) => roundFloat(bytes.readFloatLE(offset)));
  return values.every(Number.isFinite) ? values : null;
}

function pattern16ReadStatusFromAddress(binaryBuffer, sourceAddress, virtualMemoryOverlays = []) {
  const virtualAddress = parseIntegerLiteral(sourceAddress);
  return virtualMemoryReadStatus(binaryBuffer, virtualMemoryOverlays, virtualAddress, 16);
}

function curveTableRangeFromAddress(binaryBuffer, sourceAddress, sampleCount, multiplier, boundaryValues = [], virtualMemoryOverlays = []) {
  if (!Buffer.isBuffer(binaryBuffer)) return null;
  const virtualAddress = parseIntegerLiteral(sourceAddress);
  if (!Number.isFinite(virtualAddress)) return null;
  if (!Number.isInteger(sampleCount) || sampleCount <= 0 || sampleCount > 4096) return null;
  if (!Number.isFinite(multiplier)) return null;
  const bytes = virtualMemoryBytes(binaryBuffer, virtualMemoryOverlays, virtualAddress, sampleCount * 4);
  if (!bytes) return null;

  const sourceValues = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const value = roundFloat(bytes.readFloatLE(index * 4));
    if (Number.isFinite(value)) sourceValues.push(value);
  }
  for (const value of boundaryValues || []) {
    const number = Number(value);
    if (Number.isFinite(number)) sourceValues.push(roundFloat(number));
  }
  if (!sourceValues.length) return null;

  const scaledValues = sourceValues.map((value) => roundFloat(value * multiplier)).filter(Number.isFinite);
  if (!scaledValues.length) return null;
  return {
    curveTableMinValue: roundFloat(Math.min(...sourceValues)),
    curveTableMaxValue: roundFloat(Math.max(...sourceValues)),
    curveMinValue: roundFloat(Math.min(...scaledValues)),
    curveMaxValue: roundFloat(Math.max(...scaledValues)),
  };
}

function curveTableReadStatusFromAddress(binaryBuffer, sourceAddress, sampleCount, virtualMemoryOverlays = []) {
  const virtualAddress = parseIntegerLiteral(sourceAddress);
  const count = Number(sampleCount);
  const byteLength = Number.isInteger(count) && count > 0 ? count * 4 : 16;
  return virtualMemoryReadStatus(binaryBuffer, virtualMemoryOverlays, virtualAddress, byteLength);
}

function classifyCallbackDisassembly(lines = [], options = {}) {
  const instructions = lines.map(instructionText).filter(Boolean);
  const text = instructions.join("\n");
  const firstImmediateMatch = text.match(/\b(?:orr|mov|movz)\s+w8,\s*(?:wzr,\s*)?#([-+]?0x[0-9a-f]+|[-+]?\d+)/i);
  const firstImmediate = firstImmediateMatch ? immediateBits32Literal(firstImmediateMatch[1]).toLowerCase() : "";
  const returnsOne = /\b(?:orr|mov|movz)\s+w0,\s*(?:wzr,\s*)?#0x?1\b/i.test(text);
  const result = {
    semanticClass: "computed-callback",
    returnValue: returnsOne ? 1 : null,
    outputStore: "",
  };

  if (/\bstr\s+xzr,\s*\[x1\]/i.test(text) && /\bstr\s+wzr,\s*\[x1,\s*#0x8\]/i.test(text)) {
    return { ...result, semanticClass: "constant-zero-vector3-store", outputStore: "zero-to-x1-12" };
  }
  if (/\bstr\s+wzr,\s*\[x1\]/i.test(text)) {
    return { ...result, semanticClass: "constant-zero-scalar-store", outputStore: "zero-to-x1-4" };
  }
  if (/\bstr\s+w8,\s*\[x1\]/i.test(text) && firstImmediate) {
    return {
      ...result,
      semanticClass: "constant-scalar-store",
      outputStore: "w8-to-x1",
      immediateBits: firstImmediate,
    };
  }
  if (/\bstr\s+q0,\s*\[x1\]/i.test(text)) {
    const vectorConstant = q0VectorConstantFromDisassembly(instructions, options.binaryBuffer, options.virtualMemoryOverlays);
    return {
      ...result,
      semanticClass: "constant-vector4-load-store",
      outputStore: "q0-to-x1",
      ...(vectorConstant || {}),
    };
  }
  if (/\bstr\s+d0,\s*\[x1\]/i.test(text)) {
    const vectorConstant = d0VectorConstantFromDisassembly(instructions, options.binaryBuffer, options.virtualMemoryOverlays);
    return {
      ...result,
      semanticClass: "constant-vector2-load-store",
      outputStore: "d0-to-x1",
      ...(vectorConstant || {}),
    };
  }
  if (/\bbl\b/i.test(text)) {
    return { ...result, semanticClass: "helper-call-callback" };
  }
  return result;
}

function parseObjdumpInstructions(output, startAddress) {
  const start = Number.parseInt(String(startAddress).replace(/^0x/i, ""), 16);
  const lines = [];
  for (const line of String(output || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([0-9a-f]+):\s+[0-9a-f]+\s+/i);
    if (!match) continue;
    const address = Number.parseInt(match[1], 16);
    if (address < start) continue;
    lines.push(line.trim());
    if (/\bret\b/i.test(line)) break;
  }
  return lines;
}

function disassembleCallback(binaryPath, callbackAddress) {
  const start = Number.parseInt(String(callbackAddress).replace(/^0x/i, ""), 16);
  const stop = start + 0x80;
  const result = spawnSync(
    "objdump",
    ["-d", `--start-address=0x${start.toString(16)}`, `--stop-address=0x${stop.toString(16)}`, binaryPath],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`objdump failed for ${callbackAddress}: ${result.stderr || result.stdout}`);
  }
  return parseObjdumpInstructions(result.stdout, callbackAddress);
}

function callbackKeyGroups(callbackTableScan = {}) {
  const groups = new Map();
  for (const table of callbackTableScan.items || []) {
    for (const entry of table.matchedEntries || []) {
      if (!entry.callback || !entry.key) continue;
      const key = String(entry.callback).toLowerCase();
      const group = groups.get(key) || { callbackAddress: key, keys: [] };
      group.keys.push(String(entry.key).toLowerCase());
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((left, right) => left.callbackAddress.localeCompare(right.callbackAddress));
}

function buildNativeParticleCallbackSemanticsManifest({
  binaryPath = defaultBinaryPath,
  sourceDir = defaultSourceDir,
  callbackTableScan = {},
  generatedAt = new Date().toISOString(),
  disassembleMissingSource = true,
  exactDisassemblyCallbackAddresses = new Set(),
  virtualMemoryOverlays = [],
} = {}) {
  const binaryBuffer = fs.existsSync(binaryPath) ? fs.readFileSync(binaryPath) : null;
  const sourceCache = new Map();
  const items = callbackKeyGroups(callbackTableScan).map((group) => {
    const sourceFunction = functionSourceForCallbackAddress(sourceDir, group.callbackAddress, sourceCache);
    const canDisassembleBinary = disassembleMissingSource && binaryCanUseObjdumpDisassembly(binaryBuffer);
    const useExactDisassemblyForContainingSource =
      canDisassembleBinary &&
      sourceFunction &&
      sourceFunction.functionOffset > 0 &&
      exactDisassemblyCallbackAddresses.has(String(group.callbackAddress).toLowerCase());
    const canDisassembleMissingSource = canDisassembleBinary && !sourceFunction;
    const lines =
      useExactDisassemblyForContainingSource || canDisassembleMissingSource
        ? disassembleCallback(binaryPath, group.callbackAddress)
        : [];
    const classification = useExactDisassemblyForContainingSource
      ? classifyCallbackDisassembly(lines, { binaryBuffer, virtualMemoryOverlays })
      : sourceFunction
        ? classifyCallbackSource(sourceFunction.sourceText)
        : canDisassembleMissingSource
          ? classifyCallbackDisassembly(lines, { binaryBuffer, virtualMemoryOverlays })
          : { semanticClass: "unresolved-callback", returnValue: null, outputStore: "" };
    const pattern16FloatValues = classification.pattern16SourceAddress
      ? pattern16FloatValuesFromAddress(binaryBuffer, classification.pattern16SourceAddress, virtualMemoryOverlays)
      : null;
    const pattern16ReadStatus = classification.pattern16SourceAddress
      ? pattern16ReadStatusFromAddress(binaryBuffer, classification.pattern16SourceAddress, virtualMemoryOverlays)
      : "";
    const curveTableRange = classification.curveTableSourceAddress
      ? curveTableRangeFromAddress(
          binaryBuffer,
          classification.curveTableSourceAddress,
          classification.curveTableSampleCount,
          classification.curveTableMultiplier,
          classification.curveBoundaryValues,
          virtualMemoryOverlays,
        )
      : null;
    const curveTableReadStatus = classification.curveTableSourceAddress
      ? curveTableReadStatusFromAddress(
          binaryBuffer,
          classification.curveTableSourceAddress,
          classification.curveTableSampleCount,
          virtualMemoryOverlays,
        )
      : "";
    return {
      callbackAddress: group.callbackAddress,
      semanticClass: classification.semanticClass,
      keyCount: group.keys.length,
      sampleKeys: group.keys.slice(0, 8),
      instructionSummary: lines.length
        ? lines.map(instructionText).slice(0, 8).join("; ")
        : sourceFunction
        ? sourceInstructionSummary(sourceFunction.sourceText)
        : "",
      ...(classification.returnValue !== null ? { returnValue: classification.returnValue } : {}),
      ...(classification.outputStore ? { outputStore: classification.outputStore } : {}),
      ...(classification.dependencyFlags?.length ? { dependencyFlags: classification.dependencyFlags } : {}),
      ...(classification.immediateBits ? { immediateBits: classification.immediateBits } : {}),
      ...(classification.vectorSourceAddress ? { vectorSourceAddress: classification.vectorSourceAddress } : {}),
      ...(classification.vectorValues ? { vectorValues: classification.vectorValues } : {}),
      ...(classification.firstComponentBits ? { firstComponentBits: classification.firstComponentBits } : {}),
      ...(Number.isFinite(classification.firstComponentValue)
        ? { firstComponentValue: classification.firstComponentValue }
        : {}),
      ...(classification.pattern16Symbol ? { pattern16Symbol: classification.pattern16Symbol } : {}),
      ...(classification.pattern16SourceAddress ? { pattern16SourceAddress: classification.pattern16SourceAddress } : {}),
      ...(pattern16FloatValues ? { pattern16FloatValues } : {}),
      ...(pattern16ReadStatus && pattern16ReadStatus !== "readable" ? { pattern16ReadStatus } : {}),
      ...(classification.curveTableSymbol ? { curveTableSymbol: classification.curveTableSymbol } : {}),
      ...(Number.isInteger(classification.curveOutputComponentIndex)
        ? { curveOutputComponentIndex: classification.curveOutputComponentIndex }
        : {}),
      ...(classification.curveTableSourceAddress ? { curveTableSourceAddress: classification.curveTableSourceAddress } : {}),
      ...(curveTableReadStatus && curveTableReadStatus !== "readable" ? { curveTableReadStatus } : {}),
      ...(Number.isFinite(classification.curveTableSampleCount)
        ? { curveTableSampleCount: classification.curveTableSampleCount }
        : {}),
      ...(Number.isFinite(classification.curveTableMultiplier)
        ? { curveTableMultiplier: classification.curveTableMultiplier }
        : {}),
      ...(classification.curveBoundaryValues?.length ? { curveBoundaryValues: classification.curveBoundaryValues } : {}),
      ...(curveTableRange || {}),
      ...(Number.isFinite(classification.randomScale) ? { randomScale: classification.randomScale } : {}),
      ...(Number.isFinite(classification.randomBase) ? { randomBase: classification.randomBase } : {}),
      ...(Number.isFinite(classification.randomMinValue) ? { randomMinValue: classification.randomMinValue } : {}),
      ...(Number.isFinite(classification.randomMaxValue) ? { randomMaxValue: classification.randomMaxValue } : {}),
      ...(classification.vectorRandomMinValues ? { vectorRandomMinValues: classification.vectorRandomMinValues } : {}),
      ...(classification.vectorRandomMaxValues ? { vectorRandomMaxValues: classification.vectorRandomMaxValues } : {}),
      ...(sourceFunction
        ? {
            semanticEvidenceSource: useExactDisassemblyForContainingSource
              ? "objdump-exact-source-containing"
              : sourceFunction.functionOffset > 0
                ? "ghidra-source-containing"
                : "ghidra-source",
            sourceFunction: sourceFunction.functionName,
            ...(sourceFunction.functionOffset > 0 ? { sourceFunctionOffset: `0x${sourceFunction.functionOffset.toString(16)}` } : {}),
            sourcePath: sourceFunction.sourcePath,
          }
        : canDisassembleMissingSource
          ? { semanticEvidenceSource: "objdump-exact" }
          : { semanticEvidenceSource: "missing-source" }),
    };
  });
  return {
    generatedAt,
    source: { binaryPath, sourceDir },
    summary: summarizeCallbackSemantics(items),
    items,
  };
}

function summarizeCallbackSemantics(items = []) {
  const bySemanticClass = {};
  for (const item of items || []) bySemanticClass[item.semanticClass || ""] = (bySemanticClass[item.semanticClass || ""] || 0) + 1;
  return {
    callbacks: items.length,
    linkedKeys: items.reduce((sum, item) => sum + Number(item.keyCount || 0), 0),
    bySemanticClass,
  };
}

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    callbackAddress: item.callbackAddress,
    semanticClass: item.semanticClass,
    semanticEvidenceSource: item.semanticEvidenceSource || "",
    keyCount: item.keyCount,
    sampleKeys: (item.sampleKeys || []).join("|"),
    instructionSummary: item.instructionSummary,
    dependencyFlags: item.dependencyFlags ? item.dependencyFlags.join("|") : "",
    randomScale: item.randomScale ?? "",
    randomBase: item.randomBase ?? "",
    randomMinValue: item.randomMinValue ?? "",
    randomMaxValue: item.randomMaxValue ?? "",
    firstComponentBits: item.firstComponentBits ?? "",
    firstComponentValue: item.firstComponentValue ?? "",
    pattern16Symbol: item.pattern16Symbol ?? "",
    pattern16SourceAddress: item.pattern16SourceAddress ?? "",
    pattern16FloatValues: item.pattern16FloatValues ? item.pattern16FloatValues.join(",") : "",
    pattern16ReadStatus: item.pattern16ReadStatus ?? "",
    curveTableSymbol: item.curveTableSymbol ?? "",
    curveOutputComponentIndex: item.curveOutputComponentIndex ?? "",
    curveTableSourceAddress: item.curveTableSourceAddress ?? "",
    curveTableReadStatus: item.curveTableReadStatus ?? "",
    curveTableSampleCount: item.curveTableSampleCount ?? "",
    curveTableMultiplier: item.curveTableMultiplier ?? "",
    curveTableMinValue: item.curveTableMinValue ?? "",
    curveTableMaxValue: item.curveTableMaxValue ?? "",
    curveMinValue: item.curveMinValue ?? "",
    curveMaxValue: item.curveMaxValue ?? "",
  }));
}

function exportNativeParticleCallbackSemantics({
  binaryPath = defaultBinaryPath,
  sourceDir = defaultSourceDir,
  callbackTableScanPath = defaultCallbackTableScanPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
  disassembleMissingSource = true,
  exactDisassemblyAddressPath = "",
  virtualMemoryOverlayPath = "",
} = {}) {
  const callbackTableScan = fs.existsSync(callbackTableScanPath)
    ? JSON.parse(fs.readFileSync(callbackTableScanPath, "utf8"))
    : { items: [] };
  const manifest = buildNativeParticleCallbackSemanticsManifest({
    binaryPath,
    sourceDir,
    callbackTableScan,
    disassembleMissingSource,
    exactDisassemblyCallbackAddresses: readAddressSet(exactDisassemblyAddressPath),
    virtualMemoryOverlays: readVirtualMemoryOverlays(virtualMemoryOverlayPath),
  });
  manifest.source = { binaryPath, sourceDir, callbackTableScanPath, exactDisassemblyAddressPath, virtualMemoryOverlayPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "callbackAddress",
    "semanticClass",
    "semanticEvidenceSource",
    "keyCount",
    "sampleKeys",
    "instructionSummary",
    "dependencyFlags",
    "randomScale",
    "randomBase",
    "randomMinValue",
    "randomMaxValue",
    "firstComponentBits",
    "firstComponentValue",
    "pattern16Symbol",
    "pattern16SourceAddress",
    "pattern16FloatValues",
    "pattern16ReadStatus",
    "curveTableSymbol",
    "curveOutputComponentIndex",
    "curveTableSourceAddress",
    "curveTableReadStatus",
    "curveTableSampleCount",
    "curveTableMultiplier",
    "curveTableMinValue",
    "curveTableMaxValue",
    "curveMinValue",
    "curveMaxValue",
  ]);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeParticleCallbackSemantics({
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    sourceDir: optionValue(args, "--source-dir", defaultSourceDir),
    callbackTableScanPath: optionValue(args, "--callback-table-scan", defaultCallbackTableScanPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    disassembleMissingSource: !hasFlag(args, "--no-disassemble-missing-source"),
    exactDisassemblyAddressPath: optionValue(args, "--exact-disassembly-addresses", ""),
    virtualMemoryOverlayPath: optionValue(args, "--virtual-memory-overlays", ""),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildNativeParticleCallbackSemanticsManifest,
  binaryCanUseObjdumpDisassembly,
  callbackKeyGroups,
  classifyCallbackDisassembly,
  classifyCallbackSource,
  exportNativeParticleCallbackSemantics,
  functionSourceForCallbackAddress,
  readVirtualMemoryOverlays,
  parseObjdumpInstructions,
  reportRowsForManifest,
  sourcePathForCallbackAddress,
  summarizeCallbackSemantics,
};
