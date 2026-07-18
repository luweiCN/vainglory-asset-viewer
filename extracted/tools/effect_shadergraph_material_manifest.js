#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

const { analyzeShadergraph } = require("./material_roles");

const defaultShadergraphCandidatePath = "extracted/reports/ios_effect_shadergraph_candidates.tsv";
const defaultPfxManifestPath = "extracted/viewer/effect-pfx-resource-manifest.json";
const defaultShaderRoot = "extracted/hero_assets/effects_shadergraphs";
const defaultDataRoot = "extracted/ios_raw/Payload/GameKindred.app/Data";
const defaultEffectPreviewTextureRoot = "extracted/effect_textures_preview";
const defaultViewerOut = "extracted/viewer/effect-shadergraph-material-manifest.json";
const defaultTsvOut = "extracted/reports/effect_shadergraph_material_manifest.tsv";
const defaultJsonOut = "extracted/reports/effect_shadergraph_material_manifest_summary.json";
const PREVIEW_TEXTURE_OPAQUE_ALPHA = 240;
const PREVIEW_TEXTURE_TRANSPARENT_ALPHA = 16;
const PREVIEW_TEXTURE_OPAQUE_COVERAGE_LIMIT = 0.65;
const PREVIEW_TEXTURE_MIN_TRANSPARENT_COVERAGE = 0.08;
const PREVIEW_TEXTURE_MIN_CARD_ALPHA_COVERAGE = 0.35;

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
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

function splitTsvLine(line) {
  return line.split("\t");
}

function readEffectShadergraphCandidates(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];

  const lines = text.split(/\r?\n/).filter(Boolean);
  const firstColumns = splitTsvLine(lines[0]);
  const hasHeader = ["status", "relativePath", "hash", "filePath"].every((column) => firstColumns.includes(column));
  const rows = [];

  if (hasHeader) {
    const columns = firstColumns;
    for (const line of lines.slice(1)) {
      const values = splitTsvLine(line);
      rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index] || ""])));
    }
    return rows;
  }

  for (const line of lines) {
    const [status, relativePath, hash, filePath = ""] = splitTsvLine(line);
    rows.push({ status, relativePath, hash, filePath });
  }
  return rows;
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function uniqNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))].sort((left, right) => left - right);
}

function uniqueInOrder(values) {
  const seen = new Set();
  const ordered = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }
  return ordered;
}

function normalizeRel(filePath) {
  return filePath.split(path.sep).join("/");
}

function effectPreviewTextureForShadergraph(relativePath, effectPreviewTextureRoot = defaultEffectPreviewTextureRoot) {
  if (!relativePath || !effectPreviewTextureRoot) return "";
  for (const extension of [".png", ".webp"]) {
    const outputPath = path.join(effectPreviewTextureRoot, relativePath.replace(/\.shadergraph$/i, extension));
    if (!fs.existsSync(outputPath)) continue;
    if (path.isAbsolute(outputPath)) return normalizeRel(outputPath);
    return normalizeRel(path.relative("extracted/viewer", outputPath));
  }
  return "";
}

function roundedCoverage(value) {
  return Math.round(value * 10000) / 10000;
}

function resolvePreviewTexturePath(filePath) {
  if (!filePath) return "";
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve("extracted/viewer", filePath);
}

function previewTextureAlphaStats(filePath) {
  if (!filePath || path.extname(filePath).toLowerCase() !== ".png") return null;
  const resolvedPath = resolvePreviewTexturePath(filePath);
  if (!fs.existsSync(resolvedPath)) return null;

  try {
    const png = PNG.sync.read(fs.readFileSync(resolvedPath));
    const total = Math.max(png.width * png.height, 1);
    let alphaSum = 0;
    let opaque = 0;
    let transparent = 0;
    for (let offset = 3; offset < png.data.length; offset += 4) {
      const alpha = png.data[offset];
      alphaSum += alpha;
      if (alpha >= PREVIEW_TEXTURE_OPAQUE_ALPHA) opaque += 1;
      if (alpha <= PREVIEW_TEXTURE_TRANSPARENT_ALPHA) transparent += 1;
    }
    return {
      previewTextureAlphaCoverage: roundedCoverage(alphaSum / (total * 255)),
      previewTextureOpaqueCoverage: roundedCoverage(opaque / total),
      previewTextureTransparentCoverage: roundedCoverage(transparent / total),
    };
  } catch {
    return null;
  }
}

function previewTextureSpriteMetadata(filePath) {
  if (!filePath) return {};
  if (path.extname(filePath).toLowerCase() === ".webp") {
    return {
      previewTextureMode: "embedded-webp",
      previewTextureSpriteUsable: false,
      previewTextureRejectReason: "embedded-webp",
    };
  }

  const stats = previewTextureAlphaStats(filePath);
  if (!stats) return {};
  const mostlyOpaque = stats.previewTextureOpaqueCoverage >= PREVIEW_TEXTURE_OPAQUE_COVERAGE_LIMIT;
  const lacksTransparentEdges =
    stats.previewTextureTransparentCoverage < PREVIEW_TEXTURE_MIN_TRANSPARENT_COVERAGE &&
    stats.previewTextureAlphaCoverage >= PREVIEW_TEXTURE_MIN_CARD_ALPHA_COVERAGE;
  const rejected = mostlyOpaque || lacksTransparentEdges;
  return {
    ...stats,
    previewTextureSpriteUsable: !rejected,
    previewTextureRejectReason: rejected ? "opaque-preview-texture" : "",
  };
}

function previewTextureRuntimeMetadata(previewTextureMetadata, roleNameList) {
  const needsAlphaMap =
    previewTextureMetadata.previewTextureMode === "embedded-webp" && roleNameList.includes("alphaMask");
  if (!needsAlphaMap) return previewTextureMetadata;
  return {
    ...previewTextureMetadata,
    previewTextureRequiresAlphaMap: true,
    previewTextureSpriteUsable: true,
    previewTextureRejectReason: "",
  };
}

function resolveShaderPath(row, shaderRoot) {
  const rootedPath = path.join(shaderRoot || "", row.relativePath || "");
  if (shaderRoot && fs.existsSync(rootedPath)) return rootedPath;
  if (row.filePath && fs.existsSync(row.filePath)) return row.filePath;
  return rootedPath;
}

function textureMetaForHash(dataRoot, hash) {
  if (!dataRoot || !hash) return null;
  const filePath = path.join(dataRoot, hash.slice(0, 2), hash);
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  const meta = { hash, filePath, size: stat.size };
  if (stat.size < 28) return meta;

  const buffer = fs.readFileSync(filePath);
  try {
    if (buffer.readUInt32LE(0) !== stat.size) return meta;
    const mipCount = buffer.readUInt32LE(4);
    const one = buffer.readUInt32LE(8);
    const format = buffer.readUInt32LE(12);
    const width = buffer.readUInt32LE(16);
    const height = buffer.readUInt32LE(20);
    const unknown = buffer.readUInt32LE(24);
    if (one !== 1 || unknown !== 0 || width <= 0 || height <= 0 || width > 4096 || height > 4096) return meta;
    return { ...meta, mipCount, format, width, height };
  } catch {
    return meta;
  }
}

function colorByte(value) {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function colorHex(rgb) {
  return `#${rgb
    .slice(0, 3)
    .map((value) => value.toString(16).padStart(2, "0").toUpperCase())
    .join("")}`;
}

function roundedColorValue(value) {
  return Math.round(value * 10000) / 10000;
}

function normalizedColor(values) {
  const rgb = values.slice(0, 3);
  if (!rgb.every((value) => Number.isFinite(value) && value >= 0 && value <= 8)) return null;
  const alpha = values[3] ?? 1;
  if (!Number.isFinite(alpha) || alpha < 0) return null;
  const maxRgb = Math.max(...rgb);
  const scale = maxRgb > 1 ? maxRgb : 1;
  const displayValues = [
    roundedColorValue(rgb[0] / scale),
    roundedColorValue(rgb[1] / scale),
    roundedColorValue(rgb[2] / scale),
    roundedColorValue(Math.min(alpha, 1)),
  ];
  const rgba255 = [
    colorByte(displayValues[0]),
    colorByte(displayValues[1]),
    colorByte(displayValues[2]),
    colorByte(displayValues[3]),
  ];
  return {
    values,
    displayValues,
    rgba255,
    hex: colorHex(rgba255),
  };
}

function extractInlineColorConstants(text, limit = 12) {
  const colors = [];
  const seen = new Set();

  function push(type, raw, values) {
    const color = normalizedColor(values);
    if (!color) return;
    const key = `${type}:${color.displayValues.map((value) => value.toFixed(4)).join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);
    colors.push({ type, raw, ...color });
  }

  const number = "(-?(?:\\d+\\.\\d+|\\d+|\\.\\d+))";
  const vec3 = new RegExp(`vec3\\s*\\(\\s*${number}\\s*,\\s*${number}\\s*,\\s*${number}\\s*\\)`, "g");
  const vec4 = new RegExp(`vec4\\s*\\(\\s*${number}\\s*,\\s*${number}\\s*,\\s*${number}\\s*,\\s*${number}\\s*\\)`, "g");

  for (const match of text.matchAll(vec3)) {
    push("vec3", match[0], [Number(match[1]), Number(match[2]), Number(match[3])]);
    if (colors.length >= limit) return colors;
  }
  for (const match of text.matchAll(vec4)) {
    push("vec4", match[0], [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])]);
    if (colors.length >= limit) return colors;
  }

  return colors;
}

function normalizeTextureChannel(channel) {
  const value = String(channel || "").toLowerCase();
  if (value === "r") return "x";
  if (value === "g") return "y";
  if (value === "b") return "z";
  if (value === "a") return "w";
  return ["x", "y", "z", "w"].includes(value) ? value : "";
}

function sampledVariablesForSampler(text, sampler) {
  const variables = new Set();
  if (!sampler) return variables;
  const name = escapeRegExp(sampler);
  const pattern = new RegExp(
    `\\b([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*texture2D\\s*\\(\\s*${name}\\s*,[^;]+?\\)\\s*;`,
    "g",
  );
  for (const match of text.matchAll(pattern)) variables.add(match[1]);
  return variables;
}

function alphaExpressionsForFragColor(text) {
  const expressions = [];
  for (const match of text.matchAll(/\bgl_FragColor\.w\s*=\s*([^;]+);/g)) expressions.push(match[1]);
  for (const match of text.matchAll(/\bgl_FragColor\s*=\s*([^;]+);/g)) {
    const expression = match[1].trim();
    const variable = /^(tmpvar_\d+|cse_\d+)$/.exec(expression);
    if (!variable) continue;
    const name = escapeRegExp(variable[1]);
    for (const assignment of text.matchAll(new RegExp(`\\b${name}\\.w\\s*=\\s*([^;]+);`, "g"))) {
      expressions.push(assignment[1]);
    }
  }
  return expressions;
}

function extractOutputAlphaSamplerChannels(text, sampler) {
  const sampledVariables = sampledVariablesForSampler(text, sampler);
  if (!sampledVariables.size) return [];
  const channels = [];
  const seen = new Set();
  for (const expression of alphaExpressionsForFragColor(text)) {
    for (const variable of sampledVariables) {
      const pattern = new RegExp(`\\b${escapeRegExp(variable)}\\.([xyzwrgba])\\b`, "g");
      for (const match of expression.matchAll(pattern)) {
        const channel = normalizeTextureChannel(match[1]);
        if (!channel || seen.has(channel)) continue;
        seen.add(channel);
        channels.push(channel);
      }
    }
  }
  return channels;
}

function directVaryingSourcesForExpression(expression) {
  return [
    /\b_Color\b/.test(expression) ? "vertexColor" : "",
    /\b_MultiTexCoord0\b/.test(expression) ? "uv0" : "",
    /\b_Vertex\b|\b_ModelViewProjectionMatrix\b/.test(expression) ? "position" : "",
  ].filter(Boolean);
}

function extractVaryingSources(text) {
  const sourcesByIdentifier = new Map();
  const assignments = [];
  const assignmentPattern = /\b(var\d+|cse_\d+)\s*=\s*([^;]+);/g;
  let match;
  while ((match = assignmentPattern.exec(text || ""))) {
    const identifier = match[1];
    const expression = match[2];
    assignments.push({ identifier, expression });
    const sources = sourcesByIdentifier.get(identifier) || new Set();
    for (const source of directVaryingSourcesForExpression(expression)) sources.add(source);
    sourcesByIdentifier.set(identifier, sources);
  }

  let changed = true;
  for (let pass = 0; changed && pass < 8; pass += 1) {
    changed = false;
    for (const assignment of assignments) {
      const targetSources = sourcesByIdentifier.get(assignment.identifier) || new Set();
      for (const reference of assignment.expression.matchAll(/\b(var\d+|cse_\d+)\b/g)) {
        for (const source of sourcesByIdentifier.get(reference[1]) || []) {
          if (targetSources.has(source)) continue;
          targetSources.add(source);
          changed = true;
        }
      }
      sourcesByIdentifier.set(assignment.identifier, targetSources);
    }
  }

  return Object.fromEntries(
    [...sourcesByIdentifier.entries()]
      .filter(([identifier, sources]) => /^var\d+$/.test(identifier) && sources.size)
      .sort((left, right) => Number(left[0].slice(3)) - Number(right[0].slice(3)))
      .map(([varying, sources]) => [varying, [...sources].sort()]),
  );
}

function varyingSourceSummary(varyingSources) {
  return Object.entries(varyingSources || {})
    .map(([varying, sources]) => `${varying}=${(sources || []).join(",")}`)
    .join("|");
}

function pfxLookupByShadergraph(pfxManifest) {
  const lookup = new Map();
  for (const item of pfxManifest?.items || []) {
    for (const reference of item.references || []) {
      if (reference.kind !== "shadergraph" || !reference.relativePath) continue;
      const rows = lookup.get(reference.relativePath) || [];
      rows.push(item);
      lookup.set(reference.relativePath, rows);
    }
  }
  return lookup;
}

function pfxSurfaceRecordsForShadergraph(pfxItems, relativePath) {
  const records = [];
  for (const pfxItem of pfxItems || []) {
    for (const record of pfxItem.surfaceRecords || []) {
      if (record?.relativePath === relativePath) records.push(record);
    }
  }
  return records;
}

function pfxRenderFamiliesForShadergraph(pfxItems, relativePath) {
  return uniq(
    pfxSurfaceRecordsForShadergraph(pfxItems, relativePath).map((record) => record?.prelude?.renderFamily || ""),
  );
}

function roleNames(roles) {
  return Object.keys(roles || {}).sort();
}

function materialStatusFor(roleNameList, textureHashes, inlineColors) {
  if (roleNameList.length) return "classified";
  if (textureHashes.length && inlineColors.length) return "tinted-texture";
  if (textureHashes.length) return "texture-only";
  if (inlineColors.length) return "color-only";
  return "unknown";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const shaderNumberPattern = "-?(?:\\d+\\.\\d+|\\d+|\\.\\d+)";

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function roundedNumber(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

function integerFromRepeat(value) {
  if (!Number.isFinite(value) || value <= 0 || value > 1) return null;
  const integer = Math.round(1 / value);
  return integer >= 2 && integer <= 32 && Math.abs(1 / value - integer) <= 0.01 ? integer : null;
}

function atlasIntegerFromRepeat(value) {
  if (!Number.isFinite(value) || value <= 0 || value > 1) return null;
  const integer = Math.round(1 / value);
  return integer >= 1 && integer <= 32 && Math.abs(1 / value - integer) <= 0.01 ? integer : null;
}

function resolveUvPhaseSource(text, source) {
  if (/^var\d+\.[xyzw]$/.test(source)) return { phaseSource: source, phaseScale: 1 };
  if (!/^tmpvar_\d+$/.test(source)) return null;
  const assignment = new RegExp(`${escapeRegExp(source)}\\s*=\\s*([^;]+);`, "s").exec(text);
  if (!assignment) return null;
  const parsed = parseScrollUvScalarExpression(assignment[1], text);
  if (!parsed?.phaseSource || Math.abs(parsed.offset || 0) > 0.00001) return null;
  return { phaseSource: parsed.phaseSource, phaseScale: roundedNumber(parsed.speed) };
}

function extractFlipbookUvAnimation(text, sampler) {
  if (!text || !sampler) return null;
  const samplerName = escapeRegExp(sampler);
  const textureMatch = new RegExp(
    `texture2D\\s*\\(\\s*${samplerName}\\s*,[\\s\\S]{0,180}?\\b(?:var\\d+|tmpvar_\\d+)\\.xy\\s*\\*\\s*vec2\\s*\\(\\s*(${shaderNumberPattern})\\s*,\\s*(${shaderNumberPattern})\\s*\\)[\\s\\S]{0,80}?\\+\\s*(tmpvar_\\d+)`,
    "s",
  ).exec(text);
  if (!textureMatch) return null;

  const repeat = [roundedNumber(textureMatch[1]), roundedNumber(textureMatch[2])];
  const frameColumns = integerFromRepeat(repeat[0]);
  const frameRows = integerFromRepeat(repeat[1]);
  if (!frameColumns || !frameRows) return null;

  const offsetVariable = textureMatch[3];
  const offsetName = escapeRegExp(offsetVariable);
  const componentPattern = (component) =>
    new RegExp(
      `${offsetName}\\.${component}\\s*=\\s*\\(?\\s*floor\\s*\\(\\s*\\(\\s*((?:var\\d+\\.[xyzw])|(?:tmpvar_\\d+))\\s*\\*\\s*(${shaderNumberPattern})\\s*\\)\\s*\\)\\s*\\*\\s*(${shaderNumberPattern})`,
      "s",
    );
  const xOffset = componentPattern("x").exec(text);
  const yOffset = componentPattern("y").exec(text);
  if (!xOffset || !yOffset) return null;
  const xPhase = resolveUvPhaseSource(text, xOffset[1]);
  const yPhase = resolveUvPhaseSource(text, yOffset[1]);
  if (!xPhase || !yPhase || xPhase.phaseSource !== yPhase.phaseSource) return null;

  const xMultiplier = roundedNumber(xOffset[2]);
  const yMultiplier = roundedNumber(yOffset[2]);
  if (Math.abs(xMultiplier - frameColumns * frameRows) > 0.01) return null;
  if (Math.abs(yMultiplier - frameRows) > 0.01) return null;

  const result = {
    mode: "flipbook",
    repeat,
    frameColumns,
    frameRows,
    frameCount: frameColumns * frameRows,
    offsetVariable,
    phaseSource: xPhase.phaseSource,
  };
  if (Math.abs(xPhase.phaseScale - 1) > 0.00001) result.phaseScale = xPhase.phaseScale;
  return result;
}

function parseFlipbookOffsetComponent(text, offsetVariable, component) {
  const assignment = new RegExp(`\\b${escapeRegExp(offsetVariable)}\\.${component}\\s*=\\s*([^;]+);`, "s").exec(text);
  if (!assignment) return null;
  const floorMatch = new RegExp(
    `\\bfloor\\s*\\(\\s*\\(?\\s*((?:var\\d+\\.[xyzw])|(?:tmpvar_\\d+))\\s*(?:\\*\\s*(${shaderNumberPattern}))?\\s*\\)?\\s*\\)\\s*(?:\\*\\s*(${shaderNumberPattern}))?`,
    "s",
  ).exec(stripOuterParens(assignment[1]));
  if (!floorMatch) return null;

  const phase = resolveUvPhaseSource(text, floorMatch[1]);
  if (!phase) return null;
  const rawMultiplier = parseShaderNumberLiteral(floorMatch[2]);
  const rawStep = parseShaderNumberLiteral(floorMatch[3]);
  return {
    phaseSource: phase.phaseSource,
    phaseScale: phase.phaseScale,
    multiplier: Number.isFinite(rawMultiplier) ? rawMultiplier : 1,
    step: Number.isFinite(rawStep) ? rawStep : 1,
  };
}

function extractComplexFlipbookUvAnimation(text, sampler) {
  if (!text || !sampler) return null;
  for (const uvExpression of samplerTextureUvExpressionsWithScaleAliases(text, sampler)) {
    const textureMatch = new RegExp(
      `\\*\\s*vec2\\s*\\(\\s*(${shaderNumberPattern})\\s*,\\s*(${shaderNumberPattern})\\s*\\)\\s*\\)+\\s*\\+\\s*(tmpvar_\\d+)`,
      "s",
    ).exec(uvExpression);
    if (!textureMatch) continue;

    const repeat = [roundedNumber(textureMatch[1]), roundedNumber(textureMatch[2])];
    const frameColumns = atlasIntegerFromRepeat(repeat[0]);
    const frameRows = atlasIntegerFromRepeat(repeat[1]);
    if (!frameColumns || !frameRows || frameColumns * frameRows < 2) continue;

    const offsetVariable = textureMatch[3];
    const xOffset = parseFlipbookOffsetComponent(text, offsetVariable, "x");
    const yOffset = parseFlipbookOffsetComponent(text, offsetVariable, "y");
    if (!xOffset || !yOffset || xOffset.phaseSource !== yOffset.phaseSource) continue;
    if (Math.abs(xOffset.phaseScale - yOffset.phaseScale) > 0.00001) continue;
    if (Math.abs(xOffset.multiplier - frameColumns * frameRows) > 0.01) continue;
    if (Math.abs(yOffset.multiplier - frameRows) > 0.01) continue;
    if (Math.abs(xOffset.step - repeat[0]) > 0.01) continue;
    if (Math.abs(yOffset.step - repeat[1]) > 0.01) continue;

    const result = {
      mode: "flipbook",
      repeat,
      frameColumns,
      frameRows,
      frameCount: frameColumns * frameRows,
      offsetVariable,
      phaseSource: xOffset.phaseSource,
    };
    if (Math.abs(xOffset.phaseScale - 1) > 0.00001) result.phaseScale = xOffset.phaseScale;
    return result;
  }
  return null;
}

function atlasOffsetTermWithSign(term, sign) {
  if (!term) return null;
  if (term.kind === "constant") return { ...term, value: roundedNumber((term.value || 0) * sign) };
  return {
    ...term,
    speed: roundedNumber((term.speed || 0) * sign),
    offset: roundedNumber((term.offset || 0) * sign),
    scale: roundedNumber((term.scale || 0) * sign),
  };
}

function normalizeAtlasOffsetTerms(terms) {
  const output = [];
  let constant = 0;
  for (const term of terms || []) {
    if (!term) continue;
    if (term.kind === "constant") {
      constant += Number(term.value) || 0;
      continue;
    }
    output.push(term);
  }
  if (Math.abs(constant) >= 0.00001) output.push({ kind: "constant", value: roundedNumber(constant) });
  return output;
}

function unambiguousAtlasOffsetTerms(candidates) {
  const parsed = candidates.filter((candidate) => Array.isArray(candidate) && candidate.length);
  if (!parsed.length) return null;
  const normalized = parsed.map(normalizeAtlasOffsetTerms);
  const keys = uniqueInOrder(normalized.map((candidate) => JSON.stringify(candidate)));
  if (keys.length !== 1) return null;
  return normalized[0];
}

function parseFloorFractAtlasFloorTerm(shaderText, value) {
  const product = splitTopLevelOperator(stripOuterParens(value), "*");
  if (!product) return null;

  const leftScale = parseShaderNumberLiteral(product[0]);
  const rightScale = parseShaderNumberLiteral(product[1]);
  const scale = Number.isFinite(leftScale) ? leftScale : rightScale;
  const floorExpression = Number.isFinite(leftScale) ? product[1] : product[0];
  if (!Number.isFinite(scale)) return null;

  const floorCall = balancedFunctionCallAtStart(floorExpression, "floor");
  if (!floorCall || floorCall.suffix) return null;

  const division = splitTopLevelOperator(stripOuterParens(floorCall.content), "/");
  if (!division) return null;

  const fractCall = balancedFunctionCallAtStart(division[0], "fract");
  if (!fractCall || fractCall.suffix) return null;

  const divisor = parseShaderNumberLiteral(division[1]);
  if (!Number.isFinite(divisor) || Math.abs(divisor) < 0.00001) return null;

  const phase = parseScrollUvScalarExpressionWithVectorAliases(fractCall.content, shaderText, new Set());
  if (!phase?.phaseSource) return null;

  return {
    kind: "floorFract",
    phaseSource: phase.phaseSource,
    speed: roundedNumber(phase.speed),
    offset: roundedNumber(phase.offset || 0),
    scale: roundedNumber(scale),
    divisor: roundedNumber(divisor),
  };
}

function parseFloorFractAtlasScalarTerms(shaderText, value, seenAliases = new Set()) {
  const text = stripOuterParens(value);
  const numeric = parseShaderNumberLiteral(text);
  if (Number.isFinite(numeric)) return [{ kind: "constant", value: numeric }];

  const floorTerm = parseFloorFractAtlasFloorTerm(shaderText, text);
  if (floorTerm) return [floorTerm];

  const fractCall = balancedFunctionCallAtStart(text, "fract");
  if (fractCall && !fractCall.suffix) {
    const phase = parseScrollUvScalarExpressionWithVectorAliases(fractCall.content, shaderText, new Set());
    if (!phase?.phaseSource) return null;
    return [
      {
        kind: "fract",
        phaseSource: phase.phaseSource,
        speed: roundedNumber(phase.speed),
        offset: roundedNumber(phase.offset || 0),
      },
    ];
  }

  const plusTerms = splitTopLevelOperator(text, "+");
  const minusTerms = plusTerms ? null : splitTopLevelOperator(text, "-");
  const terms = plusTerms || minusTerms;
  if (terms) {
    const left = parseFloorFractAtlasScalarTerms(shaderText, terms[0], seenAliases);
    const right = parseFloorFractAtlasScalarTerms(shaderText, terms[1], seenAliases);
    if (!left || !right) return null;
    const sign = minusTerms ? -1 : 1;
    return normalizeAtlasOffsetTerms([...left, ...right.map((term) => atlasOffsetTermWithSign(term, sign))]);
  }

  const component = /^(.+)\.([xyzw])$/.exec(text);
  if (component) {
    return parseFloorFractAtlasVectorComponentTerms(shaderText, component[1], component[2], seenAliases);
  }

  const aliasOnly = /^(tmpvar_\d+|cse_\d+)$/.exec(text);
  if (!aliasOnly || seenAliases.has(aliasOnly[1])) return null;

  const nextSeen = new Set(seenAliases);
  nextSeen.add(aliasOnly[1]);
  const assignmentPattern = new RegExp(`\\b${escapeRegExp(aliasOnly[1])}\\s*=\\s*([^;]+);`, "gs");
  const candidates = [];
  let assignment;
  while ((assignment = assignmentPattern.exec(shaderText))) {
    const parsed = parseFloorFractAtlasScalarTerms(shaderText, assignment[1], nextSeen);
    if (parsed) candidates.push(parsed);
  }
  return unambiguousAtlasOffsetTerms(candidates);
}

function parseFloorFractAtlasVectorComponentTerms(shaderText, expression, component, seenAliases = new Set()) {
  const text = stripOuterParens(expression);
  const componentIndex = "xyzw".indexOf(component);
  const constructorComponent = parseVectorConstructorComponentExpression(text, componentIndex);
  if (constructorComponent) return parseFloorFractAtlasScalarTerms(shaderText, constructorComponent, seenAliases);

  for (const operator of ["+", "-"]) {
    const terms = splitTopLevelOperator(text, operator);
    if (!terms) continue;
    const left = parseFloorFractAtlasVectorComponentTerms(shaderText, terms[0], component, seenAliases);
    const right = parseFloorFractAtlasVectorComponentTerms(shaderText, terms[1], component, seenAliases);
    if (!left || !right) continue;
    const sign = operator === "-" ? -1 : 1;
    return normalizeAtlasOffsetTerms([...left, ...right.map((term) => atlasOffsetTermWithSign(term, sign))]);
  }

  const aliasOnly = /^(tmpvar_\d+|cse_\d+)$/.exec(text);
  if (!aliasOnly || seenAliases.has(`${aliasOnly[1]}.${component}`)) return null;

  const nextSeen = new Set(seenAliases);
  nextSeen.add(`${aliasOnly[1]}.${component}`);
  const componentAssignmentPattern = new RegExp(
    `\\b${escapeRegExp(aliasOnly[1])}\\.${component}\\s*=\\s*([^;]+);`,
    "gs",
  );
  const candidates = [];
  let componentAssignment;
  while ((componentAssignment = componentAssignmentPattern.exec(shaderText))) {
    const parsed = parseFloorFractAtlasScalarTerms(shaderText, componentAssignment[1], nextSeen);
    if (parsed) candidates.push(parsed);
  }

  const vectorAssignmentPattern = new RegExp(`\\b${escapeRegExp(aliasOnly[1])}\\s*=\\s*([^;]+);`, "gs");
  let vectorAssignment;
  while ((vectorAssignment = vectorAssignmentPattern.exec(shaderText))) {
    const parsed = parseFloorFractAtlasVectorComponentTerms(shaderText, vectorAssignment[1], component, nextSeen);
    if (parsed) candidates.push(parsed);
  }

  return unambiguousAtlasOffsetTerms(candidates);
}

function atlasOffsetPhaseSources(terms) {
  return uniqueInOrder((terms || []).map((term) => term.phaseSource).filter(Boolean));
}

function extractFloorFractAtlasOffsetUvAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;
  for (const uvExpression of samplerTextureUvExpressionsWithDirectAliases(text, sampler)) {
    const expression = stripOuterParens(uvExpression);
    const plusTerms = splitTopLevelOperator(expression, "+");
    const minusTerms = plusTerms ? null : splitTopLevelOperator(expression, "-");
    const terms = plusTerms || minusTerms;
    if (!terms) continue;

    const leftBase = /^(var\d+)\.xy$/.exec(stripOuterParens(terms[0]));
    const rightBase = /^(var\d+)\.xy$/.exec(stripOuterParens(terms[1]));
    const baseVarying = leftBase?.[1] || rightBase?.[1] || "";
    if (!baseVarying || !varyingHasSource(varyingSources, baseVarying, "uv0")) continue;

    const offsetExpression = stripOuterParens(leftBase ? terms[1] : terms[0]);
    const sign = minusTerms && leftBase ? -1 : 1;
    const xTerms = parseFloorFractAtlasVectorComponentTerms(text, offsetExpression, "x");
    const yTerms = parseFloorFractAtlasVectorComponentTerms(text, offsetExpression, "y");
    if (!xTerms || !yTerms) continue;

    const signedXTerms = sign === 1 ? xTerms : xTerms.map((term) => atlasOffsetTermWithSign(term, sign));
    const signedYTerms = sign === 1 ? yTerms : yTerms.map((term) => atlasOffsetTermWithSign(term, sign));
    const phaseSources = uniqueInOrder([...atlasOffsetPhaseSources(signedXTerms), ...atlasOffsetPhaseSources(signedYTerms)]);
    if (phaseSources.length !== 1) continue;

    return {
      mode: "floorFractAtlasOffset",
      baseUvSource: `${baseVarying}.xy`,
      offsetVariable: offsetExpression,
      phaseSource: phaseSources[0],
      xTerms: normalizeAtlasOffsetTerms(signedXTerms),
      yTerms: normalizeAtlasOffsetTerms(signedYTerms),
    };
  }
  return null;
}

function parseViewDotScrollVector(text, vectorAlias) {
  const assignmentPattern = new RegExp(`\\b${escapeRegExp(vectorAlias)}\\s*=\\s*([^;]+);`, "gs");
  let assignment;
  while ((assignment = assignmentPattern.exec(text))) {
    const expression = stripOuterParens(assignment[1]);
    const match = new RegExp(
      `^\\(?\\s*\\(?\\s*(tmpvar_\\d+)\\s*\\*\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\)?\\.xxx\\s*\\*\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,\\s*(${shaderNumberPattern})\\s*,\\s*(${shaderNumberPattern})\\s*\\)\\s*\\)?$`,
      "s",
    ).exec(expression);
    if (!match) continue;

    const sourceAlias = match[1];
    const baseSpeed = Number(match[2]);
    const xScale = Number(match[3]);
    const yScale = Number(match[4]);
    if (!Number.isFinite(baseSpeed) || !Number.isFinite(xScale) || !Number.isFinite(yScale)) continue;

    const sourceAssignment = new RegExp(`\\b${escapeRegExp(sourceAlias)}\\.x\\s*=\\s*(unif\\d+)\\s*;`, "s").exec(text);
    if (!sourceAssignment) continue;

    return {
      speed: [roundedNumber(baseSpeed * xScale), roundedNumber(baseSpeed * yScale)],
      phaseSource: `uniform:${sourceAssignment[1]}`,
      offsetVariable: vectorAlias,
    };
  }
  return null;
}

function parseViewDotPower(text, dotAlias) {
  const assignmentPattern = new RegExp(`\\b${escapeRegExp(dotAlias)}\\s*=\\s*([^;]+);`, "gs");
  let assignment;
  while ((assignment = assignmentPattern.exec(text))) {
    const expression = stripOuterParens(assignment[1]);
    const match = new RegExp(
      `^pow\\s*\\(\\s*vec3\\s*\\(\\s*dot\\s*\\(\\s*(tmpvar_\\d+)\\s*,\\s*(tmpvar_\\d+)\\s*\\)\\s*\\)\\s*,\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,`,
      "s",
    ).exec(expression);
    if (!match) continue;

    const firstVector = match[1];
    const secondVector = match[2];
    const power = Number(match[3]);
    if (!Number.isFinite(power)) continue;

    const firstAssignment = new RegExp(`\\b${escapeRegExp(firstVector)}\\s*=\\s*normalize\\s*\\(\\s*-?\\(?\\s*var\\d+(?:\\.xyz)?\\s*\\)?\\s*\\)\\s*;`, "s").exec(text);
    const secondAssignment = new RegExp(`\\b${escapeRegExp(secondVector)}\\s*=\\s*normalize\\s*\\(\\s*-?\\(?\\s*var\\d+(?:\\.xyz)?\\s*\\)?\\s*\\)\\s*;`, "s").exec(text);
    if (!firstAssignment || !secondAssignment) continue;

    return { power: roundedNumber(power), dotAlias };
  }
  return null;
}

function extractViewDotScrollOffsetUvAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;
  for (const uvExpression of samplerTextureUvExpressionsWithDirectAliases(text, sampler)) {
    const expression = stripOuterParens(uvExpression);
    const terms = splitTopLevelOperator(expression, "+");
    if (!terms) continue;

    const leftBase = /^(var\d+)\.xy$/.exec(stripOuterParens(terms[0]));
    const rightBase = /^(var\d+)\.xy$/.exec(stripOuterParens(terms[1]));
    const baseVarying = leftBase?.[1] || rightBase?.[1] || "";
    if (!baseVarying || !varyingHasSource(varyingSources, baseVarying, "uv0")) continue;

    const offsetAlias = /^(tmpvar_\d+)$/.exec(stripOuterParens(leftBase ? terms[1] : terms[0]))?.[1] || "";
    if (!offsetAlias) continue;

    const xAssignment = new RegExp(`\\b${escapeRegExp(offsetAlias)}\\.x\\s*=\\s*([^;]+);`, "s").exec(text);
    const yAssignment = new RegExp(`\\b${escapeRegExp(offsetAlias)}\\.y\\s*=\\s*([^;]+);`, "s").exec(text);
    const xMatch = /^(.+)\.x$/.exec(stripOuterParens(xAssignment?.[1] || ""));
    const yMatch = /^(.+)\.y$/.exec(stripOuterParens(yAssignment?.[1] || ""));
    if (!xMatch || !yMatch || stripOuterParens(xMatch[1]) !== stripOuterParens(yMatch[1])) continue;

    const sum = splitTopLevelOperator(stripOuterParens(xMatch[1]), "+");
    if (!sum) continue;

    const firstAlias = /^(tmpvar_\d+)$/.exec(stripOuterParens(sum[0]))?.[1] || "";
    const secondAlias = /^(tmpvar_\d+)$/.exec(stripOuterParens(sum[1]))?.[1] || "";
    if (!firstAlias || !secondAlias) continue;

    const firstDot = parseViewDotPower(text, firstAlias);
    const secondDot = parseViewDotPower(text, secondAlias);
    const dot = firstDot || secondDot;
    const scroll = parseViewDotScrollVector(text, firstDot ? secondAlias : firstAlias);
    if (!dot || !scroll) continue;

    return {
      mode: "viewDotScrollOffset",
      baseUvSource: `${baseVarying}.xy`,
      offsetVariable: offsetAlias,
      phaseSource: scroll.phaseSource,
      speed: scroll.speed,
      dotPower: dot.power,
      dotScale: [1, 1],
    };
  }
  return null;
}

function uv0RepeatForVarying(shaderText, varying, seenAliases = new Set()) {
  const identifier = String(varying || "").replace(/\..*$/, "");
  if (!/^(?:var\d+|cse_\d+)$/.test(identifier) || seenAliases.has(identifier)) return null;
  const nextSeen = new Set(seenAliases);
  nextSeen.add(identifier);
  const assignmentPattern = new RegExp(`\\b${escapeRegExp(identifier)}\\s*=\\s*([^;]+);`, "gs");
  let assignment;
  while ((assignment = assignmentPattern.exec(shaderText))) {
    const expression = stripOuterParens(assignment[1]);
    const product = splitTopLevelOperator(expression, "*");
    if (product) {
      const leftUv = stripOuterParens(product[0]) === "_MultiTexCoord0";
      const rightUv = stripOuterParens(product[1]) === "_MultiTexCoord0";
      const vectorExpression = leftUv ? product[1] : rightUv ? product[0] : "";
      const vec4 = /^vec4\s*\(([\s\S]+)\)$/.exec(stripOuterParens(vectorExpression));
      if (vec4) {
        const parts = splitTopLevelCommaList(vec4[1]);
        const x = parseShaderNumberLiteral(parts[0]);
        const y = parseShaderNumberLiteral(parts[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
      }
    }
    const alias = /^(var\d+|cse_\d+)$/.exec(expression);
    if (alias) {
      const repeat = uv0RepeatForVarying(shaderText, alias[1], nextSeen);
      if (repeat) return repeat;
    }
  }
  return null;
}

function parsedRuntimeScrollSample(shaderText, sample, varyingSources = {}) {
  const parsed = parseDirectScrollUvExpression(shaderText, sample.uvExpression, varyingSources, { allowVectorAliases: true });
  if (!parsed) return null;
  const baseVarying = /^var\d+/.exec(parsed.baseUvSource || "")?.[0] || "";
  const repeat = uv0RepeatForVarying(shaderText, baseVarying) || [1, 1];
  return {
    sampler: sample.sampler,
    channel: multiScrollSampleChannelForSuffix(sample.suffix),
    baseUvSource: parsed.baseUvSource,
    repeat,
    speed: parsed.speed,
    offset: parsed.offset,
    phaseSource: parsed.phaseSource,
  };
}

function extractDualScrollFresnelMaskUvAnimation(text, roles, samplerToHash = {}, varyingSources = {}) {
  if (!roles?.uvAnimation?.hash) return null;
  if (!/\bdot\s*\(\s*normalize\s*\(\s*-\s*\(\s*var\d+\.xyz\s*\)\s*\)/.test(text)) return null;
  const samples = samplerTextureUvExpressionItems(text).filter((sample) => {
    return sample.suffix === "x" && samplerToHash[sample.sampler] === roles.uvAnimation.hash;
  });
  if (samples.length !== 2) return null;

  const parsedSamples = samples.map((sample) => parsedRuntimeScrollSample(text, sample, varyingSources));
  if (parsedSamples.some((sample) => !sample)) return null;
  const phaseSources = uniqueInOrder(parsedSamples.map((sample) => sample.phaseSource).filter(Boolean));
  if (!phaseSources.length || !multiScrollPhaseSourcesAreCompatible(text, phaseSources)) return null;
  if (!parsedSamples.every((sample) => /^var\d+\.xy$/.test(sample.baseUvSource || ""))) return null;

  return {
    mode: "dualScrollFresnelMask",
    textureHash: roles.uvAnimation.hash,
    samples: parsedSamples.map((sample) => ({
      repeat: sample.repeat,
      speed: sample.speed,
      offset: sample.offset,
      baseUvSource: sample.baseUvSource,
      sampler: sample.sampler,
      channel: sample.channel,
    })),
    fresnelDivisor: 0.7,
    phaseSource: phaseSources.join("|"),
    ...(phaseSources.length > 1 ? { phaseSources } : {}),
  };
}

function extractWaterWallCompositeUvAnimation(text, roles) {
  const hasWaterWallShape =
    /\bvarying\s+vec4\s+var4\s*;/.test(text) &&
    /\bvar4\s*=\s*_Color\s*;/.test(text) &&
    /\btexture2D\s*\(\s*sampler182\s*,\s*var5\.xy\s*\)/.test(text) &&
    /\btexture2D\s*\(\s*sampler280\s*,\s*\(\s*var6\.xy\s*\+/.test(text) &&
    /\btmpvar_24\s*=\s*clamp\s*\([\s\S]{0,140}\btmpvar_21\s*-\s*tmpvar_22[\s\S]{0,80}\/\s*0\.05/.test(text) &&
    /\btmpvar_38\.w\s*=\s*\(1\.0\s*-\s*\(vec3\s*\(1\.0,\s*1\.0,\s*1\.0\)\s*-\s*tmpvar_26\)\.x\)/.test(text);
  if (!hasWaterWallShape || !roles?.baseColor?.hash || !roles?.alphaMask?.hash) return null;

  return {
    mode: "waterWallComposite",
    baseTextureHash: roles.baseColor.hash,
    maskTextureHash: roles.alphaMask.hash,
    phaseSource: "uniform:unif65",
    requiresVertexColorAlpha: true,
  };
}

function parseScrollUvComponent(text, offsetVariable, component) {
  const offsetName = escapeRegExp(offsetVariable);
  const prefix = `${offsetName}\\.${component}\\s*=\\s*\\(?\\s*`;
  const assignment = new RegExp(`${offsetName}\\.${component}\\s*=\\s*([^;]+);`, "s").exec(text);
  if (assignment) {
    const parsed = parseScrollUvScalarExpression(assignment[1], text);
    if (parsed) return parsed;
  }

  const numeric = new RegExp(`${prefix}(${shaderNumberPattern})\\s*\\)?`, "s").exec(text);
  if (numeric) return { offset: roundedNumber(numeric[1]), speed: 0, phaseSource: "" };

  const varTimesScalar = new RegExp(`${prefix}(var\\d+\\.[xyzw])(?:\\s*\\*\\s*(${shaderNumberPattern}))?\\s*\\)?`, "s").exec(text);
  if (varTimesScalar) {
    return {
      offset: 0,
      speed: roundedNumber(varTimesScalar[2] ?? 1),
      phaseSource: varTimesScalar[1],
    };
  }

  const scalarTimesVar = new RegExp(`${prefix}(${shaderNumberPattern})\\s*\\*\\s*(var\\d+\\.[xyzw])\\s*\\)?`, "s").exec(text);
  if (scalarTimesVar) {
    return {
      offset: 0,
      speed: roundedNumber(scalarTimesVar[1]),
      phaseSource: scalarTimesVar[2],
    };
  }

  return null;
}

function stripOuterParens(value) {
  let text = String(value || "").trim();
  while (text.startsWith("(") && text.endsWith(")")) {
    let depth = 0;
    let wraps = true;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (depth === 0 && index < text.length - 1) {
        wraps = false;
        break;
      }
      if (depth < 0) {
        wraps = false;
        break;
      }
    }
    if (!wraps) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

function splitTopLevelCommaList(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

function parseLinearPhaseScalarExpression(text) {
  const matches = [];
  const phaseComponentPattern = "var\\d+\\.[xyzw](?![xyzw])";
  const parseOffsetLinear = (pattern, phaseSourceIndex, offsetSignIndex, offsetIndex, scalarIndex, sourceSign = 1) => {
    const match = pattern.exec(text);
    if (!match) return null;
    const scalar = Number(match[scalarIndex]);
    const offsetSign = match[offsetSignIndex] === "-" ? -1 : 1;
    const offset = Number(match[offsetIndex]) * offsetSign;
    return {
      offset: roundedNumber(offset * scalar),
      speed: roundedNumber(sourceSign * scalar),
      phaseSource: match[phaseSourceIndex],
    };
  };
  const offsetVariableTimesScalar = parseOffsetLinear(
    new RegExp(`^\\(?\\s*(${phaseComponentPattern})\\s*([+\\-])\\s*(${shaderNumberPattern})\\s*\\)?\\s*\\*\\s*(${shaderNumberPattern})$`),
    1,
    2,
    3,
    4,
  );
  if (offsetVariableTimesScalar) return offsetVariableTimesScalar;
  const scalarTimesOffsetVariable = parseOffsetLinear(
    new RegExp(`^(${shaderNumberPattern})\\s*\\*\\s*\\(?\\s*(${phaseComponentPattern})\\s*([+\\-])\\s*(${shaderNumberPattern})\\s*\\)?$`),
    2,
    3,
    4,
    1,
  );
  if (scalarTimesOffsetVariable) return scalarTimesOffsetVariable;
  const offsetPlusVariableTimesScalar = parseOffsetLinear(
    new RegExp(`^\\(?\\s*(${shaderNumberPattern})\\s*\\+\\s*(${phaseComponentPattern})\\s*\\)?\\s*\\*\\s*(${shaderNumberPattern})$`),
    2,
    1,
    1,
    3,
  );
  if (offsetPlusVariableTimesScalar) return offsetPlusVariableTimesScalar;
  const offsetMinusVariableTimesScalar = parseOffsetLinear(
    new RegExp(`^\\(?\\s*(${shaderNumberPattern})\\s*-\\s*(${phaseComponentPattern})\\s*\\)?\\s*\\*\\s*(${shaderNumberPattern})$`),
    2,
    1,
    1,
    3,
    -1,
  );
  if (offsetMinusVariableTimesScalar) return offsetMinusVariableTimesScalar;

  const parseMatches = (pattern, phaseSourceIndex, scalarIndex) => {
    let match;
    while ((match = pattern.exec(text))) {
      const sign = match[1] === "-" ? -1 : 1;
      matches.push({
        phaseSource: match[phaseSourceIndex],
        speed: roundedNumber(sign * Number(match[scalarIndex])),
      });
    }
  };
  parseMatches(new RegExp(`([+\\-]?)\\s*\\(?\\s*(${phaseComponentPattern})\\s*\\*\\s*(${shaderNumberPattern})\\s*\\)?`, "g"), 2, 3);
  parseMatches(new RegExp(`([+\\-]?)\\s*\\(?\\s*(${shaderNumberPattern})\\s*\\*\\s*(${phaseComponentPattern})\\s*\\)?`, "g"), 3, 2);
  if (!matches.length) {
    if (/[*/]|\btexture2D\s*\(|\bvec[234]\s*\(|\b(?:sin|cos|floor)\s*\(/.test(text)) return null;
    let match;
    const variableTerm = new RegExp(`([+\\-]?)\\s*\\(?\\s*(${phaseComponentPattern})\\s*\\)?`, "g");
    while ((match = variableTerm.exec(text))) {
      const sign = match[1] === "-" ? -1 : 1;
      matches.push({ phaseSource: match[2], speed: sign });
    }
  }
  if (!matches.length) return null;

  const phaseSource = matches[0].phaseSource;
  if (matches.some((match) => match.phaseSource !== phaseSource)) return null;
  const speed = roundedNumber(matches.reduce((sum, match) => sum + match.speed, 0));
  if (Math.abs(speed) < 0.00001) return null;
  return { offset: 0, speed, phaseSource };
}

function parseMultiPhaseLinearScalarExpression(value, shaderText = "", seenAliases = new Set()) {
  const text = stripOuterParens(value);
  const numberOnly = new RegExp(`^(${shaderNumberPattern})$`).exec(text);
  if (numberOnly) return { offset: roundedNumber(numberOnly[1]), terms: [] };

  const variableOnly = /^(var\d+\.[xyzw])$/.exec(text);
  if (variableOnly) return { offset: 0, terms: [{ source: variableOnly[1], scale: 1 }] };

  const negativeVariableOnly = /^-\s*\(?\s*(var\d+\.[xyzw])\s*\)?$/.exec(text);
  if (negativeVariableOnly) return { offset: 0, terms: [{ source: negativeVariableOnly[1], scale: -1 }] };

  const aliasOnly = /^(tmpvar_\d+|cse_\d+)$/.exec(text);
  if (aliasOnly && !seenAliases.has(aliasOnly[1])) {
    const assignment = new RegExp(`\\b${escapeRegExp(aliasOnly[1])}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (!assignment) return null;
    return parseMultiPhaseLinearScalarExpression(assignment[1], shaderText, new Set([...seenAliases, aliasOnly[1]]));
  }

  const scaleLinear = (linear, scale) => ({
    offset: roundedNumber((linear.offset || 0) * scale),
    terms: (linear.terms || []).map((term) => ({ source: term.source, scale: roundedNumber(term.scale * scale) })),
  });
  const mergeLinear = (left, right, rightSign = 1) => {
    const terms = [];
    const bySource = new Map();
    for (const term of [...(left.terms || []), ...(right.terms || []).map((item) => ({ ...item, scale: item.scale * rightSign }))]) {
      const previous = bySource.get(term.source);
      if (previous) previous.scale = roundedNumber(previous.scale + term.scale);
      else {
        const next = { source: term.source, scale: roundedNumber(term.scale) };
        terms.push(next);
        bySource.set(term.source, next);
      }
    }
    return {
      offset: roundedNumber((left.offset || 0) + rightSign * (right.offset || 0)),
      terms: terms.filter((term) => Math.abs(term.scale) >= 0.00001),
    };
  };

  const sum = splitTopLevelOperator(text, "+");
  if (sum) {
    const left = parseMultiPhaseLinearScalarExpression(sum[0], shaderText, seenAliases);
    const right = parseMultiPhaseLinearScalarExpression(sum[1], shaderText, seenAliases);
    return left && right ? mergeLinear(left, right) : null;
  }

  const product = splitTopLevelOperator(text, "*");
  if (product) {
    const leftNumber = parseShaderNumberLiteral(product[0]);
    const rightNumber = parseShaderNumberLiteral(product[1]);
    if (Number.isFinite(leftNumber)) {
      const right = parseMultiPhaseLinearScalarExpression(product[1], shaderText, seenAliases);
      return right ? scaleLinear(right, leftNumber) : null;
    }
    if (Number.isFinite(rightNumber)) {
      const left = parseMultiPhaseLinearScalarExpression(product[0], shaderText, seenAliases);
      return left ? scaleLinear(left, rightNumber) : null;
    }
  }

  const difference = splitTopLevelOperator(text, "-");
  if (difference) {
    const left = parseMultiPhaseLinearScalarExpression(difference[0], shaderText, seenAliases);
    const right = parseMultiPhaseLinearScalarExpression(difference[1], shaderText, seenAliases);
    return left && right ? mergeLinear(left, right, -1) : null;
  }

  return null;
}

function parseMultiPhaseLinearVectorExpression(shaderText, value) {
  const text = stripOuterParens(value);
  const vec2Match = /^vec2\s*\(([\s\S]+)\)$/.exec(text);
  if (vec2Match) {
    const parts = splitTopLevelCommaList(vec2Match[1]);
    if (parts.length !== 1 && parts.length !== 2) return null;
    const x = parseMultiPhaseLinearScalarExpression(parts[0], shaderText);
    const y = parseMultiPhaseLinearScalarExpression(parts.length === 1 ? parts[0] : parts[1], shaderText);
    return x && y ? [x, y] : null;
  }

  const alias = /^(tmpvar_\d+|cse_\d+)$/.exec(text);
  if (!alias) return null;
  const name = escapeRegExp(alias[1]);
  const xAssignment = new RegExp(`\\b${name}\\.x\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  const yAssignment = new RegExp(`\\b${name}\\.y\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!xAssignment || !yAssignment) return null;
  const x = parseMultiPhaseLinearScalarExpression(xAssignment[1], shaderText);
  const y = parseMultiPhaseLinearScalarExpression(yAssignment[1], shaderText);
  return x && y ? [x, y] : null;
}

function poweredPhaseFromLinear(linear, power = 1) {
  if (!linear?.terms || linear.terms.length !== 1) return null;
  const term = linear.terms[0];
  return {
    phaseSource: term.source,
    phaseInputOffset: roundedNumber(linear.offset || 0),
    phaseInputScale: roundedNumber(term.scale),
    phasePower: power,
  };
}

function samePoweredPhase(left, right) {
  return (
    left &&
    right &&
    left.phaseSource === right.phaseSource &&
    left.phaseInputOffset === right.phaseInputOffset &&
    left.phaseInputScale === right.phaseInputScale &&
    left.phasePower === right.phasePower
  );
}

function parsePoweredPhaseScalarExpression(value, shaderText = "", seenAliases = new Set()) {
  const text = stripOuterParens(value);
  const aliasOnly = /^(tmpvar_\d+|cse_\d+)$/.exec(text);
  if (aliasOnly && !seenAliases.has(aliasOnly[1])) {
    const nextSeen = new Set([...seenAliases, aliasOnly[1]]);
    const pattern = new RegExp(`\\b${escapeRegExp(aliasOnly[1])}\\s*=\\s*([^;]+);`, "g");
    let match;
    while ((match = pattern.exec(shaderText))) {
      const parsed = parsePoweredPhaseScalarExpression(match[1], shaderText, nextSeen);
      if (parsed) return parsed;
    }
    return null;
  }

  const product = splitTopLevelOperator(text, "*");
  if (product) {
    const left = parseMultiPhaseLinearScalarExpression(product[0], shaderText);
    const right = parseMultiPhaseLinearScalarExpression(product[1], shaderText);
    if (
      left?.terms?.length === 1 &&
      right?.terms?.length === 1 &&
      left.terms[0].source === right.terms[0].source &&
      roundedNumber(left.offset || 0) === roundedNumber(right.offset || 0) &&
      roundedNumber(left.terms[0].scale) === roundedNumber(right.terms[0].scale)
    ) {
      return poweredPhaseFromLinear(left, 2);
    }
  }

  return poweredPhaseFromLinear(parseMultiPhaseLinearScalarExpression(text, shaderText), 1);
}

function rotatePhaseFromLinearTerms(linear) {
  if (!linear?.terms?.length) return null;
  const terms = linear.terms.map((term) => ({ source: term.source, scale: roundedNumber(term.scale) }));
  const phaseSources = terms.map((term) => term.source);
  const speed = roundedNumber(terms.reduce((sum, term) => sum + term.scale, 0));
  if (Math.abs(speed) < 0.00001) return null;
  if (terms.length === 1) {
    return {
      offset: roundedNumber(linear.offset || 0),
      speed,
      phaseSource: terms[0].source,
    };
  }
  return {
    offset: roundedNumber(linear.offset || 0),
    speed,
    phaseSource: phaseSources.join("|"),
    phaseSources,
    rotationPhaseTerms: terms,
  };
}

function unambiguousParsedScrollCandidate(candidates) {
  const parsed = candidates.filter(Boolean);
  if (!parsed.length) return null;
  const keys = uniqueInOrder(parsed.map((candidate) => JSON.stringify(candidate)));
  if (keys.length !== 1) return null;
  return parsed[0];
}

function resolveScalarAliasExpression(shaderText, identifier, seenAliases) {
  if (!shaderText || !identifier || seenAliases.has(identifier)) return null;
  const nextSeenAliases = new Set(seenAliases);
  nextSeenAliases.add(identifier);
  const assignmentPattern = new RegExp(`\\b${escapeRegExp(identifier)}\\s*=\\s*([^;]+);`, "gs");
  const candidates = [];
  let assignment;
  while ((assignment = assignmentPattern.exec(shaderText))) {
    candidates.push(parseScrollUvScalarExpressionWithVectorAliases(assignment[1], shaderText, nextSeenAliases));
  }
  return unambiguousParsedScrollCandidate(candidates);
}

function parseVecComponentScrollUvScalarExpression(text, shaderText, seenAliases) {
  const directComponent = /^(tmpvar_\d+|cse_\d+)\.([xyzw])$/.exec(text);
  if (directComponent && !seenAliases.has(`${directComponent[1]}.${directComponent[2]}`)) {
    const nextSeenAliases = new Set(seenAliases);
    nextSeenAliases.add(`${directComponent[1]}.${directComponent[2]}`);
    const assignmentPattern = new RegExp(
      `\\b${escapeRegExp(directComponent[1])}\\.${directComponent[2]}\\s*=\\s*([^;]+);`,
      "gs",
    );
    const candidates = [];
    let assignment;
    while ((assignment = assignmentPattern.exec(shaderText))) {
      candidates.push(parseScrollUvScalarExpressionWithVectorAliases(assignment[1], shaderText, nextSeenAliases));
    }
    const resolved = unambiguousParsedScrollCandidate(candidates);
    if (resolved) return resolved;
  }

  const productComponent = parseVectorProductComponentScrollUvScalarExpression(text, shaderText, seenAliases);
  if (productComponent) return productComponent;

  const componentAfterBinary = /^(.+)\.([xyzw])$/.exec(text);
  if (!componentAfterBinary) return null;

  const componentExpression = stripOuterParens(componentAfterBinary[1]);
  const component = componentAfterBinary[2];
  for (const operator of ["+", "-"]) {
    const terms = splitTopLevelOperator(componentExpression, operator);
    if (!terms) continue;
    const leftComponent = parseVectorComponentScrollExpression(terms[0], component, shaderText, seenAliases);
    const rightComponent = parseVectorComponentScrollExpression(terms[1], component, shaderText, seenAliases);
    if (!leftComponent || !rightComponent) continue;
    const sign = operator === "-" ? -1 : 1;
    const phaseSources = [leftComponent.phaseSource, rightComponent.phaseSource].filter(Boolean);
    const phaseSource = phaseSources[0] || "";
    if (phaseSources.some((source) => source !== phaseSource)) continue;
    return {
      offset: roundedNumber((leftComponent.offset || 0) + sign * (rightComponent.offset || 0)),
      speed: roundedNumber((leftComponent.speed || 0) + sign * (rightComponent.speed || 0)),
      phaseSource,
    };
  }

  return null;
}

function parseVectorConstructorComponentExpression(expression, componentIndex) {
  const constructor = /^vec([234])\s*\(([\s\S]+)\)$/.exec(stripOuterParens(expression));
  if (!constructor) return null;
  const componentCount = Number(constructor[1]);
  if (componentIndex < 0 || componentIndex >= componentCount) return null;
  const parts = splitTopLevelCommaList(constructor[2]);
  if (parts.length !== 1 && parts.length !== componentCount) return null;
  return parts.length === 1 ? parts[0] : parts[componentIndex];
}

function parseVectorComponentScrollExpression(expression, component, shaderText, seenAliases) {
  const text = stripOuterParens(expression);
  const constructorComponent = parseVectorConstructorComponentExpression(text, "xyzw".indexOf(component));
  if (constructorComponent) return parseScrollUvScalarExpression(constructorComponent, shaderText, seenAliases);

  const productComponent = parseVectorProductComponentScrollUvScalarExpression(`${text}.${component}`, shaderText, seenAliases);
  if (productComponent) return productComponent;

  if (/^(tmpvar_\d+|cse_\d+|var\d+)$/.test(text)) {
    return parseScrollUvScalarExpression(`${text}.${component}`, shaderText, seenAliases);
  }

  return parseScrollUvScalarExpression(text, shaderText, seenAliases);
}

function parseVectorComponentNumber(expression, componentIndex) {
  const componentExpression = parseVectorConstructorComponentExpression(expression, componentIndex);
  if (!componentExpression) return null;
  return parseShaderNumberLiteral(componentExpression);
}

function parseVectorProductComponentScrollUvScalarExpression(value, shaderText, seenAliases) {
  const componentMatch = /^(.+)\.([xyzw])$/.exec(stripOuterParens(value));
  if (!componentMatch) return null;
  const product = splitTopLevelOperator(stripOuterParens(componentMatch[1]), "*");
  if (!product) return null;

  const component = componentMatch[2];
  const componentIndex = "xyzw".indexOf(component);
  const leftNumber = parseVectorComponentNumber(product[0], componentIndex);
  const rightNumber = parseVectorComponentNumber(product[1], componentIndex);
  const leftScroll = Number.isFinite(leftNumber)
    ? null
    : parseVectorComponentScrollExpression(product[0], component, shaderText, seenAliases);
  const rightScroll = Number.isFinite(rightNumber)
    ? null
    : parseVectorComponentScrollExpression(product[1], component, shaderText, seenAliases);

  if (leftScroll && Number.isFinite(rightNumber)) {
    return {
      offset: roundedNumber((leftScroll.offset || 0) * rightNumber),
      speed: roundedNumber((leftScroll.speed || 0) * rightNumber),
      phaseSource: leftScroll.phaseSource,
    };
  }
  if (rightScroll && Number.isFinite(leftNumber)) {
    return {
      offset: roundedNumber((rightScroll.offset || 0) * leftNumber),
      speed: roundedNumber((rightScroll.speed || 0) * leftNumber),
      phaseSource: rightScroll.phaseSource,
    };
  }
  return null;
}

function parseScrollUvScalarExpression(value, shaderText = "", seenAliases = new Set()) {
  const text = stripOuterParens(value);
  const numberOnly = new RegExp(`^(${shaderNumberPattern})$`).exec(text);
  if (numberOnly) return { offset: roundedNumber(numberOnly[1]), speed: 0, phaseSource: "" };

  const fractCall = balancedFunctionCallAtStart(text, "fract");
  if (fractCall && !fractCall.suffix) {
    const parsed = parseScrollUvScalarExpression(fractCall.content, shaderText, seenAliases);
    return parsed?.phaseSource ? { ...parsed, wraps: true } : null;
  }

  const uniformOnly = /^(unif\d+)$/.exec(text);
  if (uniformOnly) return { offset: 0, speed: 1, phaseSource: `uniform:${uniformOnly[1]}` };

  const negativeUniformOnly = /^-\s*\(?\s*(unif\d+)\s*\)?$/.exec(text);
  if (negativeUniformOnly) return { offset: 0, speed: -1, phaseSource: `uniform:${negativeUniformOnly[1]}` };

  const uniformTimesScalar = new RegExp(`^(unif\\d+)\\s*\\*\\s*(${shaderNumberPattern})$`).exec(text);
  if (uniformTimesScalar) {
    return {
      offset: 0,
      speed: roundedNumber(uniformTimesScalar[2]),
      phaseSource: `uniform:${uniformTimesScalar[1]}`,
    };
  }

  const scalarTimesUniform = new RegExp(`^(${shaderNumberPattern})\\s*\\*\\s*(unif\\d+)$`).exec(text);
  if (scalarTimesUniform) {
    return {
      offset: 0,
      speed: roundedNumber(scalarTimesUniform[1]),
      phaseSource: `uniform:${scalarTimesUniform[2]}`,
    };
  }

  const aliasOnly = /^(tmpvar_\d+|cse_\d+)$/.exec(text);
  if (aliasOnly) return resolveScalarAliasExpression(shaderText, aliasOnly[1], seenAliases);

  const negativeAliasOnly = /^-\s*\(?\s*(tmpvar_\d+|cse_\d+)\s*\)?$/.exec(text);
  if (negativeAliasOnly) {
    const resolved = resolveScalarAliasExpression(shaderText, negativeAliasOnly[1], seenAliases);
    if (!resolved) return null;
    return {
      offset: roundedNumber(-resolved.offset),
      speed: roundedNumber(-resolved.speed),
      phaseSource: resolved.phaseSource,
    };
  }

  const variableOnly = /^(var\d+\.[xyzw])$/.exec(text);
  if (variableOnly) return { offset: 0, speed: 1, phaseSource: variableOnly[1] };

  const negativeVariableOnly = /^-\s*\(?\s*(var\d+\.[xyzw])\s*\)?$/.exec(text);
  if (negativeVariableOnly) return { offset: 0, speed: -1, phaseSource: negativeVariableOnly[1] };

  const varTimesScalar = new RegExp(`^(var\\d+\\.[xyzw])\\s*\\*\\s*(${shaderNumberPattern})$`).exec(text);
  if (varTimesScalar) {
    return {
      offset: 0,
      speed: roundedNumber(varTimesScalar[2]),
      phaseSource: varTimesScalar[1],
    };
  }

  const scalarTimesVar = new RegExp(`^(${shaderNumberPattern})\\s*\\*\\s*(var\\d+\\.[xyzw])$`).exec(text);
  if (scalarTimesVar) {
    return {
      offset: 0,
      speed: roundedNumber(scalarTimesVar[1]),
      phaseSource: scalarTimesVar[2],
    };
  }

  const linearPhase = parseLinearPhaseScalarExpression(text);
  if (linearPhase) return linearPhase;

  const componentExpression = parseVecComponentScrollUvScalarExpression(text, shaderText, seenAliases);
  if (componentExpression) return componentExpression;

  return null;
}

function parseVec2ScrollComponents(value, shaderText = "") {
  const parts = splitTopLevelCommaList(value);
  if (parts.length !== 1 && parts.length !== 2) return null;

  const x = parseScrollUvScalarExpression(parts[0], shaderText);
  const y = parseScrollUvScalarExpression(parts.length === 1 ? parts[0] : parts[1], shaderText);
  if (!x || !y) return null;

  const phaseSources = [x.phaseSource, y.phaseSource].filter(Boolean);
  const phaseSource = phaseSources[0] || "";
  if (phaseSources.some((source) => source !== phaseSource)) return null;

  const speed = [roundedNumber(x.speed), roundedNumber(y.speed)];
  const offset = [roundedNumber(x.offset), roundedNumber(y.offset)];
  const hasSpeed = Math.abs(speed[0]) >= 0.00001 || Math.abs(speed[1]) >= 0.00001;
  const hasOffset = Math.abs(offset[0]) >= 0.00001 || Math.abs(offset[1]) >= 0.00001;
  if (hasSpeed && !phaseSource) return null;
  if (!hasSpeed && !hasOffset) return null;

  return {
    speed,
    offset,
    phaseSource,
  };
}

function findBalancedCallArguments(text, functionName, startIndex = 0) {
  const needle = `${functionName}(`;
  const openIndex = text.indexOf(needle, startIndex);
  if (openIndex < 0) return null;
  let depth = 1;
  const contentStart = openIndex + needle.length;
  for (let index = contentStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return {
          start: openIndex,
          end: index + 1,
          content: text.slice(contentStart, index),
        };
      }
    }
  }
  return null;
}

function balancedFunctionCallAtStart(value, functionName) {
  const text = stripOuterParens(value);
  const match = new RegExp(`^${escapeRegExp(functionName)}\\s*\\(`).exec(text);
  if (!match) return null;
  const openIndex = text.indexOf("(", match.index);
  let depth = 1;
  for (let index = openIndex + 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return {
          content: text.slice(openIndex + 1, index),
          end: index + 1,
          suffix: text.slice(index + 1).trim(),
        };
      }
    }
  }
  return null;
}

function samplerTextureUvExpressions(text, sampler) {
  if (!text || !sampler) return [];
  const samplerName = escapeRegExp(sampler);
  const textureCall = new RegExp(`texture2D\\s*\\(\\s*${samplerName}\\s*,`, "g");
  const expressions = [];
  let match;
  while ((match = textureCall.exec(text))) {
    const expressionStart = textureCall.lastIndex;
    let depth = 1;
    for (let index = expressionStart; index < text.length; index += 1) {
      const char = text[index];
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          expressions.push(text.slice(expressionStart, index).trim());
          textureCall.lastIndex = index + 1;
          break;
        }
      }
    }
  }
  return expressions;
}

function samplerTextureUvExpressionItems(text) {
  const expressions = [];
  const textureCall = /texture2D\s*\(\s*(sampler\d+)\s*,/g;
  let match;
  while ((match = textureCall.exec(text || ""))) {
    const expressionStart = textureCall.lastIndex;
    let depth = 1;
    for (let index = expressionStart; index < text.length; index += 1) {
      const char = text[index];
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          const suffix = /^\s*\.([xyzwrgba]{1,4})/.exec(text.slice(index + 1, index + 16))?.[1] || "";
          expressions.push({ sampler: match[1], uvExpression: text.slice(expressionStart, index).trim(), suffix });
          textureCall.lastIndex = index + 1;
          break;
        }
      }
    }
  }
  return expressions;
}

function uvAliasAssignmentExpression(text, expression) {
  const alias = /^(tmpvar_\d+)$/.exec(stripOuterParens(expression));
  if (!alias) return null;
  const assignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\s*=\\s*([^;]+);`, "s").exec(text);
  if (!assignment) return null;
  return stripOuterParens(assignment[1]);
}

function uvAliasAssignmentExpressions(text, expression) {
  const alias = /^(tmpvar_\d+)$/.exec(stripOuterParens(expression));
  if (!alias) return [];
  const assignments = [];
  const pattern = new RegExp(`\\b${escapeRegExp(alias[1])}\\s*=\\s*([^;]+);`, "gs");
  let assignment;
  while ((assignment = pattern.exec(text))) assignments.push(stripOuterParens(assignment[1]));
  return uniqueInOrder(assignments);
}

function simpleUvAliasExpression(text, expression) {
  const value = uvAliasAssignmentExpression(text, expression);
  if (!value) return null;
  if (!/\b(?:var\d+|tmpvar_\d+)\.xy\s*[+\-]\s*vec2\s*\(/.test(value)) return null;
  return value;
}

function simpleUvScaleAliasExpression(text, expression) {
  const value = uvAliasAssignmentExpression(text, expression);
  if (!value) return null;
  if (!/\b(?:var\d+|tmpvar_\d+)\.xy\s*\*\s*vec2\s*\(/.test(value)) return null;
  return value;
}

function samplerTextureUvExpressionsWithSimpleAliases(text, sampler) {
  const expressions = [];
  for (const expression of samplerTextureUvExpressions(text, sampler)) {
    expressions.push(expression);
    const aliasExpression = simpleUvAliasExpression(text, expression);
    if (aliasExpression) expressions.push(aliasExpression);
  }
  return expressions;
}

function samplerTextureUvExpressionsWithDirectAliases(text, sampler) {
  const expressions = [];
  for (const expression of samplerTextureUvExpressions(text, sampler)) {
    expressions.push(expression);
    expressions.push(...uvAliasAssignmentExpressions(text, expression));
  }
  return uniqueInOrder(expressions);
}

function samplerTextureUvExpressionsWithScaleAliases(text, sampler) {
  const expressions = [];
  for (const expression of samplerTextureUvExpressions(text, sampler)) {
    expressions.push(expression);
    const aliasExpression = simpleUvScaleAliasExpression(text, expression);
    if (aliasExpression) expressions.push(aliasExpression);
  }
  return expressions;
}

function varyingHasSource(varyingSources, varying, source) {
  return (varyingSources?.[varying] || []).includes(source);
}

function varyingHasSourceOrNoMapping(varyingSources, varying, source) {
  if (varyingHasSource(varyingSources, varying, source)) return true;
  return !Object.prototype.hasOwnProperty.call(varyingSources || {}, varying);
}

function previewScrollOffsetVariable(vectorTerm, vectorMatch, swizzle) {
  const constructor = /^(vec[234])\s*\(/.exec(stripOuterParens(vectorTerm));
  if (constructor) return constructor[1];
  if (vectorMatch && /^(?:var\d+|tmpvar_\d+|cse_\d+)$/.test(stripOuterParens(vectorMatch[1]))) return vectorTerm;
  return vectorMatch ? `vectorSwizzle.${swizzle}` : vectorTerm;
}

function parseShaderNumberLiteral(value) {
  const match = new RegExp(`^(${shaderNumberPattern})$`).exec(stripOuterParens(value));
  if (!match) return null;
  return roundedNumber(match[1]);
}

function parseStaticVec2Numbers(value) {
  const parts = splitTopLevelCommaList(value);
  if (parts.length !== 1 && parts.length !== 2) return null;
  const x = parseShaderNumberLiteral(parts[0]);
  const y = parseShaderNumberLiteral(parts.length === 1 ? parts[0] : parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

function extractTch0UniformDefaults(buffer, shaderText = "") {
  if (!Buffer.isBuffer(buffer)) return {};
  const tch0Index = buffer.indexOf(Buffer.from("TCH0", "ascii"));
  if (tch0Index < 0 || tch0Index + 0x18 > buffer.length) return {};

  const uniformCount = buffer[tch0Index + 0x14];
  if (!Number.isInteger(uniformCount) || uniformCount <= 0 || uniformCount > 32) return {};

  let offset = tch0Index + 0x18;
  const records = [];
  for (let index = 0; index < uniformCount; index += 1) {
    if (offset + 6 > buffer.length) return {};
    const dimension = buffer[offset + 1];
    if (!Number.isInteger(dimension) || dimension <= 0 || dimension > 4) return {};

    const valueOffset = offset + 2;
    const hashOffset = valueOffset + dimension * 4;
    if (hashOffset + 4 > buffer.length) return {};

    const values = [];
    for (let component = 0; component < dimension; component += 1) {
      const value = roundedNumber(buffer.readFloatLE(valueOffset + component * 4));
      if (!Number.isFinite(value)) return {};
      values.push(value);
    }
    records.push(values.length === 1 ? values[0] : values);
    offset = hashOffset + 4;
  }

  const firstShaderIndex = String(shaderText || "").search(/precision\s+(?:lowp|mediump|highp)\s+float;/);
  const tableText = firstShaderIndex >= 0 ? shaderText.slice(tch0Index, firstShaderIndex) : shaderText.slice(tch0Index);
  const uniformNames = uniqueInOrder([...tableText.matchAll(/unif\d+(?=\x00)/g)].map((match) => match[0]));
  if (!uniformNames.length) return {};

  const defaults = {};
  for (let index = 0; index < records.length && index < uniformNames.length; index += 1) {
    defaults[uniformNames[index]] = records[index];
  }
  return defaults;
}

function uniformScalarDefault(uniformDefaults, expression) {
  const text = stripOuterParens(expression);
  const uniform = /^(unif\d+)$/.exec(text);
  if (uniform) {
    const value = uniformDefaults?.[uniform[1]];
    return Number.isFinite(value) ? roundedNumber(value) : null;
  }
  return parseShaderNumberLiteral(text);
}

function parseUniformDefaultVec2Expression(value, uniformDefaults) {
  const text = stripOuterParens(value);
  const uniform = /^(unif\d+)$/.exec(text);
  if (uniform) {
    const defaultValue = uniformDefaults?.[uniform[1]];
    if (Array.isArray(defaultValue) && defaultValue.length >= 2) {
      const x = Number(defaultValue[0]);
      const y = Number(defaultValue[1]);
      return Number.isFinite(x) && Number.isFinite(y) ? [roundedNumber(x), roundedNumber(y)] : null;
    }
    if (Number.isFinite(defaultValue)) {
      const scalar = roundedNumber(defaultValue);
      return [scalar, scalar];
    }
  }

  const vec2 = /^vec2\s*\(([\s\S]+)\)$/.exec(text);
  if (!vec2) return null;

  const parts = splitTopLevelCommaList(vec2[1]);
  if (parts.length !== 1 && parts.length !== 2) return null;
  const x = uniformScalarDefault(uniformDefaults, parts[0]);
  const y = uniformScalarDefault(uniformDefaults, parts.length === 1 ? parts[0] : parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

function splitTopLevelOperator(value, operator) {
  let depth = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === operator && depth === 0 && index > 0) {
      return [text.slice(0, index).trim(), text.slice(index + 1).trim()];
    }
  }
  return null;
}

function parseTexture2DSampledScalarExpression(value) {
  const text = stripOuterParens(value);
  const call = balancedFunctionCallAtStart(text, "texture2D");
  if (!call) return null;
  const channelMatch = /^\.([xyzw])$/.exec(call.suffix);
  if (!channelMatch) return null;
  const args = splitTopLevelCommaList(call.content);
  if (args.length !== 2) return null;

  const samplerMatch = /^(sampler\d+)$/.exec(stripOuterParens(args[0]));
  const uvMatch = /^(var\d+)\.xy$/.exec(stripOuterParens(args[1]));
  if (!samplerMatch || !uvMatch) return null;

  return {
    distortionSampler: samplerMatch[1],
    distortionChannel: channelMatch[1],
    distortionUvSource: `${uvMatch[1]}.xy`,
    distortionBias: 0,
    distortionScale: 1,
  };
}

function parseSampledScalarVectorTransform(shaderText, value, seenAliases) {
  const text = stripOuterParens(value);
  const biasedMatch = new RegExp(
    `^\\(?\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\+\\s*\\(?\\s*\\(?\\s*(tmpvar_\\d+|cse_\\d+)\\s*/\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\)?\\s*\\*\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\)?\\s*\\)?\\s*\\.([xyzw])$`,
    "s",
  ).exec(text);
  const scaleOnlyMatch = biasedMatch
    ? null
    : new RegExp(
        `^\\(?\\s*\\(?\\s*(tmpvar_\\d+|cse_\\d+)\\s*/\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\)?\\s*\\*\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\)?\\s*\\.([xyzw])$`,
        "s",
      ).exec(text);
  const biasedSubtractDivideMatch =
    biasedMatch || scaleOnlyMatch
      ? null
      : new RegExp(
          `^\\(?\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\+\\s*\\(?\\s*\\(?\\s*\\(?\\s*(tmpvar_\\d+|cse_\\d+)\\s*-\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\)?\\s*/\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\)?\\s*\\*\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\)?\\s*\\)?\\s*\\.([xyzw])$`,
          "s",
        ).exec(text);
  if (biasedSubtractDivideMatch) {
    const bias = Number(biasedSubtractDivideMatch[1]);
    const alias = biasedSubtractDivideMatch[2];
    const subtract = Number(biasedSubtractDivideMatch[3]);
    const divisor = Number(biasedSubtractDivideMatch[4]);
    const scale = Number(biasedSubtractDivideMatch[5]);
    const component = biasedSubtractDivideMatch[6];
    if (
      !Number.isFinite(bias) ||
      !Number.isFinite(subtract) ||
      !Number.isFinite(divisor) ||
      Math.abs(divisor) < 0.00001 ||
      !Number.isFinite(scale)
    ) {
      return null;
    }

    const sampled = parseSampledDistortionTextureScalar(shaderText, `${alias}.${component}`, seenAliases);
    if (!sampled) return null;
    return {
      ...sampled,
      distortionBias: roundedNumber(bias + ((sampled.distortionBias || 0) - subtract) * (scale / divisor)),
      distortionScale: roundedNumber((sampled.distortionScale || 0) * (scale / divisor)),
    };
  }

  const subtractDivideMatch =
    biasedMatch || scaleOnlyMatch || biasedSubtractDivideMatch
      ? null
      : new RegExp(
          `^\\(?\\s*\\(?\\s*\\(?\\s*(tmpvar_\\d+|cse_\\d+)\\s*-\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\)?\\s*/\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\)?\\s*\\*\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\)?\\s*\\.([xyzw])$`,
          "s",
        ).exec(text);
  if (subtractDivideMatch) {
    const alias = subtractDivideMatch[1];
    const subtract = Number(subtractDivideMatch[2]);
    const divisor = Number(subtractDivideMatch[3]);
    const scale = Number(subtractDivideMatch[4]);
    const component = subtractDivideMatch[5];
    if (!Number.isFinite(subtract) || !Number.isFinite(divisor) || Math.abs(divisor) < 0.00001 || !Number.isFinite(scale)) {
      return null;
    }

    const sampled = parseSampledDistortionTextureScalar(shaderText, `${alias}.${component}`, seenAliases);
    if (!sampled) return null;
    return {
      ...sampled,
      distortionBias: roundedNumber(((sampled.distortionBias || 0) - subtract) * (scale / divisor)),
      distortionScale: roundedNumber((sampled.distortionScale || 0) * (scale / divisor)),
    };
  }

  const match = biasedMatch || scaleOnlyMatch;
  if (!match) return null;

  const bias = biasedMatch ? Number(match[1]) : 0;
  const alias = biasedMatch ? match[2] : match[1];
  const divisor = Number(biasedMatch ? match[3] : match[2]);
  const scale = Number(biasedMatch ? match[4] : match[3]);
  const component = biasedMatch ? match[5] : match[4];
  if (!Number.isFinite(bias) || !Number.isFinite(divisor) || Math.abs(divisor) < 0.00001 || !Number.isFinite(scale)) {
    return null;
  }

  const sampled = parseSampledDistortionTextureScalar(shaderText, `${alias}.${component}`, seenAliases);
  if (!sampled) return null;
  return {
    ...sampled,
    distortionBias: roundedNumber(bias + (sampled.distortionBias / divisor) * scale),
    distortionScale: roundedNumber((sampled.distortionScale / divisor) * scale),
  };
}

function parseSampledDistortionTextureScalar(shaderText, value, seenAliases = new Set()) {
  const text = stripOuterParens(value);
  const direct = parseTexture2DSampledScalarExpression(text);
  if (direct) return direct;

  const aliasComponent = /^(tmpvar_\d+|cse_\d+)\.([xyzw])$/.exec(text);
  if (aliasComponent && !seenAliases.has(text)) {
    const nextSeen = new Set(seenAliases);
    nextSeen.add(text);
    const assignment = new RegExp(`\\b${escapeRegExp(aliasComponent[1])}\\.${aliasComponent[2]}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (assignment) return parseSampledDistortionTextureScalar(shaderText, assignment[1], nextSeen);
    const vectorAssignment = new RegExp(`\\b${escapeRegExp(aliasComponent[1])}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (vectorAssignment) return parseSampledDistortionTextureScalar(shaderText, `${vectorAssignment[1]}.${aliasComponent[2]}`, nextSeen);
  }

  return parseSampledScalarVectorTransform(shaderText, text, seenAliases);
}

function vectorComponentIndex(component) {
  return { x: 0, y: 1, z: 2, w: 3 }[component] ?? -1;
}

function scaleSampledDistortionFactor(factor, scale) {
  if (!factor || !Number.isFinite(scale)) return null;
  if (factor.kind === "number") return { ...factor, value: roundedNumber(factor.value * scale) };
  if (factor.kind === "phase") return { ...factor, scale: roundedNumber((factor.scale || 1) * scale) };
  return null;
}

function parseVec3ScaledRuntimeFactor(shaderText, sourceExpression, scaleExpression, component, seenAliases = new Set(), inverseScale = false) {
  const componentIndex = vectorComponentIndex(component);
  const vec3Call = balancedFunctionCallAtStart(stripOuterParens(scaleExpression), "vec3");
  if (!vec3Call || vec3Call.suffix || componentIndex < 0) return null;
  const values = splitTopLevelCommaList(vec3Call.content);
  if (componentIndex >= values.length) return null;
  const scale = parseShaderNumberLiteral(values[componentIndex]);
  if (!Number.isFinite(scale) || (inverseScale && Math.abs(scale) < 0.00001)) return null;
  const source = /^(tmpvar_\d+|cse_\d+)$/.exec(stripOuterParens(sourceExpression));
  if (!source) return null;
  const factor = parseRuntimeScalarFactorExpression(shaderText, `${source[1]}.${component}`, seenAliases);
  return scaleSampledDistortionFactor(factor, inverseScale ? 1 / scale : scale);
}

function parseRuntimeScalarFactorExpression(shaderText, value, seenAliases = new Set()) {
  const text = stripOuterParens(value);
  const numeric = parseShaderNumberLiteral(text);
  if (Number.isFinite(numeric)) return { kind: "number", value: numeric };

  const fractCall = balancedFunctionCallAtStart(text, "fract");
  if (fractCall && !fractCall.suffix) {
    const factor = parseRuntimeScalarFactorExpression(shaderText, fractCall.content, seenAliases);
    return factor?.kind === "phase" ? { ...factor, fract: true } : null;
  }

  const phase = /^(var\d+\.[xyzw])$/.exec(text);
  if (phase) return { kind: "phase", source: phase[1], scale: 1 };

  const uniform = /^(unif\d+)$/.exec(text);
  if (uniform) return { kind: "phase", source: `uniform:${uniform[1]}`, scale: 1 };

  const vectorComponent = /^(.+)\.([xyzw])$/.exec(text);
  if (vectorComponent) {
    const vec3Call = balancedFunctionCallAtStart(stripOuterParens(vectorComponent[1]), "vec3");
    const componentIndex = vectorComponentIndex(vectorComponent[2]);
    if (vec3Call && !vec3Call.suffix && componentIndex >= 0) {
      const values = splitTopLevelCommaList(vec3Call.content);
      if (componentIndex < values.length) {
        const value = parseShaderNumberLiteral(values[componentIndex]);
        if (Number.isFinite(value)) return { kind: "number", value };
      }
    }

    const vectorExpression = stripOuterParens(vectorComponent[1]);
    const product = splitTopLevelOperator(vectorExpression, "*");
    const quotient = product ? null : splitTopLevelOperator(vectorExpression, "/");
    if (product) {
      return (
        parseVec3ScaledRuntimeFactor(shaderText, product[0], product[1], vectorComponent[2], seenAliases) ||
        parseVec3ScaledRuntimeFactor(shaderText, product[1], product[0], vectorComponent[2], seenAliases)
      );
    }
    if (quotient) return parseVec3ScaledRuntimeFactor(shaderText, quotient[0], quotient[1], vectorComponent[2], seenAliases, true);
  }

  const aliasComponent = /^(tmpvar_\d+|cse_\d+)\.([xyzw])$/.exec(text);
  if (aliasComponent && !seenAliases.has(text)) {
    const nextSeen = new Set(seenAliases);
    nextSeen.add(text);
    const assignment = new RegExp(`\\b${escapeRegExp(aliasComponent[1])}\\.${aliasComponent[2]}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (assignment) return parseRuntimeScalarFactorExpression(shaderText, assignment[1], nextSeen);

    const vectorAssignment = new RegExp(`\\b${escapeRegExp(aliasComponent[1])}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (vectorAssignment) {
      const vectorExpression = stripOuterParens(vectorAssignment[1]);
      const product = splitTopLevelOperator(vectorExpression, "*");
      const quotient = product ? null : splitTopLevelOperator(vectorExpression, "/");
      if (product || quotient) {
        if (product) {
          return (
            parseVec3ScaledRuntimeFactor(shaderText, product[0], product[1], aliasComponent[2], nextSeen) ||
            parseVec3ScaledRuntimeFactor(shaderText, product[1], product[0], aliasComponent[2], nextSeen)
          );
        }
        return parseVec3ScaledRuntimeFactor(shaderText, quotient[0], quotient[1], aliasComponent[2], nextSeen, true);
      }
      return parseRuntimeScalarFactorExpression(shaderText, `${vectorAssignment[1]}.${aliasComponent[2]}`, nextSeen);
    }
  }

  return null;
}

function parseSampledDistortionScalarFactor(value, shaderText = "", seenAliases = new Set()) {
  const text = stripOuterParens(value);
  const numeric = parseShaderNumberLiteral(text);
  if (Number.isFinite(numeric)) return { kind: "number", value: numeric };
  const runtimeFactor = parseRuntimeScalarFactorExpression(shaderText, text, seenAliases);
  if (runtimeFactor?.kind === "phase" || runtimeFactor?.kind === "number") return runtimeFactor;
  const mask = parseTexture2DSampledScalarExpression(text);
  if (mask) return { kind: "mask", ...mask };
  if (shaderText) {
    const sampledAlias = parseSampledDistortionTextureScalar(shaderText, text, seenAliases);
    if (sampledAlias) return { kind: "mask", ...sampledAlias };
  }
  return null;
}

function scaleSampledDistortionScalar(scalar, factor) {
  return {
    ...scalar,
    offset: roundedNumber((scalar.offset || 0) * factor),
    distortionBias: roundedNumber((scalar.distortionBias || 0) * factor),
    distortionScale: roundedNumber((scalar.distortionScale || 0) * factor),
  };
}

function applySampledDistortionFactor(scalar, factor) {
  if (!scalar || !factor) return null;
  if (factor.kind === "number") return scaleSampledDistortionScalar(scalar, factor.value);
  if (factor.kind === "phase") {
    if (scalar.amplitudeSource && scalar.amplitudeSource !== factor.source) return null;
    return {
      ...scalar,
      amplitudeSource: factor.source,
      phaseSource: factor.source,
    };
  }
  if (factor.kind === "mask") {
    if (
      (scalar.amplitudeMaskSampler && scalar.amplitudeMaskSampler !== factor.distortionSampler) ||
      (scalar.amplitudeMaskChannel && scalar.amplitudeMaskChannel !== factor.distortionChannel) ||
      (scalar.amplitudeMaskUvSource && scalar.amplitudeMaskUvSource !== factor.distortionUvSource)
    ) {
      return null;
    }
    return {
      ...scalar,
      amplitudeMaskSampler: factor.distortionSampler,
      amplitudeMaskChannel: factor.distortionChannel,
      amplitudeMaskUvSource: factor.distortionUvSource,
    };
  }
  return null;
}

function applySampledDistortionOffsetTerm(scalar, factor, sign) {
  if (!scalar || !factor) return null;
  if (factor.kind === "number") {
    return {
      ...scalar,
      offset: roundedNumber((scalar.offset || 0) + sign * factor.value),
    };
  }
  if (factor.kind === "phase") {
    if (scalar.offsetPhaseSource && scalar.offsetPhaseSource !== factor.source) return null;
    return {
      ...scalar,
      offsetPhaseSource: factor.source,
      ...(factor.fract ? { offsetPhaseMode: "fract" } : {}),
      phaseSource: scalar.phaseSource || factor.source,
      offsetSpeed: roundedNumber((scalar.offsetSpeed || 0) + sign * (factor.scale || 1)),
    };
  }
  return null;
}

function parseSampledDistortionVectorComponentExpression(shaderText, value, component, seenAliases = new Set()) {
  const text = stripOuterParens(value);
  if (!component) return null;

  const aliasSwizzle = /^(tmpvar_\d+|cse_\d+)\.([xyzw]{2,4})$/.exec(text);
  if (aliasSwizzle) {
    const index = vectorComponentIndex(component);
    const sourceComponent = index >= 0 && index < aliasSwizzle[2].length ? aliasSwizzle[2][index] : component;
    return parseSampledDistortionScalar(shaderText, `${aliasSwizzle[1]}.${sourceComponent}`, seenAliases);
  }

  const textureSwizzle = /^(.+)\.([xyzw]{2,4})$/.exec(text);
  if (textureSwizzle && balancedFunctionCallAtStart(stripOuterParens(textureSwizzle[1]), "texture2D")) {
    const index = vectorComponentIndex(component);
    const sourceComponent = index >= 0 && index < textureSwizzle[2].length ? textureSwizzle[2][index] : component;
    const sampled = parseTexture2DSampledScalarExpression(`${textureSwizzle[1]}.${sourceComponent}`);
    if (sampled) return { ...sampled, offset: 0 };
  }

  const alias = /^(tmpvar_\d+|cse_\d+)$/.exec(text);
  if (alias) return parseSampledDistortionScalar(shaderText, `${alias[1]}.${component}`, seenAliases);

  const vec3Call = balancedFunctionCallAtStart(text, "vec3");
  if (vec3Call && !vec3Call.suffix) {
    const index = vectorComponentIndex(component);
    const values = splitTopLevelCommaList(vec3Call.content);
    if (index < 0 || index >= values.length) return null;
    const offset = parseShaderNumberLiteral(values[index]);
    return Number.isFinite(offset) ? { offset } : null;
  }

  const difference = splitTopLevelOperator(text, "-");
  if (difference) {
    const leftScalar = parseSampledDistortionVectorComponentExpression(shaderText, difference[0], component, seenAliases);
    const rightFactor = parseSampledDistortionScalarFactor(`${stripOuterParens(difference[1])}.${component}`, shaderText, seenAliases);
    if (leftScalar?.distortionSampler && rightFactor) return applySampledDistortionOffsetTerm(leftScalar, rightFactor, -1);

    const rightScalar = parseSampledDistortionVectorComponentExpression(shaderText, difference[1], component, seenAliases);
    const leftFactor = parseSampledDistortionScalarFactor(`${stripOuterParens(difference[0])}.${component}`, shaderText, seenAliases);
    if (rightScalar?.distortionSampler && leftFactor?.kind === "number") {
      return {
        ...rightScalar,
        offset: roundedNumber(leftFactor.value - (rightScalar.offset || 0)),
        distortionBias: roundedNumber(-(rightScalar.distortionBias || 0)),
        distortionScale: roundedNumber(-(rightScalar.distortionScale || 0)),
      };
    }
  }

  const sum = splitTopLevelOperator(text, "+");
  if (sum) {
    const leftScalar = parseSampledDistortionVectorComponentExpression(shaderText, sum[0], component, seenAliases);
    const rightFactor = parseSampledDistortionScalarFactor(`${stripOuterParens(sum[1])}.${component}`, shaderText, seenAliases);
    if (leftScalar?.distortionSampler && rightFactor) return applySampledDistortionOffsetTerm(leftScalar, rightFactor, 1);

    const rightScalar = parseSampledDistortionVectorComponentExpression(shaderText, sum[1], component, seenAliases);
    const leftFactor = parseSampledDistortionScalarFactor(`${stripOuterParens(sum[0])}.${component}`, shaderText, seenAliases);
    if (rightScalar?.distortionSampler && leftFactor) return applySampledDistortionOffsetTerm(rightScalar, leftFactor, 1);
  }

  const product = splitTopLevelOperator(text, "*");
  if (product) {
    const leftScalar = parseSampledDistortionVectorComponentExpression(shaderText, product[0], component, seenAliases);
    const rightFactor = parseSampledDistortionScalarFactor(`${stripOuterParens(product[1])}.${component}`, shaderText, seenAliases);
    if (leftScalar?.distortionSampler && rightFactor) return applySampledDistortionFactor(leftScalar, rightFactor);

    const rightScalar = parseSampledDistortionVectorComponentExpression(shaderText, product[1], component, seenAliases);
    const leftFactor = parseSampledDistortionScalarFactor(`${stripOuterParens(product[0])}.${component}`, shaderText, seenAliases);
    if (rightScalar?.distortionSampler && leftFactor) return applySampledDistortionFactor(rightScalar, leftFactor);
  }

  return null;
}

function parseSampledDistortionScalar(shaderText, value, seenAliases = new Set()) {
  const text = stripOuterParens(value);
  const numeric = parseShaderNumberLiteral(text);
  if (Number.isFinite(numeric)) return { offset: numeric };

  const vectorComponent = /^(.+)\.([xyzw])$/.exec(text);
  if (vectorComponent && !/^(?:tmpvar_\d+|cse_\d+|var\d+)\.[xyzw]$/.test(text)) {
    const scalar = parseSampledDistortionVectorComponentExpression(shaderText, vectorComponent[1], vectorComponent[2], seenAliases);
    if (scalar) return scalar;
  }

  const difference = splitTopLevelOperator(text, "-");
  if (difference) {
    const leftScalar = parseSampledDistortionScalar(shaderText, difference[0], seenAliases);
    const rightFactor = parseSampledDistortionScalarFactor(difference[1], shaderText, seenAliases);
    if (leftScalar?.distortionSampler && rightFactor) return applySampledDistortionOffsetTerm(leftScalar, rightFactor, -1);
  }

  const sum = splitTopLevelOperator(text, "+");
  if (sum) {
    const leftScalar = parseSampledDistortionScalar(shaderText, sum[0], seenAliases);
    const rightFactor = parseSampledDistortionScalarFactor(sum[1], shaderText, seenAliases);
    if (leftScalar?.distortionSampler && rightFactor) return applySampledDistortionOffsetTerm(leftScalar, rightFactor, 1);
    const rightScalar = parseSampledDistortionScalar(shaderText, sum[1], seenAliases);
    const leftFactor = parseSampledDistortionScalarFactor(sum[0], shaderText, seenAliases);
    if (rightScalar?.distortionSampler && leftFactor) return applySampledDistortionOffsetTerm(rightScalar, leftFactor, 1);
  }

  const product = splitTopLevelOperator(text, "*");
  if (product) {
    const leftScalar = parseSampledDistortionScalar(shaderText, product[0], seenAliases);
    const rightScalar = parseSampledDistortionScalar(shaderText, product[1], seenAliases);
    const leftFactor = parseSampledDistortionScalarFactor(product[0], shaderText, seenAliases);
    const rightFactor = parseSampledDistortionScalarFactor(product[1], shaderText, seenAliases);

    if (leftScalar?.distortionSampler && rightFactor) return applySampledDistortionFactor(leftScalar, rightFactor);
    if (rightScalar?.distortionSampler && leftFactor) return applySampledDistortionFactor(rightScalar, leftFactor);
    if (leftScalar && rightFactor?.kind === "number" && !leftScalar.distortionSampler) {
      return { offset: roundedNumber((leftScalar.offset || 0) * rightFactor.value) };
    }
    if (rightScalar && leftFactor?.kind === "number" && !rightScalar.distortionSampler) {
      return { offset: roundedNumber((rightScalar.offset || 0) * leftFactor.value) };
    }
    return null;
  }

  const sampled = parseSampledDistortionTextureScalar(shaderText, text, seenAliases);
  if (sampled) return { ...sampled, offset: 0 };

  const aliasComponent = /^(tmpvar_\d+|cse_\d+)\.([xyzw])$/.exec(text);
  if (aliasComponent && !seenAliases.has(text)) {
    const nextSeen = new Set(seenAliases);
    nextSeen.add(text);
    const assignment = new RegExp(`\\b${escapeRegExp(aliasComponent[1])}\\.${aliasComponent[2]}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (assignment) return parseSampledDistortionScalar(shaderText, assignment[1], nextSeen);
    const vectorAssignment = new RegExp(`\\b${escapeRegExp(aliasComponent[1])}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (vectorAssignment) return parseSampledDistortionScalar(shaderText, `${vectorAssignment[1]}.${aliasComponent[2]}`, nextSeen);
  }

  return null;
}

function parseSampledDistortionVector(shaderText, value) {
  const text = stripOuterParens(value);
  const vec2Call = balancedFunctionCallAtStart(text, "vec2");
  if (vec2Call && !vec2Call.suffix) {
    const args = splitTopLevelCommaList(vec2Call.content);
    if (args.length !== 1 && args.length !== 2) return null;
    const x = parseSampledDistortionScalar(shaderText, args[0]);
    const y = parseSampledDistortionScalar(shaderText, args.length === 1 ? args[0] : args[1]);
    return x && y ? [x, y] : null;
  }

  const alias = /^(tmpvar_\d+|cse_\d+)$/.exec(text);
  if (!alias) return null;
  const xAssignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\.x\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  const yAssignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\.y\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!xAssignment || !yAssignment) return null;
  const x = parseSampledDistortionScalar(shaderText, xAssignment[1]);
  const y = parseSampledDistortionScalar(shaderText, yAssignment[1]);
  return x && y ? [x, y] : null;
}

function sampledDistortionComponentSignature(component) {
  return [
    component.distortionSampler,
    component.distortionUvSource,
    component.distortionBias,
    component.distortionScale,
    component.amplitudeSource || "",
    component.amplitudeMaskSampler || "",
    component.amplitudeMaskChannel || "",
    component.amplitudeMaskUvSource || "",
  ].join("|");
}

function buildSampledDistortionUvAnimation(shaderText, sampler, baseUvSource, vectorComponents, varyingSources) {
  const baseVarying = /^var\d+/.exec(baseUvSource)?.[0] || "";
  if (!varyingHasSource(varyingSources, baseVarying, "uv0")) return null;

  const dynamicComponents = vectorComponents.filter((component) => component.distortionSampler);
  if (!dynamicComponents.length) return null;
  const signature = sampledDistortionComponentSignature(dynamicComponents[0]);
  if (dynamicComponents.some((component) => sampledDistortionComponentSignature(component) !== signature)) return null;

  const distortion = dynamicComponents[0];
  const distortionChannels = vectorComponents.map((component) => (component.distortionSampler ? component.distortionChannel || "" : ""));
  const hasVectorChannels = distortionChannels.some((channel) => channel && channel !== distortion.distortionChannel);
  const distortionVarying = /^var\d+/.exec(distortion.distortionUvSource)?.[0] || "";
  const amplitudeVarying = /^var\d+/.exec(distortion.amplitudeSource || "")?.[0] || "";
  const amplitudeMaskVarying = /^var\d+/.exec(distortion.amplitudeMaskUvSource || "")?.[0] || "";
  if (!varyingHasSource(varyingSources, distortionVarying, "uv0")) return null;
  if (amplitudeVarying && !varyingHasSource(varyingSources, amplitudeVarying, "vertexColor")) return null;
  if (amplitudeMaskVarying && !varyingHasSource(varyingSources, amplitudeMaskVarying, "uv0")) return null;
  const offsetPhaseSources = uniqueInOrder(vectorComponents.map((component) => component.offsetPhaseSource).filter(Boolean));
  if (!allPhaseSourcesUseVaryingSourceOrUniform(offsetPhaseSources, varyingSources, "vertexColor")) return null;
  const phaseSources = uniqueInOrder([distortion.amplitudeSource || "", ...offsetPhaseSources].filter(Boolean));
  const offsetPhaseModes = vectorComponents.map((component) => component.offsetPhaseMode || "");
  const hasFractOffset = offsetPhaseModes.includes("fract");

  return {
    mode: hasFractOffset ? "sampledFractOffsetDistort" : "sampledDistort",
    baseSampler: sampler,
    distortionSampler: distortion.distortionSampler,
    distortionChannel: distortion.distortionChannel,
    ...(hasVectorChannels ? { distortionChannels } : {}),
    baseUvSource,
    distortionUvSource: distortion.distortionUvSource,
    distortionBias: roundedNumber(distortion.distortionBias || 0),
    distortionScale: roundedNumber(distortion.distortionScale || 0),
    amplitudeSource: distortion.amplitudeSource || "",
    phaseSource: phaseSources[0] || "",
    ...(phaseSources.length > 1 ? { phaseSources } : {}),
    ...(distortion.amplitudeMaskSampler
      ? {
          amplitudeMaskSampler: distortion.amplitudeMaskSampler,
          amplitudeMaskChannel: distortion.amplitudeMaskChannel,
          amplitudeMaskUvSource: distortion.amplitudeMaskUvSource,
        }
      : {}),
    axis: vectorComponents.map((component) => (component.distortionSampler ? 1 : 0)),
    offset: vectorComponents.map((component) => roundedNumber(component.distortionSampler ? component.offset || 0 : component.offset || 0)),
    ...(vectorComponents.some((component) => Number.isFinite(component.offsetSpeed))
      ? { offsetSpeed: vectorComponents.map((component) => roundedNumber(component.distortionSampler ? component.offsetSpeed || 0 : 0)) }
      : {}),
    ...(hasFractOffset ? { offsetPhaseModes } : {}),
  };
}

function scaleLinearComponent(linear, scale) {
  if (!linear || !Number.isFinite(scale)) return null;
  return {
    offset: roundedNumber((linear.offset || 0) * scale),
    terms: (linear.terms || []).map((term) => ({ source: term.source, scale: roundedNumber((term.scale || 0) * scale) })),
  };
}

function mergeLinearComponents(left, right, rightSign = 1) {
  if (!left || !right) return null;
  const terms = [];
  const bySource = new Map();
  for (const term of [...(left.terms || []), ...(right.terms || []).map((item) => ({ ...item, scale: (item.scale || 0) * rightSign }))]) {
    const previous = bySource.get(term.source);
    if (previous) previous.scale = roundedNumber(previous.scale + term.scale);
    else {
      const next = { source: term.source, scale: roundedNumber(term.scale) };
      terms.push(next);
      bySource.set(term.source, next);
    }
  }
  return {
    offset: roundedNumber((left.offset || 0) + rightSign * (right.offset || 0)),
    terms: terms.filter((term) => Math.abs(term.scale) >= 0.00001),
  };
}

function parseLinearVectorComponentExpression(shaderText, value, component, seenAliases = new Set()) {
  const text = stripOuterParens(value);
  const direct = parseMultiPhaseLinearScalarExpression(text, shaderText, seenAliases);
  if (direct) return direct;

  const vec3Call = balancedFunctionCallAtStart(text, "vec3");
  const componentIndex = vectorComponentIndex(component);
  if (vec3Call && !vec3Call.suffix && componentIndex >= 0) {
    const values = splitTopLevelCommaList(vec3Call.content);
    const number = componentIndex < values.length ? parseShaderNumberLiteral(values[componentIndex]) : Number.NaN;
    return Number.isFinite(number) ? { offset: roundedNumber(number), terms: [] } : null;
  }

  const alias = /^(tmpvar_\d+|cse_\d+)$/.exec(text);
  if (alias && !seenAliases.has(`${alias[1]}.${component}`)) {
    const nextSeen = new Set([...seenAliases, `${alias[1]}.${component}`]);
    const assignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\.${escapeRegExp(component)}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (assignment) return parseLinearVectorComponentExpression(shaderText, assignment[1], component, nextSeen);
    const vectorAssignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (vectorAssignment) return parseLinearVectorComponentExpression(shaderText, `${vectorAssignment[1]}.${component}`, component, nextSeen);
  }

  const vectorComponent = /^(.+)\.([xyzw])$/.exec(text);
  if (vectorComponent) {
    return parseLinearVectorComponentExpression(shaderText, vectorComponent[1], vectorComponent[2], seenAliases);
  }

  const sum = splitTopLevelOperator(text, "+");
  if (sum) {
    const left = parseLinearVectorComponentExpression(shaderText, sum[0], component, seenAliases);
    const right = parseLinearVectorComponentExpression(shaderText, sum[1], component, seenAliases);
    return mergeLinearComponents(left, right);
  }

  const difference = splitTopLevelOperator(text, "-");
  if (difference) {
    const left = parseLinearVectorComponentExpression(shaderText, difference[0], component, seenAliases);
    const right = parseLinearVectorComponentExpression(shaderText, difference[1], component, seenAliases);
    return mergeLinearComponents(left, right, -1);
  }

  const product = splitTopLevelOperator(text, "*");
  if (product) {
    const left = parseLinearVectorComponentExpression(shaderText, product[0], component, seenAliases);
    const right = parseLinearVectorComponentExpression(shaderText, product[1], component, seenAliases);
    if (!left || !right) return null;
    if (!(left.terms || []).length) return scaleLinearComponent(right, left.offset || 0);
    if (!(right.terms || []).length) return scaleLinearComponent(left, right.offset || 0);
  }

  return null;
}

function extractUniformVertexColorFractOffsetUvAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;
  for (const uvExpression of samplerTextureUvExpressions(text, sampler)) {
    const terms = splitTopLevelOperator(stripOuterParens(uvExpression), "+");
    if (!terms) continue;
    const firstBase = /^(var\d+)\.xy$/.exec(stripOuterParens(terms[0]));
    const secondBase = /^(var\d+)\.xy$/.exec(stripOuterParens(terms[1]));
    const baseUvSource = firstBase ? `${firstBase[1]}.xy` : secondBase ? `${secondBase[1]}.xy` : "";
    if (!baseUvSource) continue;
    const baseVarying = /^var\d+/.exec(baseUvSource)?.[0] || "";
    if (!varyingHasSource(varyingSources, baseVarying, "uv0")) continue;

    const offsetAlias = /^(tmpvar_\d+|cse_\d+)$/.exec(stripOuterParens(firstBase ? terms[1] : terms[0]))?.[1] || "";
    if (!offsetAlias) continue;
    const xAssignment = new RegExp(`\\b${escapeRegExp(offsetAlias)}\\.x\\s*=\\s*([^;]+);`, "s").exec(text);
    const yAssignment = new RegExp(`\\b${escapeRegExp(offsetAlias)}\\.y\\s*=\\s*([^;]+);`, "s").exec(text);
    const xFract = xAssignment ? balancedFunctionCallAtStart(stripOuterParens(xAssignment[1]), "fract") : null;
    const yFract = yAssignment ? balancedFunctionCallAtStart(stripOuterParens(yAssignment[1]), "fract") : null;
    if (!xFract || xFract.suffix || !yFract || yFract.suffix) continue;

    const xProductComponent = /^(tmpvar_\d+|cse_\d+)\.x$/.exec(stripOuterParens(xFract.content));
    const yProductComponent = /^(tmpvar_\d+|cse_\d+)\.y$/.exec(stripOuterParens(yFract.content));
    if (!xProductComponent || !yProductComponent || xProductComponent[1] !== yProductComponent[1]) continue;

    const productAlias = xProductComponent[1];
    const productAssignment = new RegExp(`\\b${escapeRegExp(productAlias)}\\s*=\\s*([^;]+);`, "s").exec(text);
    if (!productAssignment) continue;
    const product = splitTopLevelOperator(stripOuterParens(productAssignment[1]), "*");
    if (!product) continue;

    const parseSidePair = (uniformExpression, vertexExpression) => {
      const uniformFactors = ["x", "y"].map((component) => parseRuntimeScalarFactorExpression(text, `${stripOuterParens(uniformExpression)}.${component}`));
      if (uniformFactors.some((factor) => factor?.kind !== "phase" || !/^uniform:unif\d+$/.test(factor.source))) return null;
      if (uniformFactors[0].source !== uniformFactors[1].source) return null;
      const vertexComponents = ["x", "y"].map((component) => normalizedLinearComponent(parseLinearVectorComponentExpression(text, vertexExpression, component)));
      if (vertexComponents.some((component) => !component.terms.length)) return null;
      const vertexSources = uniqueInOrder(vertexComponents.flatMap((component) => component.terms.map((term) => term.source)));
      if (!vertexSources.length) return null;
      for (const source of vertexSources) {
        const varying = /^var\d+/.exec(source)?.[0] || "";
        if (!varyingHasSource(varyingSources, varying, "vertexColor")) return null;
      }
      return { uniformFactors, vertexComponents, vertexSources };
    };

    const parsed = parseSidePair(product[0], product[1]) || parseSidePair(product[1], product[0]);
    if (!parsed) continue;
    const phaseSources = uniqueInOrder([parsed.uniformFactors[0].source, ...parsed.vertexSources]);
    return {
      mode: "uniformVertexColorFractOffset",
      baseSampler: sampler,
      baseUvSource,
      offsetAlias,
      productAlias,
      uniformSource: parsed.uniformFactors[0].source,
      uniformScale: parsed.uniformFactors.map((factor) => roundedNumber(factor.scale || 1)),
      vertexSources: parsed.vertexSources,
      vertexOffset: parsed.vertexComponents.map((component) => roundedNumber(component.offset || 0)),
      vertexTerms: parsed.vertexComponents.map((component) => component.terms),
      phaseSource: phaseSources.join("|"),
      phaseSources,
    };
  }
  return null;
}

function parseTexture2DVectorExpressionAnyUv(value) {
  const text = stripOuterParens(value);
  const call = balancedFunctionCallAtStart(text, "texture2D");
  if (!call || call.suffix) return null;
  const args = splitTopLevelCommaList(call.content);
  if (args.length !== 2) return null;
  const samplerMatch = /^(sampler\d+)$/.exec(stripOuterParens(args[0]));
  if (!samplerMatch) return null;
  return {
    sampler: samplerMatch[1],
    uvExpression: stripOuterParens(args[1]),
  };
}

function parseNestedSampledScalarAnyUv(shaderText, value, seenAliases = new Set()) {
  const text = stripOuterParens(value);
  const directComponent = /^(.+)\.([xyzw])$/.exec(text);
  if (directComponent) {
    const directTexture = parseTexture2DVectorExpressionAnyUv(directComponent[1]);
    if (directTexture) return { ...directTexture, channel: directComponent[2] };
  }

  const aliasComponent = /^(tmpvar_\d+|cse_\d+)\.([xyzw])$/.exec(text);
  if (!aliasComponent || seenAliases.has(text)) return null;
  const nextSeen = new Set([...seenAliases, text]);
  const assignment = new RegExp(`\\b${escapeRegExp(aliasComponent[1])}\\.${aliasComponent[2]}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (assignment) return parseNestedSampledScalarAnyUv(shaderText, assignment[1], nextSeen);
  const vectorAssignment = new RegExp(`\\b${escapeRegExp(aliasComponent[1])}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (vectorAssignment) return parseNestedSampledScalarAnyUv(shaderText, `${vectorAssignment[1]}.${aliasComponent[2]}`, nextSeen);
  return null;
}

function parseScaledNestedSampledOffsetVector(shaderText, value) {
  const swizzle = /^(.+)\.xy$/.exec(stripOuterParens(value));
  const expression = swizzle ? stripOuterParens(swizzle[1]) : stripOuterParens(value);
  const product = splitTopLevelOperator(expression, "*");
  if (!product) return null;

  const parseCandidate = (sampleExpression, scaleExpression) => {
    const vec3Call = balancedFunctionCallAtStart(stripOuterParens(scaleExpression), "vec3");
    if (!vec3Call || vec3Call.suffix) return null;
    const scaleParts = splitTopLevelCommaList(vec3Call.content);
    if (scaleParts.length < 2) return null;
    const scale = [parseShaderNumberLiteral(scaleParts[0]), parseShaderNumberLiteral(scaleParts[1])];
    if (scale.some((value) => !Number.isFinite(value))) return null;

    const alias = /^(tmpvar_\d+|cse_\d+)$/.exec(stripOuterParens(sampleExpression))?.[1] || "";
    if (!alias) return null;
    const xAssignment = new RegExp(`\\b${escapeRegExp(alias)}\\.x\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    const yAssignment = new RegExp(`\\b${escapeRegExp(alias)}\\.y\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (!xAssignment || !yAssignment) return null;
    const xSample = parseNestedSampledScalarAnyUv(shaderText, xAssignment[1]);
    const ySample = parseNestedSampledScalarAnyUv(shaderText, yAssignment[1]);
    if (!xSample || !ySample || xSample.sampler !== ySample.sampler || xSample.channel !== ySample.channel) return null;

    return {
      distortionSampler: xSample.sampler,
      distortionChannel: xSample.channel,
      distortionUvExpression: xSample.uvExpression,
      distortionScale: scale.map(roundedNumber),
    };
  };

  return parseCandidate(product[0], product[1]) || parseCandidate(product[1], product[0]);
}

function extractNestedSampledUvDistortionAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;
  for (const uvExpression of samplerTextureUvExpressions(text, sampler)) {
    const terms = splitTopLevelOperator(stripOuterParens(uvExpression), "+");
    if (!terms) continue;
    const firstBase = /^(var\d+)\.xy$/.exec(stripOuterParens(terms[0]));
    const secondBase = /^(var\d+)\.xy$/.exec(stripOuterParens(terms[1]));
    const baseUvSource = firstBase ? `${firstBase[1]}.xy` : secondBase ? `${secondBase[1]}.xy` : "";
    if (!baseUvSource) continue;
    const baseVarying = /^var\d+/.exec(baseUvSource)?.[0] || "";
    if (!varyingHasSource(varyingSources, baseVarying, "uv0")) continue;

    const offsetExpression = firstBase ? terms[1] : terms[0];
    const offset = parseScaledNestedSampledOffsetVector(text, offsetExpression);
    if (!offset) continue;
    const uniforms = uniformSourcesReferencedByExpression(text, offset.distortionUvExpression);
    const uvVaryings = uniqueInOrder([...String(offset.distortionUvExpression || "").matchAll(/\b(var\d+)\.xy\b/g)].map((match) => match[1]));
    if (uvVaryings.some((varying) => !varyingHasSource(varyingSources, varying, "uv0"))) continue;

    return {
      mode: "nestedSampledUvDistort",
      baseSampler: sampler,
      baseUvSource,
      ...offset,
      phaseSource: uniforms.join("|"),
      ...(uniforms.length ? { phaseSources: uniforms } : {}),
    };
  }
  return null;
}

function parseTexture2DVectorExpression(value) {
  const text = stripOuterParens(value);
  const call = balancedFunctionCallAtStart(text, "texture2D");
  if (!call || call.suffix) return null;
  const args = splitTopLevelCommaList(call.content);
  if (args.length !== 2) return null;
  const samplerMatch = /^(sampler\d+)$/.exec(stripOuterParens(args[0]));
  const uvMatch = /^(var\d+)\.xy$/.exec(stripOuterParens(args[1]));
  if (!samplerMatch || !uvMatch) return null;
  return {
    sampler: samplerMatch[1],
    uvSource: `${uvMatch[1]}.xy`,
  };
}

function parseVaryingUvRepeat(shaderText, uvSource) {
  const varying = /^(var\d+)\.xy$/.exec(String(uvSource || ""))?.[1] || "";
  if (!varying) return null;
  const assignment = new RegExp(`\\b${escapeRegExp(varying)}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!assignment) return null;
  const expression = stripOuterParens(assignment[1]);
  if (expression === "_MultiTexCoord0") return [1, 1];

  const parseUvRepeatProduct = (left, right) => {
    if (stripOuterParens(left) !== "_MultiTexCoord0") return null;
    const vec4Call = balancedFunctionCallAtStart(right, "vec4");
    if (!vec4Call || vec4Call.suffix) return null;
    const args = splitTopLevelCommaList(vec4Call.content);
    if (args.length < 2) return null;
    const x = parseShaderNumberLiteral(args[0]);
    const y = parseShaderNumberLiteral(args[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
  };

  const product = splitTopLevelOperator(expression, "*");
  if (!product) return null;
  return parseUvRepeatProduct(product[0], product[1]) || parseUvRepeatProduct(product[1], product[0]);
}

function parseSampledWarpWeightedComponent(shaderText, value) {
  const aliasComponent = /^(tmpvar_\d+|cse_\d+)\.([xyzw])$/.exec(stripOuterParens(value));
  if (!aliasComponent) return null;

  const assignment = new RegExp(`\\b${escapeRegExp(aliasComponent[1])}\\.${aliasComponent[2]}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!assignment) return null;
  const product = splitTopLevelOperator(stripOuterParens(assignment[1]), "*");
  if (!product) return null;
  const left = /^(tmpvar_\d+|cse_\d+)\.([xyzw])$/.exec(stripOuterParens(product[0]));
  const right = /^(tmpvar_\d+|cse_\d+)\.([xyzw])$/.exec(stripOuterParens(product[1]));
  if (!left || !right || left[1] !== right[1]) return null;

  const vectorAssignment = new RegExp(`\\b${escapeRegExp(left[1])}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!vectorAssignment) return null;
  const sampled = parseTexture2DVectorExpression(vectorAssignment[1]);
  if (!sampled) return null;

  return {
    distortionSampler: sampled.sampler,
    distortionUvSource: sampled.uvSource,
    distortionChannel: left[2],
    distortionWeightChannel: right[2],
  };
}

function parseSampledWarpScalarTransform(shaderText, value) {
  const text = stripOuterParens(value);
  const negated = /^-\s*([\s\S]+)$/.exec(text);
  if (negated) {
    const scalar = parseSampledWarpScalarTransform(shaderText, negated[1]);
    return scalar ? { ...scalar, distortionScale: roundedNumber((scalar.distortionScale || 1) * -1) } : null;
  }

  const product = splitTopLevelOperator(text, "*");
  if (product) {
    const leftNumber = parseShaderNumberLiteral(product[0]);
    const rightNumber = parseShaderNumberLiteral(product[1]);
    if (Number.isFinite(leftNumber)) {
      const scalar = parseSampledWarpScalarTransform(shaderText, product[1]);
      return scalar ? { ...scalar, distortionScale: roundedNumber((scalar.distortionScale || 1) * leftNumber) } : null;
    }
    if (Number.isFinite(rightNumber)) {
      const scalar = parseSampledWarpScalarTransform(shaderText, product[0]);
      return scalar ? { ...scalar, distortionScale: roundedNumber((scalar.distortionScale || 1) * rightNumber) } : null;
    }
  }

  const transformMatch = new RegExp(
    `^\\(?\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\+\\s*\\(?\\s*\\(?\\s*(tmpvar_\\d+|cse_\\d+)\\s*/\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\)?\\s*\\*\\s*vec3\\s*\\(\\s*(${shaderNumberPattern})\\s*,[\\s\\S]*?\\)\\s*\\)?\\s*\\)?\\s*\\.([xyzw])$`,
    "s",
  ).exec(text);
  if (!transformMatch) return null;

  const bias = Number(transformMatch[1]);
  const alias = transformMatch[2];
  const divisor = Number(transformMatch[3]);
  const valueScale = Number(transformMatch[4]);
  const component = transformMatch[5];
  if (!Number.isFinite(bias) || !Number.isFinite(divisor) || Math.abs(divisor) < 0.00001 || !Number.isFinite(valueScale)) {
    return null;
  }
  const sampled = parseSampledWarpWeightedComponent(shaderText, `${alias}.${component}`);
  if (!sampled) return null;
  return {
    ...sampled,
    distortionValueScale: roundedNumber(valueScale / divisor),
    distortionBias: roundedNumber(bias),
    distortionScale: 1,
  };
}

function parseSampledWarpRuntimeSourceScale(value) {
  const text = stripOuterParens(value);
  const phase = parseSampledDistortionScalarFactor(text);
  if (phase?.kind === "phase") return { source: phase.source, scale: 1 };
  const product = splitTopLevelOperator(text, "*");
  if (!product) return null;
  const leftPhase = parseSampledDistortionScalarFactor(product[0]);
  const rightPhase = parseSampledDistortionScalarFactor(product[1]);
  const leftNumber = parseShaderNumberLiteral(product[0]);
  const rightNumber = parseShaderNumberLiteral(product[1]);
  if (leftPhase?.kind === "phase" && Number.isFinite(rightNumber)) return { source: leftPhase.source, scale: rightNumber };
  if (rightPhase?.kind === "phase" && Number.isFinite(leftNumber)) return { source: rightPhase.source, scale: leftNumber };
  return null;
}

function parseSampledWarpRuntimeOffsetExpression(value) {
  const text = stripOuterParens(value);
  const sum = splitTopLevelOperator(text, "+");
  if (!sum) return null;

  for (const [productExpression, multiplierExpression] of [sum, [sum[1], sum[0]]]) {
    const multiplier = parseSampledDistortionScalarFactor(multiplierExpression);
    if (multiplier?.kind !== "phase") continue;
    const product = splitTopLevelOperator(stripOuterParens(productExpression), "*");
    if (!product) continue;
    const leftMultiplier = parseSampledDistortionScalarFactor(product[0]);
    const rightMultiplier = parseSampledDistortionScalarFactor(product[1]);
    if (leftMultiplier?.kind === "phase" && leftMultiplier.source === multiplier.source) {
      const sourceScale = parseSampledWarpRuntimeSourceScale(product[1]);
      if (sourceScale) return { ...sourceScale, multiplierSource: multiplier.source, bias: 1 };
    }
    if (rightMultiplier?.kind === "phase" && rightMultiplier.source === multiplier.source) {
      const sourceScale = parseSampledWarpRuntimeSourceScale(product[0]);
      if (sourceScale) return { ...sourceScale, multiplierSource: multiplier.source, bias: 1 };
    }
  }
  return null;
}

function parseSampledWarpVectorComponent(shaderText, expression, component) {
  const sum = splitTopLevelOperator(stripOuterParens(expression), "+");
  if (!sum) return null;

  for (const [warpExpression, runtimeExpression] of [sum, [sum[1], sum[0]]]) {
    const product = splitTopLevelOperator(stripOuterParens(warpExpression), "*");
    if (!product) continue;
    const leftUv = new RegExp(`^(var\\d+)\\.${component}$`).exec(stripOuterParens(product[0]));
    const rightUv = new RegExp(`^(var\\d+)\\.${component}$`).exec(stripOuterParens(product[1]));
    const uvVarying = leftUv?.[1] || rightUv?.[1] || "";
    if (!uvVarying) continue;
    const transformExpression = leftUv ? product[1] : product[0];
    const transform = parseSampledWarpScalarTransform(shaderText, transformExpression);
    if (!transform) continue;
    const runtimeOffset = parseSampledWarpRuntimeOffsetExpression(runtimeExpression);
    if (!runtimeOffset) continue;
    return {
      ...transform,
      uvScaleSource: `${uvVarying}.xy`,
      runtimeOffset,
    };
  }
  return null;
}

function extractSampledWarpUvAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;
  for (const uvExpression of samplerTextureUvExpressions(text, sampler)) {
    const expression = stripOuterParens(uvExpression);
    const uvTerms = splitTopLevelOperator(expression, "+");
    if (!uvTerms) continue;
    const left = stripOuterParens(uvTerms[0]);
    const right = stripOuterParens(uvTerms[1]);
    const leftBase = /^(var\d+)\.xy$/.exec(left);
    const rightBase = /^(var\d+)\.xy$/.exec(right);
    const baseUvSource = leftBase ? `${leftBase[1]}.xy` : rightBase ? `${rightBase[1]}.xy` : "";
    if (!baseUvSource) continue;
    const vectorExpression = leftBase ? right : left;
    const alias = /^(tmpvar_\d+|cse_\d+)$/.exec(stripOuterParens(vectorExpression));
    if (!alias) continue;
    const xAssignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\.x\\s*=\\s*([^;]+);`, "s").exec(text);
    const yAssignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\.y\\s*=\\s*([^;]+);`, "s").exec(text);
    if (!xAssignment || !yAssignment) continue;

    const x = parseSampledWarpVectorComponent(text, xAssignment[1], "x");
    const y = parseSampledWarpVectorComponent(text, yAssignment[1], "y");
    if (!x || !y) continue;
    if (
      x.distortionSampler !== y.distortionSampler ||
      x.distortionUvSource !== y.distortionUvSource ||
      x.distortionWeightChannel !== y.distortionWeightChannel ||
      x.distortionValueScale !== y.distortionValueScale ||
      x.distortionBias !== y.distortionBias ||
      x.distortionScale !== y.distortionScale ||
      x.uvScaleSource !== y.uvScaleSource ||
      x.runtimeOffset.source !== y.runtimeOffset.source ||
      x.runtimeOffset.multiplierSource !== y.runtimeOffset.multiplierSource ||
      x.runtimeOffset.bias !== y.runtimeOffset.bias
    ) {
      continue;
    }

    const baseVarying = /^var\d+/.exec(baseUvSource)?.[0] || "";
    const distortionVarying = /^var\d+/.exec(x.distortionUvSource)?.[0] || "";
    const uvScaleVarying = /^var\d+/.exec(x.uvScaleSource)?.[0] || "";
    const runtimeSourceVarying = /^var\d+/.exec(x.runtimeOffset.source)?.[0] || "";
    const runtimeMultiplierVarying = /^var\d+/.exec(x.runtimeOffset.multiplierSource)?.[0] || "";
    if (!varyingHasSource(varyingSources, baseVarying, "uv0")) continue;
    if (!varyingHasSource(varyingSources, distortionVarying, "uv0")) continue;
    if (!varyingHasSource(varyingSources, uvScaleVarying, "uv0")) continue;
    if (!varyingHasSource(varyingSources, runtimeSourceVarying, "vertexColor")) continue;
    if (!varyingHasSource(varyingSources, runtimeMultiplierVarying, "vertexColor")) continue;

    const baseRepeat = parseVaryingUvRepeat(text, baseUvSource);
    const distortionRepeat = parseVaryingUvRepeat(text, x.distortionUvSource);
    const uvScaleRepeat = parseVaryingUvRepeat(text, x.uvScaleSource);
    if (!baseRepeat || !distortionRepeat || !uvScaleRepeat) continue;
    const phaseSources = uniqueInOrder([x.runtimeOffset.source, x.runtimeOffset.multiplierSource]);

    return {
      mode: "sampledWarp",
      baseSampler: sampler,
      distortionSampler: x.distortionSampler,
      distortionChannels: [x.distortionChannel, y.distortionChannel],
      distortionWeightChannel: x.distortionWeightChannel,
      baseUvSource,
      baseRepeat,
      distortionUvSource: x.distortionUvSource,
      distortionRepeat,
      uvScaleSource: x.uvScaleSource,
      uvScaleRepeat,
      distortionValueScale: x.distortionValueScale,
      distortionBias: x.distortionBias,
      distortionScale: x.distortionScale,
      runtimeOffsetSource: x.runtimeOffset.source,
      runtimeOffsetMultiplierSource: x.runtimeOffset.multiplierSource,
      runtimeOffsetBias: [x.runtimeOffset.bias, y.runtimeOffset.bias],
      runtimeOffsetScale: [x.runtimeOffset.scale, y.runtimeOffset.scale],
      phaseSource: phaseSources.join("|"),
      phaseSources,
    };
  }
  return null;
}

function parseSampledOffsetFieldSampleComponent(shaderText, expression) {
  const difference = splitTopLevelOperator(stripOuterParens(expression), "-");
  if (!difference) return null;
  const aliasComponent = /^(tmpvar_\d+|cse_\d+)\.([xyzw])$/.exec(stripOuterParens(difference[0]));
  const bias = parseShaderNumberLiteral(difference[1]);
  if (!aliasComponent || !Number.isFinite(bias)) return null;

  const vectorAssignment = new RegExp(`\\b${escapeRegExp(aliasComponent[1])}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!vectorAssignment) return null;
  const sampled = parseTexture2DVectorExpression(vectorAssignment[1]);
  if (!sampled) return null;
  return {
    sampler: sampled.sampler,
    uvSource: sampled.uvSource,
    channel: aliasComponent[2],
    bias: roundedNumber(-bias),
  };
}

function parseSampledOffsetFieldRepeatedUvComponent(shaderText, expression, varying, component) {
  const linear = parseMultiPhaseLinearScalarExpression(expression, shaderText);
  if (!linear || Math.abs(linear.offset || 0) > 0.00001 || linear.terms.length !== 1) return null;
  const term = linear.terms[0];
  return term.source === `${varying}.${component}` ? roundedNumber(term.scale) : null;
}

function parseSampledOffsetFieldUvBend(shaderText, expression) {
  const product = splitTopLevelOperator(stripOuterParens(expression), "*");
  if (!product) return null;

  for (const [uExpression, vExpression] of [product, [product[1], product[0]]]) {
    const uProduct = splitTopLevelOperator(stripOuterParens(uExpression), "*");
    if (!uProduct) continue;
    const uDiff = splitTopLevelOperator(stripOuterParens(uProduct[0]), "-");
    const uScale = parseShaderNumberLiteral(uProduct[1]);
    if (!uDiff || !Number.isFinite(uScale)) continue;

    const uSource = /^(var\d+)\.x$/.exec(stripOuterParens(uDiff[0]));
    const uOffsetNumber = parseShaderNumberLiteral(uDiff[1]);
    if (!uSource || !Number.isFinite(uOffsetNumber)) continue;

    const vAlias = /^(tmpvar_\d+|cse_\d+)$/.exec(stripOuterParens(vExpression));
    if (!vAlias) continue;
    const vAssignment = new RegExp(`\\b${escapeRegExp(vAlias[1])}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (!vAssignment) continue;
    const vScale = parseSampledOffsetFieldRepeatedUvComponent(shaderText, vAssignment[1], uSource[1], "y");
    if (!Number.isFinite(vScale)) continue;

    return {
      source: `${uSource[1]}.xy`,
      x: {
        uOffset: roundedNumber(-uOffsetNumber),
        uScale: roundedNumber(uScale),
        vOffset: 0,
        vScale,
      },
    };
  }

  return null;
}

function extractSampledOffsetFieldUvAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;
  for (const uvExpression of samplerTextureUvExpressions(text, sampler)) {
    const uvTerms = splitTopLevelOperator(stripOuterParens(uvExpression), "+");
    if (!uvTerms) continue;
    const left = stripOuterParens(uvTerms[0]);
    const right = stripOuterParens(uvTerms[1]);
    const leftBase = /^(var\d+)\.xy$/.exec(left);
    const rightBase = /^(var\d+)\.xy$/.exec(right);
    const baseUvSource = leftBase ? `${leftBase[1]}.xy` : rightBase ? `${rightBase[1]}.xy` : "";
    if (!baseUvSource) continue;

    const vectorAlias = /^(tmpvar_\d+|cse_\d+)$/.exec(leftBase ? right : left);
    if (!vectorAlias) continue;
    const xAssignment = new RegExp(`\\b${escapeRegExp(vectorAlias[1])}\\.x\\s*=\\s*([^;]+);`, "s").exec(text);
    const yAssignment = new RegExp(`\\b${escapeRegExp(vectorAlias[1])}\\.y\\s*=\\s*([^;]+);`, "s").exec(text);
    if (!xAssignment || !yAssignment) continue;

    const xSum = splitTopLevelOperator(stripOuterParens(xAssignment[1]), "+");
    const ySum = splitTopLevelOperator(stripOuterParens(yAssignment[1]), "+");
    if (!xSum || !ySum) continue;

    let xSample = null;
    let uvBend = null;
    for (const [bendExpression, sampleExpression] of [xSum, [xSum[1], xSum[0]]]) {
      xSample = parseSampledOffsetFieldSampleComponent(text, sampleExpression);
      uvBend = parseSampledOffsetFieldUvBend(text, bendExpression);
      if (xSample && uvBend) break;
    }
    if (!xSample || !uvBend) continue;

    let ySample = null;
    let runtimeOffsetSource = "";
    for (const [phaseExpression, sampleExpression] of [ySum, [ySum[1], ySum[0]]]) {
      ySample = parseSampledOffsetFieldSampleComponent(text, sampleExpression);
      const phase = /^(var\d+\.[xyzw])$/.exec(stripOuterParens(phaseExpression));
      runtimeOffsetSource = phase?.[1] || "";
      if (ySample && runtimeOffsetSource) break;
    }
    if (!ySample || !runtimeOffsetSource) continue;
    if (xSample.sampler !== ySample.sampler || xSample.uvSource !== ySample.uvSource) continue;
    if (Math.abs(xSample.bias - ySample.bias) > 0.00001) continue;

    const baseVarying = /^var\d+/.exec(baseUvSource)?.[0] || "";
    const distortionVarying = /^var\d+/.exec(xSample.uvSource)?.[0] || "";
    const bendVarying = /^var\d+/.exec(uvBend.source)?.[0] || "";
    const runtimeVarying = /^var\d+/.exec(runtimeOffsetSource)?.[0] || "";
    if (!varyingHasSource(varyingSources, baseVarying, "uv0")) continue;
    if (!varyingHasSource(varyingSources, distortionVarying, "uv0")) continue;
    if (!varyingHasSource(varyingSources, bendVarying, "uv0")) continue;
    if (!varyingHasSource(varyingSources, runtimeVarying, "vertexColor")) continue;

    const baseRepeat = parseVaryingUvRepeat(text, baseUvSource);
    const distortionRepeat = parseVaryingUvRepeat(text, xSample.uvSource);
    if (!baseRepeat || !distortionRepeat) continue;

    return {
      mode: "sampledOffsetField",
      baseSampler: sampler,
      distortionSampler: xSample.sampler,
      distortionChannels: [xSample.channel, ySample.channel],
      baseUvSource,
      baseRepeat,
      distortionUvSource: xSample.uvSource,
      distortionRepeat,
      distortionBias: xSample.bias,
      distortionScale: 1,
      uvBendSource: uvBend.source,
      uvBend: {
        x: uvBend.x,
        y: null,
      },
      runtimeOffsetSource,
      runtimeOffsetAxis: [0, 1],
      phaseSource: runtimeOffsetSource,
    };
  }
  return null;
}

function parseUvScaleOffsetExpression(shaderText, value, seenAliases = new Set()) {
  const expression = stripOuterParens(value);
  if (expression === "_MultiTexCoord0") return { repeat: [1, 1], offset: [0, 0] };

  const alias = /^(tmpvar_\d+|cse_\d+)$/.exec(expression);
  if (alias && !seenAliases.has(alias[1])) {
    const assignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (!assignment) return null;
    return parseUvScaleOffsetExpression(shaderText, assignment[1], new Set([...seenAliases, alias[1]]));
  }

  const sum = splitTopLevelOperator(expression, "+");
  const parseProduct = (productExpression, offsetExpression) => {
    const parseFirstTwoNumbers = (value) => {
      const parts = splitTopLevelCommaList(value);
      if (parts.length < 2) return null;
      const x = parseShaderNumberLiteral(parts[0]);
      const y = parseShaderNumberLiteral(parts[1]);
      return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
    };
    const product = splitTopLevelOperator(stripOuterParens(productExpression), "*");
    if (!product) return null;
    const productLeft = stripOuterParens(product[0]);
    const productRight = stripOuterParens(product[1]);
    const vec4Call = balancedFunctionCallAtStart(productLeft === "_MultiTexCoord0" ? productRight : productLeft, "vec4");
    if ((productLeft !== "_MultiTexCoord0" && productRight !== "_MultiTexCoord0") || !vec4Call || vec4Call.suffix) return null;
    const repeat = parseFirstTwoNumbers(vec4Call.content);
    const offsetCall = balancedFunctionCallAtStart(stripOuterParens(offsetExpression), "vec4");
    const offset = offsetCall && !offsetCall.suffix ? parseFirstTwoNumbers(offsetCall.content) : null;
    return repeat && offset ? { repeat, offset } : null;
  };

  if (sum) return parseProduct(sum[0], sum[1]) || parseProduct(sum[1], sum[0]);
  return parseProduct(expression, "vec4(0.0, 0.0, 0.0, 0.0)");
}

function parseVaryingUvScaleOffset(shaderText, uvSource) {
  const varying = /^(var\d+)\.xy$/.exec(String(uvSource || ""))?.[1] || "";
  if (!varying) return null;
  const assignment = new RegExp(`\\b${escapeRegExp(varying)}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!assignment) return null;
  return parseUvScaleOffsetExpression(shaderText, assignment[1]);
}

function parseSampledCenterScalePhase(shaderText, scaleVariable) {
  const scaleAssignment = new RegExp(`\\b${escapeRegExp(scaleVariable)}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!scaleAssignment) return null;
  const product = splitTopLevelOperator(stripOuterParens(scaleAssignment[1]), "*");
  if (!product) return null;
  const left = stripOuterParens(product[0]);
  const right = stripOuterParens(product[1]);
  if (left !== right) return null;
  const linear = parseMultiPhaseLinearScalarExpression(left, shaderText);
  if (!linear || linear.terms.length !== 1 || !Number.isFinite(linear.offset) || !Number.isFinite(linear.terms[0].scale)) return null;
  return {
    centerScaleSource: linear.terms[0].source,
    centerScaleInputOffset: roundedNumber(linear.offset),
    centerScaleInputScale: roundedNumber(linear.terms[0].scale),
    centerScalePower: 2,
  };
}

function parseSampledCenterScaleMask(shaderText, amplitudeVariable) {
  const amplitudeAssignment = new RegExp(`\\b${escapeRegExp(amplitudeVariable)}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!amplitudeAssignment) return null;
  const amplitudeProduct = splitTopLevelOperator(stripOuterParens(amplitudeAssignment[1]), "*");
  if (!amplitudeProduct) return null;
  const left = stripOuterParens(amplitudeProduct[0]);
  const right = stripOuterParens(amplitudeProduct[1]);
  const leftSource = /^(var\d+\.[xyzw])$/.exec(left)?.[1] || "";
  const rightSource = /^(var\d+\.[xyzw])$/.exec(right)?.[1] || "";
  const amplitudeSource = leftSource || rightSource;
  const smoothExpression = leftSource ? right : rightSource ? left : "";
  if (!amplitudeSource || !smoothExpression) return null;
  const compactSmooth = stripOuterParens(smoothExpression).replace(/\s+/g, "");
  const smoothMatch = /^(tmpvar_\d+|cse_\d+)\*\(\1\*\(3\.0-\(2\.0\*\1\)\)\)$/.exec(compactSmooth);
  if (!smoothMatch) return null;

  const maskVariable = smoothMatch[1];
  const maskAssignment = new RegExp(`\\b${escapeRegExp(maskVariable)}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!maskAssignment) return null;
  const maskCompact = stripOuterParens(maskAssignment[1]).replace(/\s+/g, "");
  const maskMatch = /^clamp\(\(\(texture2D\((sampler\d+),(var\d+\.xy)\)\.([xyzw])-([-+]?\d*\.?\d+)\)\/([-+]?\d*\.?\d+)\),0\.0,1\.0\)$/.exec(maskCompact);
  if (!maskMatch) return null;
  const min = Number(maskMatch[4]);
  const range = Number(maskMatch[5]);
  if (!Number.isFinite(min) || !Number.isFinite(range)) return null;
  const maskTransform = parseVaryingUvScaleOffset(shaderText, maskMatch[2]);
  if (!maskTransform) return null;

  return {
    amplitudeMaskSampler: maskMatch[1],
    amplitudeMaskChannel: maskMatch[3],
    amplitudeMaskUvSource: maskMatch[2],
    amplitudeMaskRepeat: maskTransform.repeat,
    amplitudeMaskOffset: maskTransform.offset,
    amplitudeMaskSmoothstep: [roundedNumber(min), roundedNumber(min + range)],
    amplitudeSource,
  };
}

function parseSampledCenterScaleOffsetComponent(expression, expectedAlias, expectedComponent, expectedAmplitudeVariable) {
  const product = splitTopLevelOperator(stripOuterParens(expression), "*");
  if (!product) return null;
  const leftScale = parseShaderNumberLiteral(product[0]);
  const rightScale = parseShaderNumberLiteral(product[1]);
  const scale = Number.isFinite(leftScale) ? leftScale : rightScale;
  const offsetExpression = Number.isFinite(leftScale) ? product[1] : product[0];
  if (!Number.isFinite(scale)) return null;
  const compact = stripOuterParens(offsetExpression).replace(/\s+/g, "");
  const pattern = new RegExp(
    `^1\\.0-\\(\\(\\(${escapeRegExp(expectedAlias)}\\.${expectedComponent}-([-+]?\\d*\\.?\\d+)\\)\\*${escapeRegExp(expectedAmplitudeVariable)}\\)\\+1\\.0\\)$`,
  );
  const match = pattern.exec(compact);
  if (!match) return null;
  const bias = Number(match[1]);
  if (!Number.isFinite(bias)) return null;
  return {
    bias: roundedNumber(-bias),
    scale: roundedNumber(-scale),
  };
}

function extractSampledCenterScaleDistortUvAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;
  const samplerName = escapeRegExp(sampler);
  const distortionMatch = new RegExp(
    `\\b(tmpvar_\\d+|cse_\\d+)\\s*=\\s*texture2D\\s*\\(\\s*${samplerName}\\s*,\\s*\\(\\s*\\(\\s*(var\\d+)\\.xy\\s*\\*\\s*vec2\\s*\\(\\s*(tmpvar_\\d+|cse_\\d+)\\s*\\)\\s*\\)\\s*\\+\\s*(tmpvar_\\d+|cse_\\d+)\\s*\\)\\s*\\)\\s*;`,
    "s",
  ).exec(text);
  if (!distortionMatch) return null;

  const distortionAlias = distortionMatch[1];
  const distortionUvSource = `${distortionMatch[2]}.xy`;
  const centerScale = parseSampledCenterScalePhase(text, distortionMatch[3]);
  if (!centerScale) return null;

  let offsetAlias = "";
  let amplitudeVariable = "";
  let offsetX = null;
  let offsetY = null;
  const xPattern = new RegExp(`\\b(tmpvar_\\d+|cse_\\d+)\\.x\\s*=\\s*([^;]*${escapeRegExp(distortionAlias)}\\.x[^;]+);`, "gs");
  let xMatch;
  while ((xMatch = xPattern.exec(text))) {
    const candidateAlias = xMatch[1];
    const yAssignment = new RegExp(`\\b${escapeRegExp(candidateAlias)}\\.y\\s*=\\s*([^;]+);`, "s").exec(text);
    if (!yAssignment) continue;
    const amplitude = new RegExp(`${escapeRegExp(distortionAlias)}\\.x\\s*-\\s*[-+]?\\d*\\.?\\d+\\)\\s*\\*\\s*(tmpvar_\\d+|cse_\\d+)`, "s").exec(xMatch[2])?.[1] || "";
    if (!amplitude) continue;
    const parsedX = parseSampledCenterScaleOffsetComponent(xMatch[2], distortionAlias, "x", amplitude);
    const parsedY = parseSampledCenterScaleOffsetComponent(yAssignment[1], distortionAlias, "y", amplitude);
    if (!parsedX || !parsedY || Math.abs(parsedX.bias - parsedY.bias) > 0.00001 || Math.abs(parsedX.scale - parsedY.scale) > 0.00001) continue;
    offsetAlias = candidateAlias;
    amplitudeVariable = amplitude;
    offsetX = parsedX;
    offsetY = parsedY;
    break;
  }
  if (!offsetAlias || !amplitudeVariable || !offsetX || !offsetY) return null;

  const baseMatch = new RegExp(
    `texture2D\\s*\\(\\s*(sampler\\d+)\\s*,\\s*\\(\\s*(var\\d+)\\.xy\\s*\\+\\s*${escapeRegExp(offsetAlias)}\\s*\\)\\s*\\)`,
    "s",
  ).exec(text);
  if (!baseMatch) return null;
  const baseSampler = baseMatch[1];
  const baseUvSource = `${baseMatch[2]}.xy`;
  const mask = parseSampledCenterScaleMask(text, amplitudeVariable);
  if (!mask) return null;

  const baseVarying = /^var\d+/.exec(baseUvSource)?.[0] || "";
  const distortionVarying = /^var\d+/.exec(distortionUvSource)?.[0] || "";
  const centerScaleVarying = /^var\d+/.exec(centerScale.centerScaleSource)?.[0] || "";
  const amplitudeVarying = /^var\d+/.exec(mask.amplitudeSource)?.[0] || "";
  const maskVarying = /^var\d+/.exec(mask.amplitudeMaskUvSource)?.[0] || "";
  if (!varyingHasSource(varyingSources, baseVarying, "uv0")) return null;
  if (!varyingHasSource(varyingSources, distortionVarying, "uv0")) return null;
  if (!varyingHasSource(varyingSources, centerScaleVarying, "vertexColor")) return null;
  if (!varyingHasSource(varyingSources, amplitudeVarying, "vertexColor")) return null;
  if (!varyingHasSource(varyingSources, maskVarying, "uv0")) return null;

  const phaseSources = uniqueInOrder([centerScale.centerScaleSource, mask.amplitudeSource]);
  return {
    mode: "sampledCenterScaleDistort",
    baseSampler,
    distortionSampler: sampler,
    amplitudeMaskSampler: mask.amplitudeMaskSampler,
    distortionChannels: ["x", "y"],
    baseUvSource,
    distortionUvSource,
    center: [0.5, 0.5],
    ...centerScale,
    distortionBias: offsetX.bias,
    distortionScale: offsetX.scale,
    amplitudeSource: mask.amplitudeSource,
    amplitudeMaskUvSource: mask.amplitudeMaskUvSource,
    amplitudeMaskRepeat: mask.amplitudeMaskRepeat,
    amplitudeMaskOffset: mask.amplitudeMaskOffset,
    amplitudeMaskSmoothstep: mask.amplitudeMaskSmoothstep,
    phaseSource: phaseSources.join("|"),
    phaseSources,
  };
}

function parseSampledScaleRotateOffsetCenter(expression, expectedScaleVariable) {
  const vec2Call = balancedFunctionCallAtStart(stripOuterParens(expression), "vec2");
  if (!vec2Call || vec2Call.suffix) return null;
  const args = splitTopLevelCommaList(vec2Call.content);
  if (args.length !== 1) return null;
  const product = splitTopLevelOperator(stripOuterParens(args[0]), "*");
  if (!product) return null;
  const leftCenter = parseShaderNumberLiteral(product[0]);
  const rightCenter = parseShaderNumberLiteral(product[1]);
  const center = Number.isFinite(leftCenter) ? leftCenter : rightCenter;
  const oneMinusExpression = Number.isFinite(leftCenter) ? product[1] : product[0];
  if (!Number.isFinite(center)) return null;
  const difference = splitTopLevelOperator(stripOuterParens(oneMinusExpression), "-");
  if (!difference || parseShaderNumberLiteral(difference[0]) !== 1) return null;
  return stripOuterParens(difference[1]) === expectedScaleVariable ? roundedNumber(center) : null;
}

function parseSampledScaleRotateBaseExpression(shaderText, expression, expectedCenter) {
  const centeredTerms = splitTopLevelOperator(stripOuterParens(expression), "-");
  if (!centeredTerms) return null;
  const centerCall = balancedFunctionCallAtStart(stripOuterParens(centeredTerms[1]), "vec2");
  if (!centerCall || centerCall.suffix) return null;
  const center = parseStaticVec2Numbers(centerCall.content);
  if (!center) return null;
  if (Math.abs(center[0] - expectedCenter[0]) > 0.00001 || Math.abs(center[1] - expectedCenter[1]) > 0.00001) return null;

  const uvTerms = splitTopLevelOperator(stripOuterParens(centeredTerms[0]), "+");
  if (!uvTerms) return null;
  const parseScaleTerm = (term) => {
    const product = splitTopLevelOperator(stripOuterParens(term), "*");
    if (!product) return null;
    const left = stripOuterParens(product[0]);
    const right = stripOuterParens(product[1]);
    const leftBase = /^(var\d+)\.xy$/.exec(left);
    const rightBase = /^(var\d+)\.xy$/.exec(right);
    const baseVarying = leftBase?.[1] || rightBase?.[1] || "";
    if (!baseVarying) return null;
    const scaleExpression = leftBase ? right : left;
    const scaleCall = balancedFunctionCallAtStart(scaleExpression, "vec2");
    if (!scaleCall || scaleCall.suffix) return null;
    const scaleArgs = splitTopLevelCommaList(scaleCall.content);
    if (scaleArgs.length !== 1) return null;
    const scaleVariable = /^(tmpvar_\d+|cse_\d+)$/.exec(stripOuterParens(scaleArgs[0]))?.[1] || "";
    return scaleVariable ? { baseVarying, scaleVariable } : null;
  };
  const leftScale = parseScaleTerm(uvTerms[0]);
  const rightScale = parseScaleTerm(uvTerms[1]);
  const scaleTerm = leftScale || rightScale;
  if (!scaleTerm) return null;

  const offsetExpression = leftScale ? uvTerms[1] : uvTerms[0];
  const offsetCenter = parseSampledScaleRotateOffsetCenter(offsetExpression, scaleTerm.scaleVariable);
  if (!Number.isFinite(offsetCenter) || Math.abs(offsetCenter - center[0]) > 0.00001 || Math.abs(offsetCenter - center[1]) > 0.00001) {
    return null;
  }

  return scaleTerm;
}

function parseSampledScaleRotateSmoothMask(shaderText, expression) {
  const compact = stripOuterParens(expression).replace(/\s+/g, "");
  const smoothMatch = /^(tmpvar_\d+|cse_\d+)\*\(\1\*\(3\.0-\(2\.0\*\1\)\)\)$/.exec(compact);
  if (!smoothMatch) return null;
  const maskVariable = smoothMatch[1];
  const maskAssignment = new RegExp(`\\b${escapeRegExp(maskVariable)}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!maskAssignment) return null;
  const maskCompact = stripOuterParens(maskAssignment[1]).replace(/\s+/g, "");
  const directMatch = /^clamp\(\(?texture2D\((sampler\d+),(var\d+\.xy)\)\.([xyzw])\/([-+]?\d*\.?\d+)\)?,0\.0,1\.0\)$/.exec(maskCompact);
  const rangedMatch = directMatch
    ? null
    : /^clamp\(\(\(texture2D\((sampler\d+),(var\d+\.xy)\)\.([xyzw])-([-+]?\d*\.?\d+)\)\/([-+]?\d*\.?\d+)\),0\.0,1\.0\)$/.exec(maskCompact);
  const sampler = directMatch?.[1] || rangedMatch?.[1] || "";
  const uvSource = directMatch?.[2] || rangedMatch?.[2] || "";
  const channel = directMatch?.[3] || rangedMatch?.[3] || "";
  const min = directMatch ? 0 : Number(rangedMatch?.[4]);
  const range = Number(directMatch?.[4] || rangedMatch?.[5]);
  if (!sampler || !uvSource || !channel || !Number.isFinite(min) || !Number.isFinite(range)) return null;
  const transform = parseVaryingUvScaleOffset(shaderText, uvSource);
  if (!transform) return null;
  return {
    scaleMaskSampler: sampler,
    scaleMaskChannel: channel,
    scaleMaskUvSource: uvSource,
    scaleMaskRepeat: transform.repeat,
    scaleMaskOffset: transform.offset,
    scaleMaskSmoothstep: [roundedNumber(min), roundedNumber(min + range)],
  };
}

function parseSampledScaleRotateScaleExpression(shaderText, scaleVariable) {
  const assignment = new RegExp(`\\b${escapeRegExp(scaleVariable)}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!assignment) return null;
  const sum = splitTopLevelOperator(stripOuterParens(assignment[1]), "+");
  if (!sum) return null;
  const leftBase = parseShaderNumberLiteral(sum[0]);
  const rightBase = parseShaderNumberLiteral(sum[1]);
  const scaleBase = Number.isFinite(leftBase) ? leftBase : rightBase;
  const dynamicExpression = Number.isFinite(leftBase) ? sum[1] : sum[0];
  if (!Number.isFinite(scaleBase)) return null;

  const amplitudeProduct = splitTopLevelOperator(stripOuterParens(dynamicExpression), "*");
  if (!amplitudeProduct) return null;
  const leftAmplitude = /^(var\d+\.[xyzw])$/.exec(stripOuterParens(amplitudeProduct[0]))?.[1] || "";
  const rightAmplitude = /^(var\d+\.[xyzw])$/.exec(stripOuterParens(amplitudeProduct[1]))?.[1] || "";
  const scaleAmplitudeSource = leftAmplitude || rightAmplitude;
  const maskProductExpression = leftAmplitude ? amplitudeProduct[1] : rightAmplitude ? amplitudeProduct[0] : "";
  if (!scaleAmplitudeSource || !maskProductExpression) return null;

  const maskProduct = splitTopLevelOperator(stripOuterParens(maskProductExpression), "*");
  if (!maskProduct) return null;
  const leftSample = parseSampledDistortionTextureScalar(shaderText, maskProduct[0]);
  const rightSample = parseSampledDistortionTextureScalar(shaderText, maskProduct[1]);
  const sampledScale = leftSample || rightSample;
  const smoothMask = leftSample
    ? parseSampledScaleRotateSmoothMask(shaderText, maskProduct[1])
    : rightSample
      ? parseSampledScaleRotateSmoothMask(shaderText, maskProduct[0])
      : null;
  if (!sampledScale || !smoothMask) return null;
  const scaleTransform = parseVaryingUvScaleOffset(shaderText, sampledScale.distortionUvSource);
  if (!scaleTransform) return null;

  return {
    scaleSampler: sampledScale.distortionSampler,
    scaleSamplerChannel: sampledScale.distortionChannel,
    scaleUvSource: sampledScale.distortionUvSource,
    scaleRepeat: scaleTransform.repeat,
    scaleOffset: scaleTransform.offset,
    scaleBase: roundedNumber(scaleBase),
    scaleSamplerBias: roundedNumber(sampledScale.distortionBias || 0),
    scaleSamplerScale: roundedNumber(sampledScale.distortionScale || 1),
    scaleAmplitudeSource,
    ...smoothMask,
  };
}

function extractSampledScaleRotateUvAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;

  for (const uvExpression of samplerTextureUvExpressions(text, sampler)) {
    const output = parseRotatedUvOutputExpression(text, uvExpression);
    if (!output) continue;

    const rotatedName = escapeRegExp(output.rotatedVariable);
    const xAssignment = new RegExp(`\\b${rotatedName}\\.x\\s*=\\s*([^;]+);`, "s").exec(text);
    const yAssignment = new RegExp(`\\b${rotatedName}\\.y\\s*=\\s*([^;]+);`, "s").exec(text);
    if (!xAssignment || !yAssignment) continue;

    const xTerms = splitTopLevelOperator(stripOuterParens(xAssignment[1]), "-");
    const yTerms = splitTopLevelOperator(stripOuterParens(yAssignment[1]), "+");
    if (!xTerms || !yTerms) continue;

    const xLeft = parseRotationProduct(xTerms[0]);
    const xRight = parseRotationProduct(xTerms[1]);
    const yLeft = parseRotationProduct(yTerms[0]);
    const yRight = parseRotationProduct(yTerms[1]);
    if (!xLeft || !xRight || !yLeft || !yRight) continue;
    if (xLeft.vector !== xRight.vector || xLeft.vector !== yLeft.vector || xLeft.vector !== yRight.vector) continue;
    if (xLeft.component !== "x" || xRight.component !== "y" || yLeft.component !== "x" || yRight.component !== "y") continue;
    if (xRight.scalar !== yLeft.scalar || xLeft.scalar !== yRight.scalar) continue;

    const baseAssignment = new RegExp(`\\b${escapeRegExp(xLeft.vector)}\\s*=\\s*([^;]+);`, "s").exec(text);
    if (!baseAssignment) continue;
    const base = parseSampledScaleRotateBaseExpression(text, baseAssignment[1], output.center);
    if (!base) continue;
    const scale = parseSampledScaleRotateScaleExpression(text, base.scaleVariable);
    if (!scale) continue;
    const rotation = parseRotationPhaseExpression(text, xRight.scalar, xLeft.scalar);
    if (!rotation?.phaseSource) continue;

    const baseUvSource = `${base.baseVarying}.xy`;
    const baseVarying = base.baseVarying;
    const scaleVarying = /^var\d+/.exec(scale.scaleUvSource)?.[0] || "";
    const scaleMaskVarying = /^var\d+/.exec(scale.scaleMaskUvSource)?.[0] || "";
    const amplitudeVarying = /^var\d+/.exec(scale.scaleAmplitudeSource)?.[0] || "";
    const rotationVarying = /^var\d+/.exec(rotation.phaseSource)?.[0] || "";
    if (!varyingHasSource(varyingSources, baseVarying, "uv0")) continue;
    if (!varyingHasSource(varyingSources, scaleVarying, "uv0")) continue;
    if (!varyingHasSource(varyingSources, scaleMaskVarying, "uv0")) continue;
    if (!varyingHasSource(varyingSources, amplitudeVarying, "vertexColor")) continue;
    if (!varyingHasSource(varyingSources, rotationVarying, "vertexColor")) continue;

    const phaseSources = uniqueInOrder([scale.scaleAmplitudeSource, rotation.phaseSource]);
    return {
      mode: "sampledScaleRotate",
      baseSampler: sampler,
      ...scale,
      baseUvSource,
      center: output.center,
      rotationSource: rotation.phaseSource,
      rotationOffset: roundedNumber(rotation.offset || 0),
      rotationSpeed: roundedNumber(rotation.speed),
      phaseSource: phaseSources.join("|"),
      phaseSources,
    };
  }
  return null;
}

function extractSampledDistortionUvAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;
  for (const uvExpression of samplerTextureUvExpressions(text, sampler)) {
    const expression = stripOuterParens(uvExpression);
    const uvTerms = splitTopLevelOperator(expression, "+");
    if (!uvTerms) continue;
    const left = stripOuterParens(uvTerms[0]);
    const right = stripOuterParens(uvTerms[1]);
    const leftBase = /^(var\d+)\.xy$/.exec(left);
    const rightBase = /^(var\d+)\.xy$/.exec(right);
    const baseUvSource = leftBase ? `${leftBase[1]}.xy` : rightBase ? `${rightBase[1]}.xy` : "";
    if (!baseUvSource) continue;

    const vectorExpression = leftBase ? right : left;
    const vectorComponents = parseSampledDistortionVector(text, vectorExpression);
    if (!vectorComponents) continue;

    const animation = buildSampledDistortionUvAnimation(text, sampler, baseUvSource, vectorComponents, varyingSources);
    if (animation) return animation;
  }
  return null;
}

function extractStaticScaleUvTransform(text, sampler) {
  for (const uvExpression of samplerTextureUvExpressionsWithScaleAliases(text, sampler)) {
    const expression = stripOuterParens(uvExpression);
    const scaleMatch = /^(?:var\d+|tmpvar_\d+)\.xy\s*\*\s*vec2\s*\(([\s\S]+)\)$/.exec(expression);
    if (!scaleMatch) continue;
    const repeat = parseStaticVec2Numbers(scaleMatch[1]);
    if (!repeat || repeat.some((value) => value <= 0 || value > 16)) continue;
    if (Math.abs(repeat[0] - 1) < 0.00001 && Math.abs(repeat[1] - 1) < 0.00001) continue;
    return {
      mode: "scroll",
      speed: [0, 0],
      offset: [0, 0],
      repeat,
      offsetVariable: "uvScale",
      phaseSource: "",
    };
  }
  return null;
}

function parseUniformScaleOffsetBaseTerm(expression, uniformDefaults) {
  const product = splitTopLevelOperator(stripOuterParens(expression), "*");
  if (!product) return null;

  const left = stripOuterParens(product[0]);
  const right = stripOuterParens(product[1]);
  const leftBase = /^(var\d+)\.xy$/.exec(left);
  const rightBase = /^(var\d+)\.xy$/.exec(right);
  const baseVarying = leftBase?.[1] || rightBase?.[1] || "";
  if (!baseVarying) return null;

  const repeatExpression = leftBase ? right : left;
  const repeat = parseUniformDefaultVec2Expression(repeatExpression, uniformDefaults);
  if (!repeat || repeat.some((value) => value <= 0 || value > 16)) return null;
  return { baseVarying, repeat };
}

function parseUniformScaleOffsetDirectBaseTerm(expression) {
  const match = /^(var\d+)\.xy$/.exec(stripOuterParens(expression));
  return match ? { baseVarying: match[1], repeat: [1, 1] } : null;
}

function extractUniformScaleOffsetUvAnimation(text, sampler, varyingSources = {}, uniformDefaults = {}) {
  if (!Object.keys(uniformDefaults || {}).length) return null;

  for (const uvExpression of samplerTextureUvExpressions(text, sampler)) {
    const expression = stripOuterParens(uvExpression);
    const terms = splitTopLevelOperator(expression, "+");
    if (!terms) continue;

    const firstBase = parseUniformScaleOffsetBaseTerm(terms[0], uniformDefaults) || parseUniformScaleOffsetDirectBaseTerm(terms[0]);
    const secondBase = parseUniformScaleOffsetBaseTerm(terms[1], uniformDefaults) || parseUniformScaleOffsetDirectBaseTerm(terms[1]);
    const base = firstBase || secondBase;
    if (!base) continue;
    if (!varyingHasSource(varyingSources, base.baseVarying, "uv0")) continue;

    const offsetExpression = firstBase ? terms[1] : terms[0];
    const offset = parseUniformDefaultVec2Expression(offsetExpression, uniformDefaults);
    if (!offset) continue;

    const uniformNames = uniqueInOrder(
      [terms[0], terms[1]].flatMap((term) => [...String(term || "").matchAll(/\bunif\d+\b/g)].map((match) => match[0])),
    );
    const usedUniformDefaults = {};
    for (const name of uniformNames) {
      const value = uniformDefaults[name];
      if (Number.isFinite(value) || Array.isArray(value)) usedUniformDefaults[name] = value;
    }

    return {
      mode: "scroll",
      speed: [0, 0],
      offset: offset.map(roundedNumber),
      repeat: base.repeat.map(roundedNumber),
      offsetVariable: "uniformScaleOffset",
      phaseSource: "",
      baseUvSource: `${base.baseVarying}.xy`,
      uniformDefaults: usedUniformDefaults,
      uniformEvidenceKind: "shadergraph-tch0-uniform-defaults",
    };
  }

  return null;
}

function parseUniformAtlasOffsetComponent(shaderText, value) {
  const text = stripOuterParens(value);
  const direct = parseRuntimeScalarFactorExpression(shaderText, text);
  if (direct?.kind === "phase" && /^uniform:unif\d+$/.test(direct.source)) {
    return {
      source: direct.source,
      scale: roundedNumber(direct.scale || 1),
    };
  }

  const product = splitTopLevelOperator(text, "*");
  if (!product) return null;
  const leftNumber = parseShaderNumberLiteral(product[0]);
  const rightNumber = parseShaderNumberLiteral(product[1]);
  const multiplier = Number.isFinite(leftNumber) ? leftNumber : rightNumber;
  const floorExpression = Number.isFinite(leftNumber) ? product[1] : Number.isFinite(rightNumber) ? product[0] : "";
  if (!Number.isFinite(multiplier) || !floorExpression) return null;

  const floorCall = balancedFunctionCallAtStart(stripOuterParens(floorExpression), "floor");
  if (!floorCall || floorCall.suffix) return null;
  const quotient = splitTopLevelOperator(stripOuterParens(floorCall.content), "/");
  if (!quotient) return null;
  const factor = parseRuntimeScalarFactorExpression(shaderText, quotient[0]);
  const divisor = parseShaderNumberLiteral(quotient[1]);
  if (!factor || factor.kind !== "phase" || !/^uniform:unif\d+$/.test(factor.source)) return null;
  if (!Number.isFinite(divisor) || Math.abs(divisor) < 0.00001) return null;

  return {
    source: factor.source,
    scale: roundedNumber((factor.scale || 1) / divisor),
    floorDivisor: divisor,
    floorScale: multiplier,
  };
}

function extractUniformFloorAtlasOffsetUvAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;
  for (const uvExpression of samplerTextureUvExpressions(text, sampler)) {
    const expression = stripOuterParens(uvExpression);
    const uvTerms = splitTopLevelOperator(expression, "+");
    if (!uvTerms) continue;

    const left = stripOuterParens(uvTerms[0]);
    const right = stripOuterParens(uvTerms[1]);
    const leftBase = /^(var\d+)\.xy$/.exec(left);
    const rightBase = /^(var\d+)\.xy$/.exec(right);
    const baseUvSource = leftBase ? `${leftBase[1]}.xy` : rightBase ? `${rightBase[1]}.xy` : "";
    if (!baseUvSource) continue;

    const offsetAlias = /^(tmpvar_\d+|cse_\d+)$/.exec(leftBase ? right : left)?.[1] || "";
    if (!offsetAlias) continue;
    const xAssignment = new RegExp(`\\b${escapeRegExp(offsetAlias)}\\.x\\s*=\\s*([^;]+);`, "s").exec(text);
    const yAssignment = new RegExp(`\\b${escapeRegExp(offsetAlias)}\\.y\\s*=\\s*([^;]+);`, "s").exec(text);
    if (!xAssignment || !yAssignment) continue;

    const x = parseUniformAtlasOffsetComponent(text, xAssignment[1]);
    const y = parseUniformAtlasOffsetComponent(text, yAssignment[1]);
    if (!x || !y || x.source !== y.source) continue;

    const baseVarying = /^var\d+/.exec(baseUvSource)?.[0] || "";
    if (!varyingHasSource(varyingSources, baseVarying, "uv0")) continue;

    return {
      mode: "uniformFloorAtlasOffset",
      baseSampler: sampler,
      baseUvSource,
      phaseSource: x.source,
      offsetTerms: [x, y],
    };
  }
  return null;
}

function uniformSourcesReferencedByExpression(shaderText, expression, seenAliases = new Set()) {
  const sources = new Set([...String(expression || "").matchAll(/\bunif\d+\b/g)].map((match) => `uniform:${match[0]}`));
  for (const aliasMatch of String(expression || "").matchAll(/\b(tmpvar_\d+|cse_\d+)\b/g)) {
    const alias = aliasMatch[1];
    if (seenAliases.has(alias)) continue;
    const nextSeen = new Set(seenAliases);
    nextSeen.add(alias);
    const assignmentPattern = new RegExp(`\\b${escapeRegExp(alias)}(?:\\.[xyzw]|\\.xyz)?\\s*=\\s*([^;]+);`, "gs");
    let assignment;
    while ((assignment = assignmentPattern.exec(shaderText))) {
      for (const source of uniformSourcesReferencedByExpression(shaderText, assignment[1], nextSeen)) sources.add(source);
    }
  }
  return [...sources].sort();
}

function vectorAliasComponentExpressions(shaderText, alias) {
  const expressions = [];
  for (const component of ["x", "y"]) {
    const assignment = new RegExp(`\\b${escapeRegExp(alias)}\\.${component}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (assignment) expressions.push(assignment[1]);
  }
  return expressions;
}

function scaleUniformLinear(linear, scale) {
  if (!linear || !Number.isFinite(scale)) return null;
  return {
    offset: roundedNumber((linear.offset || 0) * scale),
    terms: (linear.terms || []).map((term) => ({ source: term.source, scale: roundedNumber((term.scale || 0) * scale) })),
  };
}

function mergeUniformLinear(left, right, rightSign = 1) {
  if (!left || !right) return null;
  const terms = [];
  const bySource = new Map();
  for (const term of [...(left.terms || []), ...(right.terms || []).map((item) => ({ ...item, scale: (item.scale || 0) * rightSign }))]) {
    const previous = bySource.get(term.source);
    if (previous) previous.scale = roundedNumber(previous.scale + term.scale);
    else {
      const next = { source: term.source, scale: roundedNumber(term.scale) };
      terms.push(next);
      bySource.set(term.source, next);
    }
  }
  return {
    offset: roundedNumber((left.offset || 0) + rightSign * (right.offset || 0)),
    terms: terms.filter((term) => Math.abs(term.scale) >= 0.00001),
  };
}

function normalizedUniformLinear(linear) {
  return {
    offset: roundedNumber(linear?.offset || 0),
    terms: (linear?.terms || []).map((term) => ({ source: term.source, scale: roundedNumber(term.scale) })),
  };
}

function parseUniformLinearScalarExpression(shaderText, value, seenAliases = new Set()) {
  const text = stripOuterParens(value);
  const numeric = parseShaderNumberLiteral(text);
  if (Number.isFinite(numeric)) return { offset: roundedNumber(numeric), terms: [] };

  const uniform = /^(unif\d+)$/.exec(text);
  if (uniform) return { offset: 0, terms: [{ source: `uniform:${uniform[1]}`, scale: 1 }] };

  const vec3Call = balancedFunctionCallAtStart(text, "vec3");
  if (vec3Call && !vec3Call.suffix) {
    const parts = splitTopLevelCommaList(vec3Call.content);
    if (parts.length === 1) return parseUniformLinearScalarExpression(shaderText, parts[0], seenAliases);
  }

  const alias = /^(tmpvar_\d+|cse_\d+)$/.exec(text);
  if (alias && !seenAliases.has(alias[1])) {
    const assignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (assignment) return parseUniformLinearScalarExpression(shaderText, assignment[1], new Set([...seenAliases, alias[1]]));
  }

  const vectorComponent = /^(.+)\.([xyzw])$/.exec(text);
  if (vectorComponent) return parseUniformLinearVectorComponentExpression(shaderText, vectorComponent[1], vectorComponent[2], seenAliases);

  const sum = splitTopLevelOperator(text, "+");
  if (sum) {
    const left = parseUniformLinearScalarExpression(shaderText, sum[0], seenAliases);
    const right = parseUniformLinearScalarExpression(shaderText, sum[1], seenAliases);
    return mergeUniformLinear(left, right);
  }

  const difference = splitTopLevelOperator(text, "-");
  if (difference) {
    const left = parseUniformLinearScalarExpression(shaderText, difference[0], seenAliases);
    const right = parseUniformLinearScalarExpression(shaderText, difference[1], seenAliases);
    return mergeUniformLinear(left, right, -1);
  }

  const product = splitTopLevelOperator(text, "*");
  if (product) {
    const left = parseUniformLinearScalarExpression(shaderText, product[0], seenAliases);
    const right = parseUniformLinearScalarExpression(shaderText, product[1], seenAliases);
    if (!left || !right) return null;
    if (!(left.terms || []).length) return scaleUniformLinear(right, left.offset || 0);
    if (!(right.terms || []).length) return scaleUniformLinear(left, right.offset || 0);
  }

  return null;
}

function parseUniformLinearVectorComponentExpression(shaderText, value, component, seenAliases = new Set()) {
  const text = stripOuterParens(value);
  const direct = parseUniformLinearScalarExpression(shaderText, text, seenAliases);
  if (direct) return direct;

  const vec3Call = balancedFunctionCallAtStart(text, "vec3");
  const componentIndex = vectorComponentIndex(component);
  if (vec3Call && !vec3Call.suffix && componentIndex >= 0) {
    const parts = splitTopLevelCommaList(vec3Call.content);
    const selected = parts.length === 1 ? parts[0] : parts[componentIndex];
    return selected ? parseUniformLinearScalarExpression(shaderText, selected, seenAliases) : null;
  }

  const alias = /^(tmpvar_\d+|cse_\d+)$/.exec(text);
  if (alias && !seenAliases.has(`${alias[1]}.${component}`)) {
    const nextSeen = new Set([...seenAliases, `${alias[1]}.${component}`]);
    const assignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\.${component}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (assignment) return parseUniformLinearScalarExpression(shaderText, assignment[1], nextSeen);
    const vectorAssignment = new RegExp(`\\b${escapeRegExp(alias[1])}(?:\\.xyz)?\\s*=\\s*([^;]+);`, "s").exec(shaderText);
    if (vectorAssignment) return parseUniformLinearVectorComponentExpression(shaderText, vectorAssignment[1], component, nextSeen);
  }

  const vectorComponent = /^(.+)\.([xyzw])$/.exec(text);
  if (vectorComponent) return parseUniformLinearVectorComponentExpression(shaderText, vectorComponent[1], vectorComponent[2], seenAliases);

  const sum = splitTopLevelOperator(text, "+");
  if (sum) {
    const left = parseUniformLinearVectorComponentExpression(shaderText, sum[0], component, seenAliases);
    const right = parseUniformLinearVectorComponentExpression(shaderText, sum[1], component, seenAliases);
    return mergeUniformLinear(left, right);
  }

  const difference = splitTopLevelOperator(text, "-");
  if (difference) {
    const left = parseUniformLinearVectorComponentExpression(shaderText, difference[0], component, seenAliases);
    const right = parseUniformLinearVectorComponentExpression(shaderText, difference[1], component, seenAliases);
    return mergeUniformLinear(left, right, -1);
  }

  const product = splitTopLevelOperator(text, "*");
  if (product) {
    const left = parseUniformLinearVectorComponentExpression(shaderText, product[0], component, seenAliases);
    const right = parseUniformLinearVectorComponentExpression(shaderText, product[1], component, seenAliases);
    if (!left || !right) return null;
    if (!(left.terms || []).length) return scaleUniformLinear(right, left.offset || 0);
    if (!(right.terms || []).length) return scaleUniformLinear(left, right.offset || 0);
  }

  return null;
}

function parseUniformAliasScaleOffsetBaseTerm(expression) {
  const product = splitTopLevelOperator(stripOuterParens(expression), "*");
  if (!product) return null;
  const left = stripOuterParens(product[0]);
  const right = stripOuterParens(product[1]);
  const leftBase = /^(var\d+)\.xy$/.exec(left);
  const rightBase = /^(var\d+)\.xy$/.exec(right);
  const baseVarying = leftBase?.[1] || rightBase?.[1] || "";
  if (!baseVarying) return null;
  const scaleAlias = /^(tmpvar_\d+|cse_\d+)$/.exec(leftBase ? right : left)?.[1] || "";
  return scaleAlias ? { baseVarying, scaleAlias } : null;
}

function extractUniformAliasScaleOffsetUvAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;
  for (const uvExpression of samplerTextureUvExpressions(text, sampler)) {
    const expression = stripOuterParens(uvExpression);
    const terms = splitTopLevelOperator(expression, "+");
    if (!terms) continue;

    const firstBase = parseUniformAliasScaleOffsetBaseTerm(terms[0]);
    const secondBase = parseUniformAliasScaleOffsetBaseTerm(terms[1]);
    const base = firstBase || secondBase;
    if (!base) continue;
    if (!varyingHasSource(varyingSources, base.baseVarying, "uv0")) continue;

    const offsetExpression = stripOuterParens(firstBase ? terms[1] : terms[0]);
    const offsetAlias = /^(tmpvar_\d+|cse_\d+)$/.exec(offsetExpression)?.[1] || "";
    if (!offsetAlias) continue;

    const scaleSources = uniformSourcesReferencedByExpression(text, vectorAliasComponentExpressions(text, base.scaleAlias).join(" "));
    const offsetSources = uniformSourcesReferencedByExpression(text, vectorAliasComponentExpressions(text, offsetAlias).join(" "));
    const sources = uniqueInOrder([...scaleSources, ...offsetSources]);
    if (sources.length !== 1) continue;
    const parsedScaleTerms = ["x", "y"].map((component) => parseUniformLinearVectorComponentExpression(text, base.scaleAlias, component));
    const parsedOffsetTerms = ["x", "y"].map((component) => parseUniformLinearVectorComponentExpression(text, offsetAlias, component));
    if ([...parsedScaleTerms, ...parsedOffsetTerms].some((component) => !component)) continue;
    const scaleTerms = parsedScaleTerms.map(normalizedUniformLinear);
    const offsetTerms = parsedOffsetTerms.map(normalizedUniformLinear);
    if ([...scaleTerms, ...offsetTerms].some((component) => !component || component.terms.some((term) => term.source !== sources[0]))) continue;

    return {
      mode: "uniformAliasScaleOffset",
      baseSampler: sampler,
      baseUvSource: `${base.baseVarying}.xy`,
      scaleAlias: base.scaleAlias,
      offsetAlias,
      phaseSource: sources[0],
      scaleTerms,
      offsetTerms,
    };
  }
  return null;
}

function parseRotationProduct(value) {
  const identifier = "(?:tmpvar_\\d+|cse_\\d+)";
  const text = stripOuterParens(value);
  const scalarTimesVector = new RegExp(`^(${identifier})\\s*\\*\\s*(tmpvar_\\d+)\\.([xy])$`).exec(text);
  if (scalarTimesVector) {
    return {
      scalar: scalarTimesVector[1],
      vector: scalarTimesVector[2],
      component: scalarTimesVector[3],
    };
  }
  const vectorTimesScalar = new RegExp(`^(tmpvar_\\d+)\\.([xy])\\s*\\*\\s*(${identifier})$`).exec(text);
  if (vectorTimesScalar) {
    return {
      scalar: vectorTimesScalar[3],
      vector: vectorTimesScalar[1],
      component: vectorTimesScalar[2],
    };
  }
  return null;
}

function parseRotatedUvOutputExpression(shaderText, expression, seenAliases = new Set()) {
  const uvText = stripOuterParens(expression);
  const variablePlusCenter = /^((?:tmpvar_\d+))\s*\+\s*vec2\s*\(([\s\S]+)\)$/.exec(uvText);
  if (variablePlusCenter) {
    const center = parseStaticVec2Numbers(variablePlusCenter[2]);
    return center ? { rotatedVariable: variablePlusCenter[1], center } : null;
  }

  const centerPlusVariable = /^vec2\s*\(([\s\S]+)\)\s*\+\s*((?:tmpvar_\d+))$/.exec(uvText);
  if (centerPlusVariable) {
    const center = parseStaticVec2Numbers(centerPlusVariable[1]);
    return center ? { rotatedVariable: centerPlusVariable[2], center } : null;
  }

  const alias = /^(tmpvar_\d+)$/.exec(uvText);
  if (!alias || seenAliases.has(alias[1])) return null;

  const directAssignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (directAssignment) {
    const output = parseRotatedUvOutputExpression(shaderText, directAssignment[1], new Set([...seenAliases, alias[1]]));
    if (output) return output;
  }

  const xAssignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\.x\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  const yAssignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\.y\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!xAssignment || !yAssignment) return null;

  const xExpression = stripOuterParens(xAssignment[1]);
  const yExpression = stripOuterParens(yAssignment[1]);
  const xFlip = /^1\.0\s*-\s*(tmpvar_\d+)\.x$/.exec(xExpression);
  const xDirect = /^(tmpvar_\d+)\.x$/.exec(xExpression);
  const yFlip = /^1\.0\s*-\s*(tmpvar_\d+)\.y$/.exec(yExpression);
  const yDirect = /^(tmpvar_\d+)\.y$/.exec(yExpression);
  const source = xFlip?.[1] || xDirect?.[1] || "";
  if (!source || source !== (yFlip?.[1] || yDirect?.[1] || "")) return null;

  const sourceAssignment = new RegExp(`\\b${escapeRegExp(source)}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!sourceAssignment) return null;

  const output = parseRotatedUvOutputExpression(shaderText, sourceAssignment[1], new Set([...seenAliases, alias[1]]));
  if (!output) return null;
  return {
    ...output,
    flipX: Boolean(output.flipX) !== Boolean(xFlip),
    flipY: Boolean(output.flipY) !== Boolean(yFlip),
  };

  return null;
}

function parseRotatedUvOffsetVectorExpression(shaderText, expression) {
  const text = stripOuterParens(expression);
  const vec2Scalar = /^vec2\s*\(([\s\S]+)\)$/.exec(text);
  if (vec2Scalar) {
    const scalar = parseScrollUvScalarExpression(vec2Scalar[1], shaderText);
    if (!scalar) return null;
    return {
      offset: [roundedNumber(scalar.offset), roundedNumber(scalar.offset)],
      speed: [roundedNumber(scalar.speed), roundedNumber(scalar.speed)],
      phaseSource: scalar.phaseSource,
    };
  }

  const sameComponentSwizzle = /^(var\d+)\.([xyzw])\2$/.exec(text);
  if (sameComponentSwizzle) {
    const scalar = parseScrollUvScalarExpression(`${sameComponentSwizzle[1]}.${sameComponentSwizzle[2]}`, shaderText);
    if (!scalar) return null;
    return {
      offset: [roundedNumber(scalar.offset), roundedNumber(scalar.offset)],
      speed: [roundedNumber(scalar.speed), roundedNumber(scalar.speed)],
      phaseSource: scalar.phaseSource,
    };
  }

  return null;
}

function parseRotatedUvRepeatScalarExpression(shaderText, expression) {
  const text = stripOuterParens(expression);
  const sameComponentSwizzle = /^(var\d+)\.([xyzw])\2$/.exec(text);
  if (sameComponentSwizzle) {
    return { offset: 0, terms: [{ source: `${sameComponentSwizzle[1]}.${sameComponentSwizzle[2]}`, scale: 1 }] };
  }
  return parseMultiPhaseLinearScalarExpression(text, shaderText);
}

function parseRotatedUvScaleTerm(shaderText, expression) {
  const product = splitTopLevelOperator(stripOuterParens(expression), "*");
  if (!product) return null;
  const left = stripOuterParens(product[0]);
  const right = stripOuterParens(product[1]);
  const leftBase = /^(var\d+)\.xy$/.exec(left);
  const rightBase = /^(var\d+)\.xy$/.exec(right);
  const baseVarying = leftBase?.[1] || rightBase?.[1] || "";
  if (!baseVarying) return null;
  const repeatExpression = leftBase ? right : left;
  const repeatScalar = parseRotatedUvRepeatScalarExpression(shaderText, repeatExpression);
  if (!repeatScalar) return null;
  const repeat = normalizedLinearComponent(repeatScalar);
  return {
    baseVarying,
    repeat: [repeat.offset, repeat.offset],
    repeatTerms: [repeat.terms, repeat.terms],
  };
}

function mergeLinearComponents(left, right, rightSign = 1) {
  const terms = [];
  const bySource = new Map();
  for (const term of [...(left.terms || []), ...(right.terms || []).map((item) => ({ ...item, scale: item.scale * rightSign }))]) {
    const previous = bySource.get(term.source);
    if (previous) previous.scale = roundedNumber(previous.scale + term.scale);
    else {
      const next = { source: term.source, scale: roundedNumber(term.scale) };
      terms.push(next);
      bySource.set(term.source, next);
    }
  }
  return {
    offset: roundedNumber((left.offset || 0) + rightSign * (right.offset || 0)),
    terms: terms.filter((term) => Math.abs(term.scale) >= 0.00001),
  };
}

function scaleLinearComponent(linear, scale) {
  return {
    offset: roundedNumber((linear.offset || 0) * scale),
    terms: (linear.terms || []).map((term) => ({ source: term.source, scale: roundedNumber(term.scale * scale) })),
  };
}

function parseRotatedUvScaledBaseExpression(shaderText, expression, center) {
  const centeredTerms = splitTopLevelOperator(stripOuterParens(expression), "+");
  if (!centeredTerms) return null;
  const leftScale = parseRotatedUvScaleTerm(shaderText, centeredTerms[0]);
  const rightScale = parseRotatedUvScaleTerm(shaderText, centeredTerms[1]);
  const scale = leftScale || rightScale;
  if (!scale) return null;

  const offsetExpression = leftScale ? centeredTerms[1] : centeredTerms[0];
  const offsetVector = parseMultiPhaseLinearVectorExpression(shaderText, offsetExpression);
  if (!offsetVector) return null;

  const preRotationOffset = [];
  const preRotationOffsetTerms = [];
  for (let index = 0; index < 2; index += 1) {
    const offsetComponent = normalizedLinearComponent(offsetVector[index]);
    const repeatComponent = { offset: scale.repeat[index], terms: scale.repeatTerms[index] };
    const centeredOffset = mergeLinearComponents(
      mergeLinearComponents(offsetComponent, scaleLinearComponent(repeatComponent, center[index])),
      { offset: center[index], terms: [] },
      -1,
    );
    preRotationOffset.push(centeredOffset.offset);
    preRotationOffsetTerms.push(centeredOffset.terms);
  }

  return {
    baseVarying: scale.baseVarying,
    center,
    repeat: scale.repeat,
    repeatTerms: scale.repeatTerms,
    preRotationOffset,
    preRotationOffsetTerms,
  };
}

function parseRotatedUvBaseExpression(shaderText, expression) {
  const text = stripOuterParens(expression);
  const directBase = /^(var\d+)\.xy\s*-\s*vec2\s*\(([\s\S]+)\)$/.exec(text);
  if (directBase) {
    const center = parseStaticVec2Numbers(directBase[2]);
    return center ? { baseVarying: directBase[1], center } : null;
  }

  const centeredTerms = splitTopLevelOperator(text, "-");
  if (!centeredTerms) return null;
  const centerMatch = /^vec2\s*\(([\s\S]+)\)$/.exec(stripOuterParens(centeredTerms[1]));
  if (!centerMatch) return null;
  const center = parseStaticVec2Numbers(centerMatch[1]);
  if (!center) return null;

  const scaledBase = parseRotatedUvScaledBaseExpression(shaderText, centeredTerms[0], center);
  if (scaledBase) return scaledBase;

  const scrolledBase = splitTopLevelOperator(stripOuterParens(centeredTerms[0]), "+");
  if (!scrolledBase) return null;
  const left = stripOuterParens(scrolledBase[0]);
  const right = stripOuterParens(scrolledBase[1]);
  const leftBase = /^(var\d+)\.xy$/.exec(left);
  const rightBase = /^(var\d+)\.xy$/.exec(right);
  const baseVarying = leftBase?.[1] || rightBase?.[1] || "";
  if (!baseVarying) return null;

  const offsetExpression = leftBase ? right : left;
  const offset = parseRotatedUvOffsetVectorExpression(shaderText, offsetExpression);
  if (!offset) return null;

  return {
    baseVarying,
    center,
    preRotationOffset: offset.offset,
    preRotationOffsetSpeed: offset.speed,
    preRotationPhaseSource: offset.phaseSource,
  };
}

function parseRotationPhaseExpression(text, sinVariable, cosVariable) {
  const sinAssignment = new RegExp(`\\b${escapeRegExp(sinVariable)}\\s*=\\s*sin\\s*\\(([^;]+)\\);`, "s").exec(text);
  const cosAssignment = new RegExp(`\\b${escapeRegExp(cosVariable)}\\s*=\\s*cos\\s*\\(([^;]+)\\);`, "s").exec(text);
  if (!sinAssignment || !cosAssignment) return null;

  const sinPhaseExpression = stripOuterParens(sinAssignment[1]);
  const cosPhaseExpression = stripOuterParens(cosAssignment[1]);
  if (sinPhaseExpression !== cosPhaseExpression) return null;

  const phase = parseScrollUvScalarExpression(sinPhaseExpression, text);
  if (phase?.phaseSource && Math.abs(phase.speed || 0) >= 0.00001) return phase;
  return rotatePhaseFromLinearTerms(parseMultiPhaseLinearScalarExpression(sinPhaseExpression, text));
}

function parseRotatedSampledDistortionBaseExpression(shaderText, expression, expectedCenter) {
  const centeredTerms = splitTopLevelOperator(stripOuterParens(expression), "-");
  if (!centeredTerms) return null;
  const centerMatch = /^vec2\s*\(([\s\S]+)\)$/.exec(stripOuterParens(centeredTerms[1]));
  if (!centerMatch) return null;
  const center = parseStaticVec2Numbers(centerMatch[1]);
  if (!center) return null;
  if (Math.abs(center[0] - expectedCenter[0]) > 0.00001 || Math.abs(center[1] - expectedCenter[1]) > 0.00001) return null;

  const uvTerms = splitTopLevelOperator(stripOuterParens(centeredTerms[0]), "+");
  if (!uvTerms) return null;
  const left = stripOuterParens(uvTerms[0]);
  const right = stripOuterParens(uvTerms[1]);
  const leftBase = /^(var\d+)\.xy$/.exec(left);
  const rightBase = /^(var\d+)\.xy$/.exec(right);
  const baseVarying = leftBase?.[1] || rightBase?.[1] || "";
  if (!baseVarying) return null;

  const vectorExpression = leftBase ? right : left;
  const vectorComponents = parseSampledDistortionVector(shaderText, vectorExpression);
  return vectorComponents ? { baseVarying, vectorComponents } : null;
}

function extractRotatedSampledDistortionUvAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;

  for (const uvExpression of samplerTextureUvExpressions(text, sampler)) {
    const output = parseRotatedUvOutputExpression(text, uvExpression);
    if (!output) continue;

    const rotatedName = escapeRegExp(output.rotatedVariable);
    const xAssignment = new RegExp(`\\b${rotatedName}\\.x\\s*=\\s*([^;]+);`, "s").exec(text);
    const yAssignment = new RegExp(`\\b${rotatedName}\\.y\\s*=\\s*([^;]+);`, "s").exec(text);
    if (!xAssignment || !yAssignment) continue;

    const xTerms = splitTopLevelOperator(stripOuterParens(xAssignment[1]), "-");
    const yTerms = splitTopLevelOperator(stripOuterParens(yAssignment[1]), "+");
    if (!xTerms || !yTerms) continue;
    const xLeft = parseRotationProduct(xTerms[0]);
    const xRight = parseRotationProduct(xTerms[1]);
    const yLeft = parseRotationProduct(yTerms[0]);
    const yRight = parseRotationProduct(yTerms[1]);
    if (!xLeft || !xRight || !yLeft || !yRight) continue;
    if (xLeft.vector !== xRight.vector || xLeft.vector !== yLeft.vector || xLeft.vector !== yRight.vector) continue;
    if (xLeft.component !== "x" || xRight.component !== "y" || yLeft.component !== "x" || yRight.component !== "y") continue;
    if (xRight.scalar !== yLeft.scalar || xLeft.scalar !== yRight.scalar) continue;

    const baseAssignment = new RegExp(`\\b${escapeRegExp(xLeft.vector)}\\s*=\\s*([^;]+);`, "s").exec(text);
    if (!baseAssignment) continue;
    const base = parseRotatedSampledDistortionBaseExpression(text, baseAssignment[1], output.center);
    if (!base) continue;
    if (!varyingHasSource(varyingSources, base.baseVarying, "uv0")) continue;

    const phase = parseRotationPhaseExpression(text, xRight.scalar, xLeft.scalar);
    if (!phase) continue;
    const rotationPhaseSources = phase.phaseSources || [phase.phaseSource];
    if (!allPhaseSourcesUseVaryingSource(rotationPhaseSources, varyingSources, "vertexColor")) continue;

    const sampled = buildSampledDistortionUvAnimation(text, sampler, `${base.baseVarying}.xy`, base.vectorComponents, varyingSources);
    if (!sampled) continue;
    const phaseSources = uniqueInOrder([...(sampled.phaseSources || []), sampled.phaseSource, ...rotationPhaseSources].filter(Boolean));

    return {
      ...sampled,
      center: output.center,
      rotationOffset: roundedNumber(phase.offset || 0),
      rotationSpeed: roundedNumber(phase.speed),
      rotationPhaseSource: phase.phaseSource,
      ...(phaseSources.length ? { phaseSources } : {}),
    };
  }

  return null;
}

function parseSampledRotationAngleExpression(shaderText, expression) {
  const text = stripOuterParens(expression);
  for (const parts of [splitTopLevelOperator(text, "*")].filter(Boolean)) {
    const left = stripOuterParens(parts[0]);
    const right = stripOuterParens(parts[1]);
    for (const [sampleExpression, amplitudeExpression] of [[left, right], [right, left]]) {
      const sampled = parseTexture2DSampledScalarExpression(sampleExpression);
      if (!sampled) continue;
      const amplitudeFactor = parseSampledDistortionScalarFactor(amplitudeExpression, shaderText);
      if (amplitudeFactor?.kind === "phase") {
        return {
          rotationSampler: sampled.distortionSampler,
          rotationChannel: sampled.distortionChannel,
          rotationUvSource: sampled.distortionUvSource,
          rotationScale: 1,
          phaseSource: amplitudeFactor.source,
        };
      }
      const amplitudeParts = splitTopLevelOperator(amplitudeExpression, "*");
      if (!amplitudeParts) continue;
      const amplitudeLeft = parseSampledDistortionScalarFactor(amplitudeParts[0], shaderText);
      const amplitudeRight = parseSampledDistortionScalarFactor(amplitudeParts[1], shaderText);
      const phase = amplitudeLeft?.kind === "phase" ? amplitudeLeft : amplitudeRight?.kind === "phase" ? amplitudeRight : null;
      const scale = amplitudeLeft?.kind === "number" ? amplitudeLeft.value : amplitudeRight?.kind === "number" ? amplitudeRight.value : null;
      if (!phase || !Number.isFinite(scale)) continue;
      return {
        rotationSampler: sampled.distortionSampler,
        rotationChannel: sampled.distortionChannel,
        rotationUvSource: sampled.distortionUvSource,
        rotationScale: roundedNumber(scale),
        phaseSource: phase.source,
      };
    }
  }
  const alias = /^(tmpvar_\d+|cse_\d+)$/.exec(text);
  if (!alias) return null;
  const assignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  return assignment ? parseSampledRotationAngleExpression(shaderText, assignment[1]) : null;
}

function parseSampledRotatedUvOffsetAxis(shaderText, expression, angleVariable) {
  const text = stripOuterParens(expression);
  const alias = /^(tmpvar_\d+)$/.exec(text);
  if (!alias) return null;
  const xAssignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\.x\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  const yAssignment = new RegExp(`\\b${escapeRegExp(alias[1])}\\.y\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!xAssignment || !yAssignment) return null;
  const componentAxis = [xAssignment[1], yAssignment[1]].map((componentExpression) => {
    const component = stripOuterParens(componentExpression);
    if (component === angleVariable) return 1;
    const numeric = parseShaderNumberLiteral(component);
    return Number.isFinite(numeric) && Math.abs(numeric) < 0.00001 ? 0 : null;
  });
  return componentAxis.every((value) => Number.isFinite(value)) ? componentAxis : null;
}

function parseSampledRotatedUvBaseExpression(shaderText, expression, angleVariable) {
  const text = stripOuterParens(expression);
  const centeredTerms = splitTopLevelOperator(text, "-");
  if (!centeredTerms) return null;
  const centerMatch = /^vec2\s*\(([\s\S]+)\)$/.exec(stripOuterParens(centeredTerms[1]));
  if (!centerMatch) return null;
  const center = parseStaticVec2Numbers(centerMatch[1]);
  if (!center) return null;

  const offsetTerms = splitTopLevelOperator(stripOuterParens(centeredTerms[0]), "+");
  if (!offsetTerms) return null;
  const left = stripOuterParens(offsetTerms[0]);
  const right = stripOuterParens(offsetTerms[1]);
  const leftBase = /^(var\d+)\.xy$/.exec(left);
  const rightBase = /^(var\d+)\.xy$/.exec(right);
  const baseVarying = leftBase?.[1] || rightBase?.[1] || "";
  if (!baseVarying) return null;
  const offsetExpression = leftBase ? right : left;
  const preRotationAxis = parseSampledRotatedUvOffsetAxis(shaderText, offsetExpression, angleVariable);
  if (!preRotationAxis) return null;
  return { baseVarying, center, preRotationAxis };
}

function extractSampledRotatedUvAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;

  for (const uvExpression of samplerTextureUvExpressions(text, sampler)) {
    const output = parseRotatedUvOutputExpression(text, uvExpression);
    if (!output) continue;

    const rotatedName = escapeRegExp(output.rotatedVariable);
    const xAssignment = new RegExp(`\\b${rotatedName}\\.x\\s*=\\s*([^;]+);`, "s").exec(text);
    const yAssignment = new RegExp(`\\b${rotatedName}\\.y\\s*=\\s*([^;]+);`, "s").exec(text);
    if (!xAssignment || !yAssignment) continue;

    const xTerms = splitTopLevelOperator(stripOuterParens(xAssignment[1]), "-");
    const yTerms = splitTopLevelOperator(stripOuterParens(yAssignment[1]), "+");
    if (!xTerms || !yTerms) continue;
    const xLeft = parseRotationProduct(xTerms[0]);
    const xRight = parseRotationProduct(xTerms[1]);
    const yLeft = parseRotationProduct(yTerms[0]);
    const yRight = parseRotationProduct(yTerms[1]);
    if (!xLeft || !xRight || !yLeft || !yRight) continue;
    if (xLeft.vector !== xRight.vector || xLeft.vector !== yLeft.vector || xLeft.vector !== yRight.vector) continue;
    if (xLeft.component !== "x" || xRight.component !== "y" || yLeft.component !== "x" || yRight.component !== "y") continue;
    if (xRight.scalar !== yLeft.scalar || xLeft.scalar !== yRight.scalar) continue;

    const sinAssignment = new RegExp(`\\b${escapeRegExp(xRight.scalar)}\\s*=\\s*sin\\s*\\(([^;]+)\\);`, "s").exec(text);
    const cosAssignment = new RegExp(`\\b${escapeRegExp(xLeft.scalar)}\\s*=\\s*cos\\s*\\(([^;]+)\\);`, "s").exec(text);
    if (!sinAssignment || !cosAssignment) continue;
    const angleVariable = stripOuterParens(sinAssignment[1]);
    if (angleVariable !== stripOuterParens(cosAssignment[1])) continue;

    const angle = parseSampledRotationAngleExpression(text, angleVariable);
    if (!angle) continue;
    const baseAssignment = new RegExp(`\\b${escapeRegExp(xLeft.vector)}\\s*=\\s*([^;]+);`, "s").exec(text);
    if (!baseAssignment) continue;
    const base = parseSampledRotatedUvBaseExpression(text, baseAssignment[1], angleVariable);
    if (!base) continue;
    if (Math.abs(base.center[0] - output.center[0]) > 0.00001 || Math.abs(base.center[1] - output.center[1]) > 0.00001) {
      continue;
    }

    const rotationVarying = /^var\d+/.exec(angle.rotationUvSource)?.[0] || "";
    const phaseVarying = /^var\d+/.exec(angle.phaseSource)?.[0] || "";
    if (!varyingHasSource(varyingSources, base.baseVarying, "uv0")) continue;
    if (!varyingHasSource(varyingSources, rotationVarying, "uv0")) continue;
    if (!varyingHasSource(varyingSources, phaseVarying, "vertexColor")) continue;

    return {
      mode: "sampledRotate",
      baseSampler: sampler,
      rotationSampler: angle.rotationSampler,
      rotationChannel: angle.rotationChannel,
      baseUvSource: `${base.baseVarying}.xy`,
      rotationUvSource: angle.rotationUvSource,
      center: output.center,
      rotationScale: angle.rotationScale,
      phaseSource: angle.phaseSource,
      preRotationAxis: base.preRotationAxis,
    };
  }

  return null;
}

function extractRotatedUvAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;

  for (const uvExpression of samplerTextureUvExpressions(text, sampler)) {
    const output = parseRotatedUvOutputExpression(text, uvExpression);
    if (!output) continue;

    const rotatedName = escapeRegExp(output.rotatedVariable);
    const xAssignment = new RegExp(`\\b${rotatedName}\\.x\\s*=\\s*([^;]+);`, "s").exec(text);
    const yAssignment = new RegExp(`\\b${rotatedName}\\.y\\s*=\\s*([^;]+);`, "s").exec(text);
    if (!xAssignment || !yAssignment) continue;

    const xTerms = splitTopLevelOperator(stripOuterParens(xAssignment[1]), "-");
    const yTerms = splitTopLevelOperator(stripOuterParens(yAssignment[1]), "+");
    if (!xTerms || !yTerms) continue;

    const xLeft = parseRotationProduct(xTerms[0]);
    const xRight = parseRotationProduct(xTerms[1]);
    const yLeft = parseRotationProduct(yTerms[0]);
    const yRight = parseRotationProduct(yTerms[1]);
    if (!xLeft || !xRight || !yLeft || !yRight) continue;
    if (xLeft.vector !== xRight.vector || xLeft.vector !== yLeft.vector || xLeft.vector !== yRight.vector) continue;
    if (xLeft.component !== "x" || xRight.component !== "y" || yLeft.component !== "x" || yRight.component !== "y") continue;
    if (xRight.scalar !== yLeft.scalar || xLeft.scalar !== yRight.scalar) continue;

    const baseAssignment = new RegExp(`\\b${escapeRegExp(xLeft.vector)}\\s*=\\s*([^;]+);`, "s").exec(text);
    if (!baseAssignment) continue;
    const base = parseRotatedUvBaseExpression(text, baseAssignment[1]);
    if (!base) continue;
    if (Math.abs(base.center[0] - output.center[0]) > 0.00001 || Math.abs(base.center[1] - output.center[1]) > 0.00001) {
      continue;
    }
    if (!varyingHasSource(varyingSources, base.baseVarying, "uv0")) continue;

    const phase = parseRotationPhaseExpression(text, xRight.scalar, xLeft.scalar);
    if (!phase) continue;
    const phaseSources = phase.phaseSources || [phase.phaseSource];
    if (!allPhaseSourcesUseVaryingSource(phaseSources, varyingSources, "vertexColor")) continue;
    if (!allLinearTermsUseVaryingSource([...(base.repeatTerms || []), ...(base.preRotationOffsetTerms || [])], varyingSources, "vertexColor")) {
      continue;
    }
    if (base.preRotationPhaseSource && base.preRotationPhaseSource !== phase.phaseSource) continue;

    return {
      mode: "rotate",
      center: output.center,
      rotationOffset: roundedNumber(phase.offset || 0),
      rotationSpeed: roundedNumber(phase.speed),
      phaseSource: phase.phaseSource,
      ...(phase.phaseSources ? { phaseSources: phase.phaseSources } : {}),
      ...(phase.rotationPhaseTerms ? { rotationPhaseTerms: phase.rotationPhaseTerms } : {}),
      ...(base.repeat ? { repeat: base.repeat } : {}),
      ...(base.repeatTerms ? { repeatTerms: base.repeatTerms } : {}),
      ...(base.preRotationOffset ? { preRotationOffset: base.preRotationOffset } : {}),
      ...(base.preRotationOffsetSpeed ? { preRotationOffsetSpeed: base.preRotationOffsetSpeed } : {}),
      ...(base.preRotationOffsetTerms ? { preRotationOffsetTerms: base.preRotationOffsetTerms } : {}),
      ...(output.flipX ? { flipX: true } : {}),
      ...(output.flipY ? { flipY: true } : {}),
    };
  }

  return null;
}

function allPhaseSourcesUseVaryingSource(phaseSources, varyingSources, source) {
  return phaseSources.every((phaseSource) => {
    const varying = /^var\d+/.exec(phaseSource)?.[0] || "";
    return varyingHasSource(varyingSources, varying, source);
  });
}

function allPhaseSourcesUseVaryingSourceOrUniform(phaseSources, varyingSources, source) {
  return phaseSources.every((phaseSource) => {
    if (/^uniform:unif\d+$/.test(String(phaseSource || ""))) return true;
    const varying = /^var\d+/.exec(phaseSource)?.[0] || "";
    return varyingHasSource(varyingSources, varying, source);
  });
}

function allLinearTermsUseVaryingSource(termGroups, varyingSources, source) {
  return (termGroups || []).flat().every((term) => {
    const varying = /^var\d+/.exec(term?.source || "")?.[0] || "";
    return varyingHasSource(varyingSources, varying, source);
  });
}

function extractScrollUvAnimation(text, sampler, varyingSources = {}) {
  if (!text || !sampler) return null;
  const samplerName = escapeRegExp(sampler);
  const textureMatch = new RegExp(
    `texture2D\\s*\\(\\s*${samplerName}\\s*,[\\s\\S]{0,180}?\\b(?:var\\d+|tmpvar_\\d+)\\.xy\\s*([+\\-])\\s*(tmpvar_\\d+)`,
    "s",
  ).exec(text);
  if (!textureMatch) return null;

  const sign = textureMatch[1] === "-" ? -1 : 1;
  const offsetVariable = textureMatch[2];
  const x = parseScrollUvComponent(text, offsetVariable, "x");
  const y = parseScrollUvComponent(text, offsetVariable, "y");
  if (!x || !y) return null;

  const phaseSources = [...new Set([x.phaseSource, y.phaseSource].filter(Boolean))];
  const phaseSource = phaseSources[0] || "";
  if (phaseSources.length > 1 && !allPhaseSourcesUseVaryingSource(phaseSources, varyingSources, "vertexColor")) return null;

  const speed = [roundedNumber(x.speed * sign), roundedNumber(y.speed * sign)];
  const offset = [roundedNumber(x.offset * sign), roundedNumber(y.offset * sign)];
  const hasSpeed = Math.abs(speed[0]) >= 0.00001 || Math.abs(speed[1]) >= 0.00001;
  const hasOffset = Math.abs(offset[0]) >= 0.00001 || Math.abs(offset[1]) >= 0.00001;
  if (hasSpeed && !phaseSources.length) return null;
  if (!hasSpeed && !hasOffset) return null;

  const result = {
    mode: "scroll",
    speed,
    offset,
    offsetVariable,
    phaseSource: phaseSources.length > 1 ? phaseSources.join("|") : phaseSource,
  };
  if (phaseSources.length > 1) result.phaseSources = phaseSources;
  return result;
}

function extractVec2ScrollUvAnimation(text, sampler, varyingSources = {}) {
  for (const uvExpression of samplerTextureUvExpressionsWithDirectAliases(text, sampler)) {
    const parsed = parseDirectScrollUvExpression(text, uvExpression, varyingSources, { allowVectorAliases: true });
    if (!parsed) continue;
    return {
      mode: "scroll",
      speed: parsed.speed,
      offset: parsed.offset,
      offsetVariable: parsed.offsetVariable,
      phaseSource: parsed.phaseSource,
      ...(parsed.baseUvSourceMapped ? { baseUvSource: parsed.baseUvSource } : {}),
    };
  }
  return null;
}

function parseVectorSwizzleScrollComponents(text, vectorExpression, swizzle) {
  if (!/^[xyzw]{2}$/.test(swizzle)) return null;
  const x = parseVectorComponentScrollExpression(vectorExpression, swizzle[0], text, new Set());
  const y = parseVectorComponentScrollExpression(vectorExpression, swizzle[1], text, new Set());
  if (!x || !y) return null;

  const phaseSources = [x.phaseSource, y.phaseSource].filter(Boolean);
  const phaseSource = phaseSources[0] || "";
  if (phaseSources.some((source) => source !== phaseSource)) return null;

  const speed = [roundedNumber(x.speed), roundedNumber(y.speed)];
  const offset = [roundedNumber(x.offset), roundedNumber(y.offset)];
  const hasSpeed = Math.abs(speed[0]) >= 0.00001 || Math.abs(speed[1]) >= 0.00001;
  const hasOffset = Math.abs(offset[0]) >= 0.00001 || Math.abs(offset[1]) >= 0.00001;
  if (hasSpeed && !phaseSource) return null;
  if (!hasSpeed && !hasOffset) return null;

  return { speed, offset, phaseSource };
}

function parseScrollUvScalarExpressionWithVectorAliases(value, shaderText, seenAliases = new Set()) {
  const text = stripOuterParens(value);
  const fractCall = balancedFunctionCallAtStart(text, "fract");
  if (fractCall && !fractCall.suffix) {
    const parsed = parseScrollUvScalarExpressionWithVectorAliases(fractCall.content, shaderText, seenAliases);
    return parsed?.phaseSource ? { ...parsed, wraps: true } : null;
  }

  const parsed = parseScrollUvScalarExpression(value, shaderText, seenAliases);
  if (parsed) return parsed;

  const vectorComponent = /^(.+)\.([xyzw])$/.exec(text);
  if (vectorComponent && !/^(tmpvar_\d+|cse_\d+)\.[xyzw]$/.test(text)) {
    const resolved = parseVectorComponentScrollExpression(vectorComponent[1], vectorComponent[2], shaderText, seenAliases);
    if (resolved) return resolved;
  }

  const component = /^(tmpvar_\d+|cse_\d+)\.([xyzw])$/.exec(text);
  if (!component || seenAliases.has(`${component[1]}.${component[2]}`)) return null;

  const nextSeenAliases = new Set(seenAliases);
  nextSeenAliases.add(`${component[1]}.${component[2]}`);
  const componentAssignmentPattern = new RegExp(
    `\\b${escapeRegExp(component[1])}\\.${component[2]}\\s*=\\s*([^;]+);`,
    "gs",
  );
  const componentCandidates = [];
  let componentAssignment;
  while ((componentAssignment = componentAssignmentPattern.exec(shaderText))) {
    componentCandidates.push(parseScrollUvScalarExpressionWithVectorAliases(componentAssignment[1], shaderText, nextSeenAliases));
  }
  const componentResolved = unambiguousParsedScrollCandidate(componentCandidates);
  if (componentResolved) {
    return componentResolved;
  }

  const vectorAssignmentPattern = new RegExp(`\\b${escapeRegExp(component[1])}\\s*=\\s*([^;]+);`, "gs");
  let vectorAssignment;
  while ((vectorAssignment = vectorAssignmentPattern.exec(shaderText))) {
    const resolved = parseScrollUvScalarExpressionWithVectorAliases(
      `${vectorAssignment[1]}.${component[2]}`,
      shaderText,
      nextSeenAliases,
    );
    if (resolved) return resolved;
  }
  return null;
}

function parseMultiScrollVectorComponents(text, vectorExpression, swizzle) {
  if (!/^[xyzw]{2}$/.test(swizzle)) return null;
  const x = parseScrollUvScalarExpressionWithVectorAliases(`${stripOuterParens(vectorExpression)}.${swizzle[0]}`, text);
  const y = parseScrollUvScalarExpressionWithVectorAliases(`${stripOuterParens(vectorExpression)}.${swizzle[1]}`, text);
  if (!x || !y) return null;

  const phaseSources = [x.phaseSource, y.phaseSource].filter(Boolean);
  const phaseSource = phaseSources[0] || "";
  if (phaseSources.some((source) => source !== phaseSource)) return null;

  const speed = [roundedNumber(x.speed), roundedNumber(y.speed)];
  const offset = [roundedNumber(x.offset), roundedNumber(y.offset)];
  const hasSpeed = Math.abs(speed[0]) >= 0.00001 || Math.abs(speed[1]) >= 0.00001;
  const hasOffset = Math.abs(offset[0]) >= 0.00001 || Math.abs(offset[1]) >= 0.00001;
  if (hasSpeed && !phaseSource) return null;
  if (!hasSpeed && !hasOffset) return null;
  return { speed, offset, phaseSource };
}

function multiScrollPhaseSourcesAreCompatible(shaderText, phaseSources) {
  if (phaseSources.length === 1) return true;
  const uniformNames = phaseSources
    .map((source) => /^uniform:(unif\d+)$/.exec(String(source || ""))?.[1] || "")
    .filter(Boolean);
  if (uniformNames.length !== phaseSources.length) return false;
  const worldTimeCount = (String(shaderText || "").match(/World\.Time/g) || []).length;
  return worldTimeCount >= uniformNames.length;
}

function parseDirectScrollUvExpression(text, uvExpression, varyingSources = {}, { allowVectorAliases = false } = {}) {
  const expression = stripOuterParens(uvExpression);
  const plusTerms = splitTopLevelOperator(expression, "+");
  const minusTerms = plusTerms ? null : splitTopLevelOperator(expression, "-");
  const terms = plusTerms || minusTerms;
  if (!terms) return null;

  const leftBase = /^(var\d+)\.xy$/.exec(stripOuterParens(terms[0]));
  const rightBase = /^(var\d+)\.xy$/.exec(stripOuterParens(terms[1]));
  const baseVarying = leftBase?.[1] || rightBase?.[1] || "";
  const baseUvSourceMapped = varyingHasSource(varyingSources, baseVarying, "uv0");
  if (!baseVarying || (!baseUvSourceMapped && !varyingHasSourceOrNoMapping(varyingSources, baseVarying, "uv0"))) return null;

  const vectorTerm = stripOuterParens(leftBase ? terms[1] : terms[0]);
  const vectorMatch = /^(.+)\.([xyzw]{2})$/.exec(vectorTerm);
  const vectorExpression = vectorMatch ? vectorMatch[1] : vectorTerm;
  const swizzle = vectorMatch ? vectorMatch[2] : "xy";
  const components = allowVectorAliases
    ? parseMultiScrollVectorComponents(text, vectorExpression, swizzle)
    : parseVectorSwizzleScrollComponents(text, vectorExpression, swizzle);
  if (!components) return null;

  const sign = minusTerms && leftBase ? -1 : 1;
  return {
    baseUvSource: `${baseVarying}.xy`,
    speed: components.speed.map((value) => roundedNumber(value * sign)),
    offset: components.offset.map((value) => roundedNumber(value * sign)),
    phaseSource: components.phaseSource,
    offsetVariable: previewScrollOffsetVariable(vectorTerm, vectorMatch, swizzle),
    baseUvSourceMapped,
  };
}

function multiScrollSampleChannelForSuffix(suffix) {
  if (!suffix || suffix === "xyz") return "rgb";
  if (suffix === "xxx") return "x";
  return "";
}

function textureSampleWeight(text, sample) {
  const sampler = escapeRegExp(sample.sampler);
  const uvExpression = escapeRegExp(sample.uvExpression);
  const suffix = sample.suffix ? `\\s*\\.${escapeRegExp(sample.suffix)}` : "";
  const textureExpression = `texture2D\\s*\\(\\s*${sampler}\\s*,\\s*${uvExpression}\\s*\\)${suffix}`;
  const sampleTimesScalar = new RegExp(`${textureExpression}\\s*\\*\\s*(${shaderNumberPattern})`, "s").exec(text);
  if (sampleTimesScalar) return roundedNumber(sampleTimesScalar[1]);
  const scalarTimesSample = new RegExp(`(${shaderNumberPattern})\\s*\\*\\s*${textureExpression}`, "s").exec(text);
  if (scalarTimesSample) return roundedNumber(scalarTimesSample[1]);
  return 1;
}

function extractSameTextureAdditiveMultiScrollUvAnimation(text, roles, samplerToHash = {}, varyingSources = {}) {
  if (!roles?.uvAnimation?.hash) return null;
  const samples = samplerTextureUvExpressionItems(text).filter((item) => samplerToHash[item.sampler]);
  if (samples.length < 2 || samples.length > 4) return null;
  if (samples.some((sample) => !multiScrollSampleChannelForSuffix(sample.suffix))) return null;

  const hashes = uniqueInOrder(samples.map((item) => samplerToHash[item.sampler]));
  if (hashes.length !== 1 || hashes[0] !== roles.uvAnimation.hash) return null;

  const parsedSamples = [];
  for (const sample of samples) {
    const parsed = parseDirectScrollUvExpression(text, sample.uvExpression, varyingSources, { allowVectorAliases: true });
    if (!parsed) return null;
    parsedSamples.push({
      sampler: sample.sampler,
      channel: multiScrollSampleChannelForSuffix(sample.suffix),
      weight: textureSampleWeight(text, sample),
      ...parsed,
    });
  }

  const phaseSources = uniqueInOrder(parsedSamples.map((sample) => sample.phaseSource).filter(Boolean));
  if (!phaseSources.length || !multiScrollPhaseSourcesAreCompatible(text, phaseSources)) return null;

  return {
    mode: "multiScrollAdditive",
    textureHash: hashes[0],
    samplers: parsedSamples.map((sample) => sample.sampler),
    sampleCount: parsedSamples.length,
    samples: parsedSamples.map((sample) => ({
      speed: sample.speed,
      offset: sample.offset,
      baseUvSource: sample.baseUvSource,
      offsetVariable: sample.offsetVariable,
      channel: sample.channel,
      weight: sample.weight,
    })),
    phaseSource: phaseSources.join("|"),
    ...(phaseSources.length > 1 ? { phaseSources } : {}),
  };
}

function hasUnsupportedSameTextureMultiSampleUvAnimation(text, roles, samplerToHash = {}) {
  if (!roles?.uvAnimation?.hash) return false;
  const samples = samplerTextureUvExpressionItems(text).filter((item) => samplerToHash[item.sampler]);
  if (samples.length < 2) return false;
  const hashes = uniqueInOrder(samples.map((item) => samplerToHash[item.sampler]));
  if (hashes.length !== 1 || hashes[0] !== roles.uvAnimation.hash) return false;
  return samples.some((sample) => !multiScrollSampleChannelForSuffix(sample.suffix));
}

function extractVectorSwizzleProductScrollUvAnimation(text, sampler, varyingSources = {}) {
  for (const uvExpression of samplerTextureUvExpressionsWithSimpleAliases(text, sampler)) {
    const expression = stripOuterParens(uvExpression);
    const plusTerms = splitTopLevelOperator(expression, "+");
    const minusTerms = plusTerms ? null : splitTopLevelOperator(expression, "-");
    const sum = plusTerms || minusTerms;
    if (!sum) continue;

    const leftBase = /^(var\d+)\.xy$/.exec(stripOuterParens(sum[0]));
    const rightBase = /^(var\d+)\.xy$/.exec(stripOuterParens(sum[1]));
    const baseVarying = leftBase?.[1] || rightBase?.[1] || "";
    if (!baseVarying || !varyingHasSource(varyingSources, baseVarying, "uv0")) continue;

    const vectorTerm = stripOuterParens(leftBase ? sum[1] : sum[0]);
    const vectorMatch = /^(.+)\.([xyzw]{2})$/.exec(vectorTerm);
    if (!vectorMatch) continue;

    const components = parseVectorSwizzleScrollComponents(text, vectorMatch[1], vectorMatch[2]);
    if (!components) continue;
    const sign = minusTerms && leftBase ? -1 : 1;
    return {
      mode: "scroll",
      speed: components.speed.map((value) => roundedNumber(value * sign)),
      offset: components.offset.map((value) => roundedNumber(value * sign)),
      offsetVariable: `vectorSwizzle.${vectorMatch[2]}`,
      phaseSource: components.phaseSource,
    };
  }
  return null;
}

function extractVectorSwizzleScrollUvAnimation(text, sampler, varyingSources = {}) {
  for (const uvExpression of samplerTextureUvExpressionsWithSimpleAliases(text, sampler)) {
    const expression = stripOuterParens(uvExpression);
    const match = /\b(var\d+)\.xy\s*([+\-])\s*(var\d+)\.xy\b/.exec(expression);
    if (!match) continue;

    const left = match[1];
    const sign = match[2] === "-" ? -1 : 1;
    const right = match[3];
    let phaseSource = "";
    let phaseSign = 1;

    if (varyingHasSource(varyingSources, left, "uv0") && varyingHasSource(varyingSources, right, "vertexColor")) {
      phaseSource = right;
      phaseSign = sign;
    } else if (
      sign > 0 &&
      varyingHasSource(varyingSources, right, "uv0") &&
      varyingHasSource(varyingSources, left, "vertexColor")
    ) {
      phaseSource = left;
      phaseSign = 1;
    } else {
      continue;
    }

    return {
      mode: "scroll",
      speed: [phaseSign, phaseSign],
      offset: [0, 0],
      offsetVariable: `${phaseSource}.xy`,
      phaseSource: `${phaseSource}.xy`,
      phaseSources: [`${phaseSource}.x`, `${phaseSource}.y`],
    };
  }
  return null;
}

function extractCenteredScaleUvAnimation(text, sampler, varyingSources = {}) {
  for (const uvExpression of samplerTextureUvExpressionsWithSimpleAliases(text, sampler)) {
    const expression = stripOuterParens(uvExpression);
    const match = new RegExp(
      `\\(?\\s*(var\\d+)\\.xy\\s*\\*\\s*(var\\d+)\\.([xyzw])\\3\\s*\\)?\\s*\\+\\s*vec2\\s*\\(\\s*\\(?\\s*\\(?\\s*1\\.0\\s*-\\s*\\2\\.\\3\\s*\\)?\\s*\\*\\s*(${shaderNumberPattern})\\s*\\)?\\s*\\)`,
      "s",
    ).exec(expression);
    if (!match) continue;

    const uvVarying = match[1];
    const scaleVarying = match[2];
    const scaleComponent = match[3];
    const center = roundedNumber(match[4]);
    if (!varyingHasSource(varyingSources, uvVarying, "uv0")) continue;
    if (!varyingHasSource(varyingSources, scaleVarying, "vertexColor")) continue;
    if (!Number.isFinite(center) || center <= 0 || center > 1) continue;

    return {
      mode: "centerScale",
      center: [center, center],
      speed: [1, 1],
      offset: [0, 0],
      phaseSource: `${scaleVarying}.${scaleComponent}`,
    };
  }
  return null;
}

function parseCenteredScaleProductTerm(shaderText, expression) {
  const product = splitTopLevelOperator(stripOuterParens(expression), "*");
  if (!product) return null;
  const left = stripOuterParens(product[0]);
  const right = stripOuterParens(product[1]);
  const leftBase = /^(var\d+)\.xy$/.exec(left);
  const rightBase = /^(var\d+)\.xy$/.exec(right);
  const baseVarying = leftBase?.[1] || rightBase?.[1] || "";
  if (!baseVarying) return null;
  const scaleExpression = leftBase ? right : left;
  const scaleVec2 = /^vec2\s*\(([\s\S]+)\)$/.exec(stripOuterParens(scaleExpression));
  if (!scaleVec2) return null;
  const scaleParts = splitTopLevelCommaList(scaleVec2[1]);
  if (scaleParts.length !== 1) return null;
  const phase = parsePoweredPhaseScalarExpression(scaleParts[0], shaderText);
  return phase ? { baseVarying, phase } : null;
}

function parseCenteredScaleOffsetTerm(shaderText, expression, expectedPhase) {
  const vec2Match = /^vec2\s*\(([\s\S]+)\)$/.exec(stripOuterParens(expression));
  if (!vec2Match) return null;
  const parts = splitTopLevelCommaList(vec2Match[1]);
  if (parts.length !== 1) return null;

  const product = splitTopLevelOperator(stripOuterParens(parts[0]), "*");
  if (!product) return null;
  const leftNumber = parseShaderNumberLiteral(product[0]);
  const rightNumber = parseShaderNumberLiteral(product[1]);
  const center = Number.isFinite(leftNumber) ? leftNumber : rightNumber;
  const oneMinusExpression = Number.isFinite(leftNumber) ? product[1] : product[0];
  if (!Number.isFinite(center) || center <= 0 || center > 1) return null;

  const difference = splitTopLevelOperator(stripOuterParens(oneMinusExpression), "-");
  if (!difference || parseShaderNumberLiteral(difference[0]) !== 1) return null;
  const phase = parsePoweredPhaseScalarExpression(difference[1], shaderText);
  if (!samePoweredPhase(phase, expectedPhase)) return null;
  return roundedNumber(center);
}

function extractPoweredCenteredScaleUvAnimation(text, sampler, varyingSources = {}) {
  for (const uvExpression of samplerTextureUvExpressions(text, sampler)) {
    const expression = stripOuterParens(uvExpression);
    const terms = splitTopLevelOperator(expression, "+");
    if (!terms) continue;

    const firstBase = parseCenteredScaleProductTerm(text, terms[0]);
    const secondBase = parseCenteredScaleProductTerm(text, terms[1]);
    const base = firstBase || secondBase;
    if (!base) continue;
    if (!varyingHasSource(varyingSources, base.baseVarying, "uv0")) continue;
    if (!allPhaseSourcesUseVaryingSource([base.phase.phaseSource], varyingSources, "vertexColor")) continue;

    const offsetExpression = firstBase ? terms[1] : terms[0];
    const center = parseCenteredScaleOffsetTerm(text, offsetExpression, base.phase);
    if (!Number.isFinite(center)) continue;

    return {
      mode: "centerScale",
      center: [center, center],
      speed: [1, 1],
      offset: [0, 0],
      phaseSource: base.phase.phaseSource,
      phaseInputOffset: base.phase.phaseInputOffset,
      phaseInputScale: base.phase.phaseInputScale,
      phasePower: base.phase.phasePower,
    };
  }
  return null;
}

function parseScaleOffsetUvBaseTerm(expression) {
  const text = stripOuterParens(expression);
  const product = splitTopLevelOperator(text, "*");
  if (!product) return null;
  const left = stripOuterParens(product[0]);
  const right = stripOuterParens(product[1]);
  const leftBase = /^(var\d+)\.xy$/.exec(left);
  const rightBase = /^(var\d+)\.xy$/.exec(right);
  if (leftBase) return { baseVarying: leftBase[1], repeatExpression: right };
  if (rightBase) return { baseVarying: rightBase[1], repeatExpression: left };
  return null;
}

function parseScaleOffsetUvDirectBaseTerm(expression) {
  const match = /^(var\d+)\.xy$/.exec(stripOuterParens(expression));
  return match ? { baseVarying: match[1], repeatExpression: "" } : null;
}

function normalizedLinearComponent(linear) {
  return {
    offset: roundedNumber(linear?.offset || 0),
    terms: (linear?.terms || []).map((term) => ({ source: term.source, scale: roundedNumber(term.scale) })),
  };
}

function extractScaleOffsetUvAnimation(text, sampler, varyingSources = {}) {
  for (const uvExpression of samplerTextureUvExpressions(text, sampler)) {
    const expression = stripOuterParens(uvExpression);
    const terms = splitTopLevelOperator(expression, "+");
    if (!terms) continue;

    const firstBase = parseScaleOffsetUvBaseTerm(terms[0]) || parseScaleOffsetUvDirectBaseTerm(terms[0]);
    const secondBase = parseScaleOffsetUvBaseTerm(terms[1]) || parseScaleOffsetUvDirectBaseTerm(terms[1]);
    const base = firstBase || secondBase;
    if (!base) continue;
    if (!varyingHasSource(varyingSources, base.baseVarying, "uv0")) continue;

    const offsetExpression = firstBase ? terms[1] : terms[0];
    const repeatVector = base.repeatExpression
      ? parseMultiPhaseLinearVectorExpression(text, base.repeatExpression)
      : [
          { offset: 1, terms: [] },
          { offset: 1, terms: [] },
        ];
    const offsetVector = parseMultiPhaseLinearVectorExpression(text, offsetExpression);
    if (!repeatVector || !offsetVector) continue;

    const repeat = repeatVector.map(normalizedLinearComponent);
    const offset = offsetVector.map(normalizedLinearComponent);
    const phaseSources = uniqueInOrder([...repeat.flatMap((component) => component.terms), ...offset.flatMap((component) => component.terms)].map(
      (term) => term.source,
    ));
    if (!phaseSources.length) continue;
    if (!allPhaseSourcesUseVaryingSource(phaseSources, varyingSources, "vertexColor")) continue;

    return {
      mode: "scaleOffset",
      baseUvSource: `${base.baseVarying}.xy`,
      repeat: repeat.map((component) => component.offset),
      offset: offset.map((component) => component.offset),
      repeatTerms: repeat.map((component) => component.terms),
      offsetTerms: offset.map((component) => component.terms),
      phaseSource: phaseSources.join("|"),
      phaseSources,
    };
  }
  return null;
}

function extractSameComponentSwizzleScrollUvAnimation(text, sampler) {
  for (const uvExpression of samplerTextureUvExpressionsWithSimpleAliases(text, sampler)) {
    if (/texture2D\s*\(/.test(uvExpression)) continue;
    const match = /\b(?:var\d+|tmpvar_\d+)\.xy\s*([+\-])\s*(var\d+\.([xyzw])\3)\b/.exec(uvExpression);
    if (!match) continue;
    const sign = match[1] === "-" ? -1 : 1;
    const phaseSource = `var${match[2].match(/^var(\d+)/)?.[1]}.${match[3]}`;
    return {
      mode: "scroll",
      speed: [sign, sign],
      offset: [0, 0],
      offsetVariable: match[2],
      phaseSource,
    };
  }
  return null;
}

function previewUvAnimationForSampler(shaderText, sampler, varyingSources = {}, uniformDefaults = {}) {
  return (
    extractFlipbookUvAnimation(shaderText, sampler) ||
    extractComplexFlipbookUvAnimation(shaderText, sampler) ||
    extractFloorFractAtlasOffsetUvAnimation(shaderText, sampler, varyingSources) ||
    extractViewDotScrollOffsetUvAnimation(shaderText, sampler, varyingSources) ||
    extractStaticScaleUvTransform(shaderText, sampler) ||
    extractUniformScaleOffsetUvAnimation(shaderText, sampler, varyingSources, uniformDefaults) ||
    extractUniformFloorAtlasOffsetUvAnimation(shaderText, sampler, varyingSources) ||
    extractUniformAliasScaleOffsetUvAnimation(shaderText, sampler, varyingSources) ||
    extractCenteredScaleUvAnimation(shaderText, sampler, varyingSources) ||
    extractPoweredCenteredScaleUvAnimation(shaderText, sampler, varyingSources) ||
    extractSampledWarpUvAnimation(shaderText, sampler, varyingSources) ||
    extractSampledOffsetFieldUvAnimation(shaderText, sampler, varyingSources) ||
    extractSampledCenterScaleDistortUvAnimation(shaderText, sampler, varyingSources) ||
    extractSampledScaleRotateUvAnimation(shaderText, sampler, varyingSources) ||
    extractRotatedSampledDistortionUvAnimation(shaderText, sampler, varyingSources) ||
    extractSampledRotatedUvAnimation(shaderText, sampler, varyingSources) ||
    extractSampledDistortionUvAnimation(shaderText, sampler, varyingSources) ||
    extractUniformVertexColorFractOffsetUvAnimation(shaderText, sampler, varyingSources) ||
    extractNestedSampledUvDistortionAnimation(shaderText, sampler, varyingSources) ||
    extractScrollUvAnimation(shaderText, sampler, varyingSources) ||
    extractVec2ScrollUvAnimation(shaderText, sampler, varyingSources) ||
    extractVectorSwizzleProductScrollUvAnimation(shaderText, sampler, varyingSources) ||
    extractVectorSwizzleScrollUvAnimation(shaderText, sampler, varyingSources) ||
    extractScaleOffsetUvAnimation(shaderText, sampler, varyingSources) ||
    extractRotatedUvAnimation(shaderText, sampler, varyingSources) ||
    extractSameComponentSwizzleScrollUvAnimation(shaderText, sampler)
  );
}

function isDynamicPreviewUvAnimation(animation) {
  if (!animation?.mode) return false;
  if (animation.mode === "flipbook") return true;
  if (animation.mode === "sampledDistort") return true;
  if (animation.mode === "sampledFractOffsetDistort") return true;
  if (animation.mode === "sampledRotate") return true;
  if (animation.mode === "sampledWarp") return true;
  if (animation.mode === "sampledOffsetField") return true;
  if (animation.mode === "sampledCenterScaleDistort") return true;
  if (animation.mode === "sampledScaleRotate") return true;
  if (animation.mode === "scaleOffset") return true;
  if (animation.mode === "floorFractAtlasOffset") return true;
  if (animation.mode === "viewDotScrollOffset") return true;
  if (animation.mode === "dualScrollFresnelMask") return true;
  if (animation.mode === "waterWallComposite") return true;
  if (animation.mode !== "scroll") return false;
  return (animation.speed || []).some((value) => Math.abs(Number(value)) >= 0.00001);
}

function previewUvAnimationCandidateSamplers(roles, samplerToHash = {}) {
  return uniqueInOrder([
    roles?.uvAnimation?.sampler,
    roles?.baseColor?.sampler,
    roles?.alphaMask?.sampler,
    ...Object.keys(samplerToHash || {}),
  ]);
}

function previewUvAnimationForMaterial(shaderText, roles, samplerToHash = {}, varyingSources = {}, uniformDefaults = {}) {
  const waterWallComposite = extractWaterWallCompositeUvAnimation(shaderText, roles);
  if (waterWallComposite) return waterWallComposite;
  const dualScrollFresnelMask = extractDualScrollFresnelMaskUvAnimation(shaderText, roles, samplerToHash, varyingSources);
  if (dualScrollFresnelMask) return dualScrollFresnelMask;

  const multiScrollAnimation = extractSameTextureAdditiveMultiScrollUvAnimation(shaderText, roles, samplerToHash, varyingSources);
  if (multiScrollAnimation) return multiScrollAnimation;
  if (hasUnsupportedSameTextureMultiSampleUvAnimation(shaderText, roles, samplerToHash)) return null;

  const candidates = previewUvAnimationCandidateSamplers(roles, samplerToHash);
  let staticAnimation = null;
  for (const sampler of candidates) {
    const animation = previewUvAnimationForSampler(shaderText, sampler, varyingSources, uniformDefaults);
    if (!animation) continue;
    if (isDynamicPreviewUvAnimation(animation)) return animation;
    staticAnimation ||= animation;
  }
  return staticAnimation;
}

function uvExpressionDiagnosticsForSampler(shaderText, sampler) {
  const expressions = samplerTextureUvExpressions(shaderText, sampler);
  const diagnostics = [];
  const seen = new Set();

  function pushDiagnostic(value) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) return false;
    seen.add(text);
    diagnostics.push(text);
    return true;
  }

  function collectExpression(expression, depth = 0) {
    if (depth > 8 || !pushDiagnostic(expression)) return;
    const tmpvars = [...expression.matchAll(/\btmpvar_\d+\b/g)].map((match) => match[0]);
    for (const tmpvar of tmpvars) {
      for (const suffix of ["", ".x", ".y", ".z", ".w"]) {
        const assignment = new RegExp(`\\b${escapeRegExp(tmpvar + suffix)}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
        if (assignment) collectExpression(assignment[1], depth + 1);
      }
    }
  }

  for (const expression of expressions) collectExpression(expression);
  return diagnostics;
}

function previewUvAnimationGapReasonForMaterial(shaderText, roles, samplerToHash = {}, roleNameList = []) {
  if (!roleNameList.includes("uvAnimation")) return "";
  const candidates = previewUvAnimationCandidateSamplers(roles, samplerToHash);
  const diagnostics = candidates.flatMap((sampler) => uvExpressionDiagnosticsForSampler(shaderText, sampler));
  if (!diagnostics.length) return "no-texture-uv-expression";

  const diagnosticText = diagnostics.join(" ");
  if (/texture2D\s*\(/.test(diagnosticText)) return "sampled-uv-distortion";
  if (/\b(?:sin|cos)\s*\(/.test(diagnosticText)) return "trig-rotated-uv";
  if (/\bfloor\s*\(/.test(diagnosticText)) return "complex-flipbook-phase";
  if (/\bvar\d+\.[xyzw][\s\S]*\bvar\d+\.[xyzw]/.test(diagnosticText)) return "multi-phase-uv-expression";
  return "complex-uv-expression";
}

function previewUvAnimationGapInputsForMaterial(shaderText, roles, samplerToHash = {}, varyingSources = {}) {
  const candidates = previewUvAnimationCandidateSamplers(roles, samplerToHash);
  const diagnostics = candidates.flatMap((sampler) => uvExpressionDiagnosticsForSampler(shaderText, sampler));
  const inputs = new Set();
  for (const diagnostic of diagnostics) {
    for (const match of String(diagnostic || "").matchAll(/\b(var\d+)\.([xyzw]{1,4})\b/g)) {
      const sources = varyingSources[match[1]] || [];
      for (const component of new Set(match[2].split(""))) {
        for (const source of sources) {
          if (source !== "uv0" && source !== "vertexColor") continue;
          inputs.add(`${source}.${component}`);
        }
      }
    }
  }
  return [...inputs].sort();
}

function previewUvAnimationInputsForRuntimeEvidence(previewUvAnimation, varyingSources = {}) {
  const sources = new Set();
  const phaseSources = uniqueInOrder([
    ...(previewUvAnimation?.phaseSources || []),
    ...String(previewUvAnimation?.phaseSource || "").split("|"),
  ]);

  for (const phaseSource of phaseSources) {
    const uniformMatch = /^uniform:(unif\d+)$/.exec(String(phaseSource || ""));
    if (uniformMatch) {
      sources.add(`uniform.${uniformMatch[1]}`);
      continue;
    }

    const match = /^(var\d+)\.([xyzw]{1,4})$/.exec(String(phaseSource || ""));
    if (!match) continue;
    for (const source of varyingSources[match[1]] || []) {
      if (source !== "uv0" && source !== "vertexColor") continue;
      for (const component of new Set(match[2].split(""))) sources.add(`${source}.${component}`);
    }
  }

  return [...sources].sort();
}

function previewUvRuntimeEvidenceForMaterial(pfxItems, relativePath, gapInputs = []) {
  const surfaceRecords = pfxSurfaceRecordsForShadergraph(pfxItems, relativePath);
  if (!surfaceRecords.length) return null;

  const vertexColorInputs = (gapInputs || []).filter((input) => input.startsWith("vertexColor."));
  const parameterSampleOffsets = uniqNumbers(
    surfaceRecords.flatMap((record) =>
      (record.sampledFloats || []).map((sample) => Number(sample.relativeOffset)),
    ),
  );
  const recordLengths = uniqNumbers(surfaceRecords.map((record) => Number(record.recordLength)));
  const renderFamilies = uniq(surfaceRecords.map((record) => record?.prelude?.renderFamily || ""));

  return {
    kind: vertexColorInputs.length ? "pfx-surface-vertex-color-parameters" : "pfx-surface-uv-parameters",
    pfxPathCount: pfxItems.length,
    surfaceRecordCount: surfaceRecords.length,
    renderFamilies,
    recordLengths,
    parameterSampleOffsets,
    vertexColorInputs,
  };
}

function previewBlendModeForMaterial(roleNameList, materialStatus) {
  if (roleNameList.includes("alphaBlend") || roleNameList.includes("alphaMask")) return "alpha";
  if (roleNameList.includes("emissive") || materialStatus === "tinted-texture" || materialStatus === "color-only") return "additive";
  return "alpha";
}

function previewOpacityForMaterial(previewBlendMode, previewTextureMetadata) {
  const alphaCoverage = previewTextureMetadata.previewTextureAlphaCoverage;
  if (Number.isFinite(alphaCoverage)) {
    const maxOpacity = previewBlendMode === "additive" ? 0.58 : 0.72;
    return roundedCoverage(clamp(alphaCoverage, 0.16, maxOpacity));
  }
  return previewBlendMode === "additive" ? 0.42 : 0.48;
}

const previewSurfaceEffectRoles = new Set(["alphaMask", "emissive", "rimLighting", "uniformColor", "uvAnimation", "vertexColor"]);
const previewSurfaceStrongEffectRoles = new Set(["emissive", "rimLighting", "uniformColor", "vertexColor"]);

function previewSurfaceClassificationForMaterial(roleNameList, materialStatus, pfxRenderFamilies) {
  const roles = new Set(roleNameList);
  const hasEffectRole = [...previewSurfaceEffectRoles].some((role) => roles.has(role));
  const hasStrongEffectRole = [...previewSurfaceStrongEffectRoles].some((role) => roles.has(role));
  const hasBaseCardRole = roles.has("baseColor") || roles.has("alphaBlend");
  const areaSurface = pfxRenderFamilies.includes("area");
  if (materialStatus === "classified" && areaSurface && hasBaseCardRole && !hasEffectRole) {
    return {
      previewSurfaceRenderable: false,
      previewSurfaceRejectReason: "area-base-card-risk",
    };
  }
  if (materialStatus === "classified" && areaSurface && hasBaseCardRole && roles.has("uvAnimation") && !hasStrongEffectRole) {
    return {
      previewSurfaceRenderable: false,
      previewSurfaceRejectReason: "area-uv-base-card-risk",
    };
  }
  if (materialStatus === "classified" && areaSurface && hasBaseCardRole && roles.has("alphaMask") && !hasStrongEffectRole) {
    return {
      previewSurfaceRenderable: false,
      previewSurfaceRejectReason: "area-masked-base-card-risk",
    };
  }
  return {
    previewSurfaceRenderable: true,
    previewSurfaceRejectReason: "",
  };
}

function isUnclassifiedMaterial(item) {
  return item.materialStatus && item.materialStatus !== "classified";
}

function buildEffectShadergraphMaterialManifest(candidateRows, options = {}, generatedAt = new Date().toISOString()) {
  const shaderRoot = options.shaderRoot || defaultShaderRoot;
  const dataRoot = options.dataRoot || defaultDataRoot;
  const effectPreviewTextureRoot = options.effectPreviewTextureRoot || defaultEffectPreviewTextureRoot;
  const pfxLookup = pfxLookupByShadergraph(options.pfxManifest || {});
  const items = [];

  for (const row of candidateRows || []) {
    if (!row.relativePath || row.status !== "FOUND") continue;
    const shaderPath = resolveShaderPath(row, shaderRoot);
    if (!fs.existsSync(shaderPath)) continue;

    const analysis = analyzeShadergraph(shaderPath);
    const shaderBuffer = fs.readFileSync(shaderPath);
    const shaderText = shaderBuffer.toString("latin1");
    const uniformDefaults = extractTch0UniformDefaults(shaderBuffer, shaderText);
    const textureHashes = uniq(Object.values(analysis.samplerToHash || {}));
    const inlineColors = extractInlineColorConstants(shaderText);
    const varyingSources = extractVaryingSources(shaderText);
    const materialRoles = roleNames(analysis.roles);
    const materialStatus = materialStatusFor(materialRoles, textureHashes, inlineColors);
    const pfxItems = pfxLookup.get(row.relativePath) || [];
    const pfxRenderFamilies = pfxRenderFamiliesForShadergraph(pfxItems, row.relativePath);
    const previewAlphaSourceChannels = uniq(
      Object.keys(analysis.samplerToHash || {}).flatMap((sampler) => extractOutputAlphaSamplerChannels(shaderText, sampler)),
    );

    const previewTexture = effectPreviewTextureForShadergraph(row.relativePath, effectPreviewTextureRoot);
    const previewTextureMetadata = previewTextureRuntimeMetadata(previewTextureSpriteMetadata(previewTexture), materialRoles);
    const previewBlendMode = previewBlendModeForMaterial(materialRoles, materialStatus);
    const previewUvAnimation = previewUvAnimationForMaterial(shaderText, analysis.roles, analysis.samplerToHash, varyingSources, uniformDefaults);
    const previewUvAnimationGapReason = previewUvAnimation
      ? ""
      : previewUvAnimationGapReasonForMaterial(shaderText, analysis.roles, analysis.samplerToHash, materialRoles);
    const previewUvAnimationGapInputs = previewUvAnimationGapReason
      ? previewUvAnimationGapInputsForMaterial(shaderText, analysis.roles, analysis.samplerToHash, varyingSources)
      : [];
    const previewUvRuntimeInputs = previewUvAnimation
      ? previewUvAnimationInputsForRuntimeEvidence(previewUvAnimation, varyingSources)
      : previewUvAnimationGapInputs;
    const previewUvRuntimeEvidence = previewUvAnimation || previewUvAnimationGapReason
      ? previewUvRuntimeEvidenceForMaterial(pfxItems, row.relativePath, previewUvRuntimeInputs)
      : null;
    const previewSurface = previewSurfaceClassificationForMaterial(materialRoles, materialStatus, pfxRenderFamilies);

    items.push({
      relativePath: row.relativePath,
      hash: row.hash || "",
      filePath: row.filePath || "",
      shaderPath,
      size: fs.statSync(shaderPath).size,
      samplerCount: Object.keys(analysis.samplerToHash || {}).length,
      samplerToHash: analysis.samplerToHash,
      textureHashes,
      textureAssets: textureHashes.map((hash) => textureMetaForHash(dataRoot, hash)).filter(Boolean),
      previewTexture,
      ...previewTextureMetadata,
      inlineColors,
      previewAlphaSourceChannels,
      varyingSources,
      roles: analysis.roles,
      roleNames: materialRoles,
      materialStatus,
      pfxRenderFamilies,
      ...previewSurface,
      previewBlendMode,
      previewOpacity: previewOpacityForMaterial(previewBlendMode, previewTextureMetadata),
      previewUvAnimation,
      previewUvAnimationGapReason,
      previewUvAnimationGapInputs,
      previewUvRuntimeEvidence,
      pfxPaths: uniq(pfxItems.map((item) => item.relativePath)),
      hookTokens: uniq(pfxItems.flatMap((item) => item.hookTokens || [])),
      hookEffectTokens: uniq(pfxItems.flatMap((item) => item.hookEffectTokens || [])),
      hookAbilityNames: uniq(pfxItems.flatMap((item) => item.hookAbilityNames || [])),
    });
  }

  items.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return {
    generatedAt,
    summary: summarizeEffectShadergraphItems(items),
    items,
  };
}

function increment(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
}

function summarizeEffectShadergraphItems(items) {
  const byTopLevel = {};
  const byRole = {};
  const byVaryingSource = {};
  const byPreviewUvAnimationGapReason = {};
  const byPreviewUvAnimationGapInput = {};
  const byPreviewUvRuntimeEvidenceKind = {};
  const byPreviewUvRuntimeEvidenceInput = {};
  const byPreviewSurfaceRejectReason = {};

  for (const item of items || []) {
    increment(byTopLevel, item.relativePath.split("/").slice(0, 2).join("/"));
    for (const roleName of item.roleNames || []) increment(byRole, roleName);
    for (const source of new Set(Object.values(item.varyingSources || {}).flat())) increment(byVaryingSource, source);
    if (item.previewSurfaceRejectReason) increment(byPreviewSurfaceRejectReason, item.previewSurfaceRejectReason);
    if (item.previewUvAnimationGapReason) increment(byPreviewUvAnimationGapReason, item.previewUvAnimationGapReason);
    for (const input of item.previewUvAnimationGapInputs || []) increment(byPreviewUvAnimationGapInput, input);
    if (item.previewUvRuntimeEvidence?.kind) increment(byPreviewUvRuntimeEvidenceKind, item.previewUvRuntimeEvidence.kind);
    for (const input of item.previewUvRuntimeEvidence?.vertexColorInputs || []) increment(byPreviewUvRuntimeEvidenceInput, input);
  }

  return {
    rows: items.length,
    materialRoleRows: items.filter((item) => item.roleNames.length > 0).length,
    baseColorRows: items.filter((item) => Boolean(item.roles?.baseColor)).length,
    normalRows: items.filter((item) => Boolean(item.roles?.normal)).length,
    reflectionRows: items.filter((item) => Boolean(item.roles?.reflection)).length,
    unclassifiedMaterialRows: items.filter(isUnclassifiedMaterial).length,
    tintedTextureRows: items.filter((item) => item.materialStatus === "tinted-texture").length,
    textureOnlyRows: items.filter((item) => item.materialStatus === "texture-only").length,
    colorOnlyRows: items.filter((item) => item.materialStatus === "color-only").length,
    unknownMaterialRows: items.filter((item) => item.materialStatus === "unknown").length,
    inlineColorRows: items.filter((item) => item.inlineColors.length > 0).length,
    varyingSourceRows: items.filter((item) => Object.keys(item.varyingSources || {}).length > 0).length,
    pfxLinkedRows: items.filter((item) => item.pfxPaths.length > 0).length,
    hookLinkedRows: items.filter((item) => item.hookTokens.length > 0).length,
    pfxLinkedUnclassifiedRows: items.filter((item) => isUnclassifiedMaterial(item) && item.pfxPaths.length > 0).length,
    hookLinkedUnclassifiedRows: items.filter((item) => isUnclassifiedMaterial(item) && item.hookTokens.length > 0).length,
    previewTextureRejectedRows: items.filter((item) => item.previewTextureSpriteUsable === false).length,
    previewTextureAlphaMapRows: items.filter((item) => item.previewTextureRequiresAlphaMap === true).length,
    previewSurfaceRejectedRows: items.filter((item) => item.previewSurfaceRenderable === false).length,
    previewMaterialHintRows: items.filter((item) => item.previewBlendMode && Number.isFinite(item.previewOpacity)).length,
    previewUvAnimationRows: items.filter((item) => item.previewUvAnimation?.mode).length,
    previewUvAnimationGapRows: items.filter((item) => item.previewUvAnimationGapReason).length,
    previewUvRuntimeEvidenceRows: items.filter((item) => item.previewUvRuntimeEvidence?.kind).length,
    textureHashCount: uniq(items.flatMap((item) => item.textureHashes)).length,
    textureAssetRows: items.filter((item) => item.textureAssets.length > 0).length,
    byRole,
    byVaryingSource,
    byPreviewUvAnimationGapReason,
    byPreviewUvAnimationGapInput,
    byPreviewUvRuntimeEvidenceKind,
    byPreviewUvRuntimeEvidenceInput,
    byPreviewSurfaceRejectReason,
    byTopLevel,
  };
}

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    relativePath: item.relativePath,
    hash: item.hash,
    size: item.size,
    samplerCount: item.samplerCount,
    textureHashes: item.textureHashes.join("|"),
    textureAssetCount: item.textureAssets.length,
    previewTexture: item.previewTexture || "",
    previewTextureMode: item.previewTextureMode || "",
    previewTextureSpriteUsable: item.previewTextureSpriteUsable == null ? "" : String(item.previewTextureSpriteUsable),
    previewTextureRequiresAlphaMap: item.previewTextureRequiresAlphaMap == null ? "" : String(item.previewTextureRequiresAlphaMap),
    previewTextureRejectReason: item.previewTextureRejectReason || "",
    previewTextureAlphaCoverage: item.previewTextureAlphaCoverage ?? "",
    previewTextureOpaqueCoverage: item.previewTextureOpaqueCoverage ?? "",
    previewTextureTransparentCoverage: item.previewTextureTransparentCoverage ?? "",
    previewBlendMode: item.previewBlendMode || "",
    previewOpacity: item.previewOpacity ?? "",
    previewUvAnimationMode: item.previewUvAnimation?.mode || "",
    previewUvRepeat: item.previewUvAnimation?.mode === "flipbook" ? item.previewUvAnimation.repeat?.join(",") || "" : "",
    previewUvFrames: item.previewUvAnimation?.mode === "flipbook"
      ? `${item.previewUvAnimation.frameColumns}x${item.previewUvAnimation.frameRows}=${item.previewUvAnimation.frameCount}`
      : "",
    previewUvScroll: item.previewUvAnimation?.mode === "scroll" ? item.previewUvAnimation.speed?.join(",") || "" : "",
    previewUvAnimationGapReason: item.previewUvAnimationGapReason || "",
    previewUvAnimationGapInputs: (item.previewUvAnimationGapInputs || []).join("|"),
    previewUvRuntimeEvidenceKind: item.previewUvRuntimeEvidence?.kind || "",
    previewUvRuntimeEvidenceInputs: (item.previewUvRuntimeEvidence?.vertexColorInputs || []).join("|"),
    previewUvRuntimeEvidenceSurfaceRecords: item.previewUvRuntimeEvidence?.surfaceRecordCount ?? "",
    previewUvRuntimeEvidenceOffsets: (item.previewUvRuntimeEvidence?.parameterSampleOffsets || []).join("|"),
    previewAlphaSourceChannels: (item.previewAlphaSourceChannels || []).join("|"),
    varyingSources: varyingSourceSummary(item.varyingSources),
    inlineColors: item.inlineColors.map((color) => color.hex).join("|"),
    materialStatus: item.materialStatus,
    roleNames: item.roleNames.join("|"),
    pfxRenderFamilies: item.pfxRenderFamilies.join("|"),
    previewSurfaceRenderable: item.previewSurfaceRenderable == null ? "" : String(item.previewSurfaceRenderable),
    previewSurfaceRejectReason: item.previewSurfaceRejectReason || "",
    baseColorHash: item.roles?.baseColor?.hash || "",
    normalHash: item.roles?.normal?.hash || "",
    reflectionHash: item.roles?.reflection?.hash || "",
    pfxPaths: item.pfxPaths.join("|"),
    hookTokens: item.hookTokens.join("|"),
    hookEffectTokens: item.hookEffectTokens.join("|"),
    hookAbilityNames: item.hookAbilityNames.join("|"),
  }));
}

function exportEffectShadergraphMaterialManifest({
  shadergraphCandidatePath = defaultShadergraphCandidatePath,
  pfxManifestPath = defaultPfxManifestPath,
  shaderRoot = defaultShaderRoot,
  dataRoot = defaultDataRoot,
  effectPreviewTextureRoot = defaultEffectPreviewTextureRoot,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const pfxManifest = fs.existsSync(pfxManifestPath) ? JSON.parse(fs.readFileSync(pfxManifestPath, "utf8")) : { items: [] };
  const manifest = buildEffectShadergraphMaterialManifest(
    readEffectShadergraphCandidates(shadergraphCandidatePath),
    { shaderRoot, dataRoot, effectPreviewTextureRoot, pfxManifest },
  );
  manifest.source = { shadergraphCandidatePath, pfxManifestPath, shaderRoot, dataRoot, effectPreviewTextureRoot };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "relativePath",
    "hash",
    "size",
    "samplerCount",
    "textureHashes",
    "textureAssetCount",
    "previewTexture",
    "previewTextureMode",
    "previewTextureSpriteUsable",
    "previewTextureRequiresAlphaMap",
    "previewTextureRejectReason",
    "previewTextureAlphaCoverage",
    "previewTextureOpaqueCoverage",
    "previewTextureTransparentCoverage",
    "previewBlendMode",
    "previewOpacity",
    "previewUvAnimationMode",
    "previewUvRepeat",
    "previewUvFrames",
    "previewUvScroll",
    "previewUvAnimationGapReason",
    "previewUvAnimationGapInputs",
    "previewUvRuntimeEvidenceKind",
    "previewUvRuntimeEvidenceInputs",
    "previewUvRuntimeEvidenceSurfaceRecords",
    "previewUvRuntimeEvidenceOffsets",
    "previewAlphaSourceChannels",
    "varyingSources",
    "inlineColors",
    "materialStatus",
    "roleNames",
    "pfxRenderFamilies",
    "previewSurfaceRenderable",
    "previewSurfaceRejectReason",
    "baseColorHash",
    "normalHash",
    "reflectionHash",
    "pfxPaths",
    "hookTokens",
    "hookEffectTokens",
    "hookAbilityNames",
  ]);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportEffectShadergraphMaterialManifest({
    shadergraphCandidatePath: optionValue(args, "--shadergraphs", defaultShadergraphCandidatePath),
    pfxManifestPath: optionValue(args, "--pfx", defaultPfxManifestPath),
    shaderRoot: optionValue(args, "--shader-root", defaultShaderRoot),
    dataRoot: optionValue(args, "--data-root", defaultDataRoot),
    effectPreviewTextureRoot: optionValue(args, "--effect-preview-root", defaultEffectPreviewTextureRoot),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildEffectShadergraphMaterialManifest,
  effectPreviewTextureForShadergraph,
  exportEffectShadergraphMaterialManifest,
  extractTch0UniformDefaults,
  extractVaryingSources,
  extractOutputAlphaSamplerChannels,
  extractInlineColorConstants,
  previewUvAnimationForMaterial,
  previewUvAnimationGapReasonForMaterial,
  previewUvAnimationGapInputsForMaterial,
  previewUvAnimationInputsForRuntimeEvidence,
  readEffectShadergraphCandidates,
  reportRowsForManifest,
  summarizeEffectShadergraphItems,
  textureMetaForHash,
};
