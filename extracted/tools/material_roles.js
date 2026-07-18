const fs = require("fs");
const path = require("path");

function isUpperHexByte(value) {
  return (value >= 0x30 && value <= 0x39) || (value >= 0x41 && value <= 0x46);
}

function uniquePush(output, seen, value) {
  if (seen.has(value)) return;
  seen.add(value);
  output.push(value);
}

function extractNullTerminatedHashes(buffer) {
  return uniqueHashList(extractNullTerminatedHashSequence(buffer));
}

function extractNullTerminatedHashSequence(buffer) {
  const hashes = [];

  for (let offset = 0; offset <= buffer.length - 33; offset += 1) {
    let isHash = buffer[offset + 32] === 0;
    for (let index = 0; isHash && index < 32; index += 1) {
      isHash = isUpperHexByte(buffer[offset + index]);
    }

    if (!isHash) continue;

    hashes.push(buffer.subarray(offset, offset + 32).toString("ascii"));
    offset += 31;
  }

  return hashes;
}

function uniqueHashList(values) {
  const hashes = [];
  const seen = new Set();
  for (const value of values || []) uniquePush(hashes, seen, value);
  return hashes;
}

function extractSamplerTable(text) {
  const firstShaderIndex = text.search(/precision\s+(?:lowp|mediump|highp)\s+float;/);
  const tableText = firstShaderIndex >= 0 ? text.slice(0, firstShaderIndex) : text;
  const samplers = [];
  const seen = new Set();

  for (const match of tableText.matchAll(/sampler\d+(?=\x00)/g)) {
    uniquePush(samplers, seen, match[0]);
  }

  return samplers;
}

function extractUniformSamplers(text) {
  const samplers = [];
  const seen = new Set();

  for (const match of text.matchAll(/uniform\s+sampler(?:2D|Cube)\s+(sampler\d+)\s*;/g)) {
    uniquePush(samplers, seen, match[1]);
  }

  return samplers;
}

function readNullTerminatedAscii(buffer, offset, length) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || offset >= buffer.length) return "";
  const end = Math.min(offset + length, buffer.length);
  let stop = offset;
  while (stop < end && buffer[stop] !== 0) stop += 1;
  return buffer.subarray(offset, stop).toString("latin1");
}

function skipNativeTch0FirstSectionRecord(buffer, offset) {
  if (!Buffer.isBuffer(buffer) || offset + 2 > buffer.length) return -1;
  const wordCount = buffer[offset + 1];
  const next = offset + 2 + wordCount * 4 + 4;
  return next <= buffer.length ? next : -1;
}

function extractCompiledSamplerUnitTable(buffer, offset) {
  if (!Buffer.isBuffer(buffer) || offset + 6 > buffer.length) return null;
  const samplerCount = buffer[offset];
  const bindingCount = buffer[offset + 1];
  const vertexShaderOffset = buffer.readUInt16LE(offset + 2);
  const fragmentShaderOffset = buffer.readUInt16LE(offset + 4);
  if (samplerCount > 64 || bindingCount > 64) return null;
  const samplerRecordsOffset = offset + 6;
  const bindingTableOffset = samplerRecordsOffset + samplerCount * 17;
  if (bindingTableOffset + bindingCount * 16 > buffer.length) return null;

  const samplerRecords = [];
  const samplerByUnit = {};
  for (let index = 0; index < samplerCount; index += 1) {
    const recordOffset = samplerRecordsOffset + index * 17;
    const unit = buffer[recordOffset];
    const sampler = readNullTerminatedAscii(buffer, recordOffset + 1, 16);
    samplerRecords.push({ index, unit, sampler, offset: recordOffset });
    if (/^sampler\d+$/.test(sampler)) samplerByUnit[unit] = sampler;
  }

  return {
    offset,
    samplerCount,
    bindingCount,
    vertexShaderOffset,
    fragmentShaderOffset,
    samplerRecords,
    samplerByUnit,
    bindingTableOffset,
  };
}

function extractNativeTch0SamplerBindings(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  const tch0Offset = buffer.indexOf(Buffer.from("TCH0", "ascii"));
  if (tch0Offset < 0 || tch0Offset + 24 > buffer.length) return null;

  const sectionCountsWord = buffer.readUInt32LE(tch0Offset + 20);
  const counts = {
    first: sectionCountsWord & 0xff,
    texture: (sectionCountsWord >>> 8) & 0xff,
    inlineTexture: (sectionCountsWord >>> 16) & 0xff,
    resource: (sectionCountsWord >>> 24) & 0xff,
  };

  let offset = tch0Offset + 24;
  for (let index = 0; index < counts.first; index += 1) {
    offset = skipNativeTch0FirstSectionRecord(buffer, offset);
    if (offset < 0) return null;
  }

  const textureRecords = [];
  for (let index = 0; index < counts.texture; index += 1) {
    if (offset + 40 > buffer.length) return null;
    const hash = readNullTerminatedAscii(buffer, offset, 33);
    if (!/^[0-9A-F]{32}$/.test(hash)) return null;
    textureRecords.push({
      index,
      offset,
      hash,
      unit: buffer[offset + 0x21],
      lowNibble: buffer[offset + 0x22] & 0xf,
      highNibble: buffer[offset + 0x22] >>> 4,
      flags: buffer[offset + 0x23],
      metadata: buffer.readUInt32LE(offset + 0x24),
    });
    offset += 40;
  }

  const inlineTextureRecords = [];
  for (let index = 0; index < counts.inlineTexture; index += 1) {
    if (offset + 0x303 > buffer.length) return null;
    inlineTextureRecords.push({
      index,
      offset,
      unit: buffer[offset + 0x300],
      flags0: buffer[offset + 0x301],
      flags1: buffer[offset + 0x302],
    });
    offset += 0x303;
  }

  const resourceRecords = [];
  for (let index = 0; index < counts.resource; index += 1) {
    if (offset + 0x23 > buffer.length) return null;
    resourceRecords.push({
      index,
      offset,
      id: buffer[offset],
      type: buffer[offset + 1],
      key: readNullTerminatedAscii(buffer, offset + 2, 0x21),
    });
    offset += 0x23;
  }

  const compiledSamplerTable = extractCompiledSamplerUnitTable(buffer, offset);
  if (!compiledSamplerTable) return null;

  const samplerToHash = {};
  for (const record of textureRecords) {
    const sampler = compiledSamplerTable.samplerByUnit[record.unit];
    if (!sampler) continue;
    samplerToHash[sampler] = record.hash;
  }

  const inlineTextureSamplerRecords = inlineTextureRecords.map((record) => ({
    ...record,
    sampler: compiledSamplerTable.samplerByUnit[record.unit] || "",
  }));

  return {
    tch0Offset,
    sectionCountsWord,
    counts,
    sectionEndOffset: offset,
    compiledSamplerTable,
    textureRecords,
    inlineTextureRecords: inlineTextureSamplerRecords,
    resourceRecords,
    samplerToHash,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function usesAsNormal(text, sampler) {
  const name = escapeRegExp(sampler);
  const uniformScaleDecode = new RegExp(
    `texture2D\\s*\\(\\s*${name}\\s*,\\s*var\\d+\\.xy\\s*\\)\\.xyz\\s*\\*\\s*2\\.0`,
    "s",
  );
  const nonuniformScaleDecode = new RegExp(
    `vec3\\s*\\(\\s*[-+]?\\d*\\.?\\d+\\s*,\\s*[-+]?\\d*\\.?\\d+\\s*,\\s*[-+]?\\d*\\.?\\d+\\s*\\)\\s*\\*\\s*texture2D\\s*\\(\\s*${name}\\s*,\\s*var\\d+\\.xy\\s*\\)\\.xyz\\s*\\)\\s*-\\s*1\\.0`,
    "s",
  );
  return uniformScaleDecode.test(text) || nonuniformScaleDecode.test(text);
}

function usesBaseUv(text, sampler) {
  const name = escapeRegExp(sampler);
  return new RegExp(`texture2D\\s*\\(\\s*${name}\\s*,[\\s\\S]{0,180}\\bvar\\d+\\.xy`, "s").test(text);
}

function usesReflectionUv(text, sampler) {
  const name = escapeRegExp(sampler);
  return new RegExp(`texture2D\\s*\\(\\s*${name}\\s*,\\s*\\(\\(tmpvar_\\d+\\.xy`, "s").test(text);
}

function reflectionModeForSampler(text, sampler) {
  if (!sampler) return "";
  if (usesReflectionUv(text, sampler)) return "screen-space-2d";
  if (/sampler(?:88|104|105)/.test(sampler)) return "lookup-2d";
  return "";
}

function directVaryingSourcesForExpression(expression) {
  return [
    /\b_Color\b/.test(expression) ? "vertexColor" : "",
    /\b_MultiTexCoord0\b/.test(expression) ? "uv0" : "",
  ].filter(Boolean);
}

function extractRenderableVaryingSources(text) {
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

  return sourcesByIdentifier;
}

function expressionDependsOnRenderableVarying(text, expression, varyingSources, seenVariables = new Set()) {
  for (const match of String(expression || "").matchAll(/\b(var\d+)\b/g)) {
    const sources = varyingSources.get(match[1]) || new Set();
    if (sources.has("uv0") || sources.has("vertexColor")) return true;
  }

  const variables = [...String(expression || "").matchAll(/\b(?:tmpvar_\d+|cse_\d+)\b/g)].map((match) => match[0]);
  for (const variable of variables) {
    if (seenVariables.has(variable)) continue;
    const nextSeen = new Set(seenVariables);
    nextSeen.add(variable);
    for (const assignment of assignmentExpressionsForVariable(text, variable)) {
      if (expressionDependsOnRenderableVarying(text, assignment, varyingSources, nextSeen)) return true;
    }
  }
  return false;
}

function isReflectionVectorLookupUvExpression(expression) {
  const value = String(expression || "");
  const projectionMatch = /\binversesqrt\s*\(\s*dot\s*\(\s*(tmpvar_\d+)\s*,\s*\1\s*\)\s*\)\s*\*\s*0\.5\b/s.test(value);
  return projectionMatch && /\+\s*vec2\s*\(\s*0\.5\s*,\s*0\.5\s*\)/s.test(value);
}

function usesAnimatedUv(text, sampler, varyingSources = extractRenderableVaryingSources(text)) {
  const name = escapeRegExp(sampler);
  const uvExpressions = samplerTextureUvExpressions(text, sampler);
  if (uvExpressions.length && uvExpressions.every(isReflectionVectorLookupUvExpression)) return false;
  if (
    varyingSources.size &&
    !uvExpressions.some((expression) => expressionDependsOnRenderableVarying(text, expression, varyingSources))
  ) {
    return false;
  }
  const directAnimatedSample = new RegExp(
    `texture2D\\s*\\(\\s*${name}\\s*,\\s*\\(*\\s*(?:var\\d+|tmpvar_\\d+)\\.xy\\s*[+\\-*/]`,
    "s",
  ).test(text);
  if (directAnimatedSample) return true;

  for (const match of text.matchAll(new RegExp(`texture2D\\s*\\(\\s*${name}\\s*,\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\)`, "g"))) {
    const variable = escapeRegExp(match[1]);
    if (new RegExp(`\\b${variable}\\s*=\\s*\\(?\\s*(?:var\\d+|tmpvar_\\d+)\\.xy\\s*[+\\-*/]`, "s").test(text)) return true;
  }
  for (const expression of uvExpressions) {
    if (expressionDependencyMatches(text, expression, /\b(?:sin|cos|floor)\s*\(/)) return true;
  }
  return false;
}

function usesAsAlphaMask(text, sampler) {
  const name = escapeRegExp(sampler);
  for (const match of text.matchAll(
    new RegExp(`\\b([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*texture2D\\s*\\(\\s*${name}\\s*,[^;]+?\\)\\s*;`, "g"),
  )) {
    const variable = escapeRegExp(match[1]);
    if (new RegExp(`\\.w\\s*=\\s*[^;]*\\b${variable}\\.[xyzw]`, "s").test(text)) return true;
    if (new RegExp(`gl_FragColor\\s*=\\s*[^;]*\\b${variable}\\.[xyzw]`, "s").test(text)) return true;
  }
  for (const match of text.matchAll(
    new RegExp(`\\b([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*\\(?\\s*texture2D\\s*\\(\\s*${name}\\s*,[^;]+?\\)\\s*\\.[xw][^;]*;`, "g"),
  )) {
    const variable = escapeRegExp(match[1]);
    if (new RegExp(`\\.w\\s*=\\s*[^;]*\\b${variable}\\b`, "s").test(text)) return true;
    if (new RegExp(`gl_FragColor\\s*=\\s*[^;]*\\b${variable}\\b`, "s").test(text)) return true;
  }
  return new RegExp(`gl_FragColor\\.w\\s*=\\s*texture2D\\s*\\(\\s*${name}\\s*,`, "s").test(text);
}

function usesAlphaBlend(text) {
  return (
    /\.w\s*=\s*[^;]*(?:\*|texture2D|var\d+\.w|tmpvar_\d+\.[xyzw])/s.test(text) ||
    /gl_FragColor\.w\s*=\s*[^;]*(?:\*|texture2D|var\d+\.w|tmpvar_\d+\.[xyzw])/s.test(text)
  );
}

function usesRimLighting(text) {
  return /pow\s*\(\s*\(?\s*1\.0\s*-\s*(?:var\d+|tmpvar_\d+)\.[xyz]/s.test(text) || /\brim\b/i.test(text);
}

function usesVertexColor(text) {
  if (!/attribute\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+_Color\s*;/s.test(text)) return false;
  for (const match of text.matchAll(/\b(tmpvar_\d+)\.xyz\s*=\s*var\d+\.xyz\s*;/g)) {
    const variable = escapeRegExp(match[1]);
    if (new RegExp(`\\b${variable}\\.w\\s*=\\s*(?:1\\.0|var\\d+\\.w)\\s*;[\\s\\S]{0,240}gl_FragColor\\s*=\\s*${variable}\\s*;`).test(text)) {
      return true;
    }
  }
  return /gl_FragColor\s*=\s*var\d+\s*;/s.test(text);
}

function usesUniformColor(text) {
  const colorUniforms = new Set(
    [...text.matchAll(/uniform\s+(?:(?:lowp|mediump|highp)\s+)?vec3\s+(unif\d+)\s*;/g)].map((match) => match[1]),
  );
  if (!colorUniforms.size) return false;

  for (const uniformName of colorUniforms) {
    const name = escapeRegExp(uniformName);
    for (const match of text.matchAll(new RegExp(`\\b(tmpvar_\\d+)\\.xyz\\s*=\\s*${name}\\s*;`, "g"))) {
      const variable = escapeRegExp(match[1]);
      if (new RegExp(`gl_FragColor\\s*=\\s*${variable}\\s*;`, "s").test(text)) return true;
    }
    if (new RegExp(`gl_FragColor\\.xyz\\s*=\\s*${name}\\s*;`, "s").test(text)) return true;
  }
  return false;
}

function usesUniformAlpha(text) {
  const alphaUniforms = new Set(
    [...text.matchAll(/uniform\s+(?:(?:lowp|mediump|highp)\s+)?float\s+(unif\d+)\s*;/g)].map((match) => match[1]),
  );
  if (!alphaUniforms.size) return false;

  for (const uniformName of alphaUniforms) {
    const name = escapeRegExp(uniformName);
    if (new RegExp(`\\.w\\s*=\\s*${name}\\s*;`, "s").test(text)) return true;
    if (new RegExp(`gl_FragColor\\.w\\s*=\\s*${name}\\s*;`, "s").test(text)) return true;
  }
  return false;
}

function sampledBaseUvVariable(text, sampler) {
  const name = escapeRegExp(sampler);
  const match = new RegExp(
    `(tmpvar_\\d+)\\s*=\\s*texture2D\\s*\\(\\s*${name}\\s*,[\\s\\S]{0,180}\\bvar\\d+\\.xy[\\s\\S]{0,180}?\\)`,
    "s",
  ).exec(text);
  return match?.[1] || "";
}

function usesAsLitDiffuse(text, sampler) {
  const variable = sampledBaseUvVariable(text, sampler);
  if (!variable) return false;
  const name = escapeRegExp(variable);
  return new RegExp(`${name}\\.xyz\\s*\\+\\s*\\(\\s*${name}\\.xyz\\s*\\*`, "s").test(text);
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

function assignmentExpressionsForVariable(text, variable, components = []) {
  if (!text || !variable) return [];
  const variableName = escapeRegExp(variable);
  const componentPattern = components.length ? `\\.(?:${components.map(escapeRegExp).join("|")})` : "(?:\\.[xyzw]{1,4})?";
  const pattern = new RegExp(`\\b${variableName}(?:${componentPattern})?\\s*=\\s*([^;]+);`, "g");
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

function sampledVariablesForSampler(text, sampler) {
  const samplerName = escapeRegExp(sampler);
  const variables = new Set();
  for (const match of text.matchAll(
    new RegExp(`\\b([A-Za-z_][A-Za-z0-9_]*)\\s*(?:\\.[xyzw]{1,4})?\\s*=\\s*[^;]*texture2D\\s*\\(\\s*${samplerName}\\s*,`, "g"),
  )) {
    variables.add(match[1]);
  }
  return variables;
}

function textureSampleExpressionIsVector(expression) {
  if (!/\btexture2D\s*\(/.test(expression)) return false;
  const swizzle = /\btexture2D[\s\S]*\)\s*\.([xyzwrgba]{1,4})\b/.exec(expression);
  return !swizzle || swizzle[1].length >= 3;
}

function sampledColorVariablesForSampler(text, sampler) {
  const samplerName = escapeRegExp(sampler);
  const variables = new Set();
  const assignmentPattern = new RegExp(
    `\\b([A-Za-z_][A-Za-z0-9_]*)\\s*(?:\\.([xyzw]{1,4}))?\\s*=\\s*([^;]*texture2D\\s*\\(\\s*${samplerName}[^;]*);`,
    "g",
  );
  for (const match of text.matchAll(assignmentPattern)) {
    const targetComponent = match[2] || "";
    if (targetComponent && targetComponent.length < 3) continue;
    if (!textureSampleExpressionIsVector(match[3])) continue;
    variables.add(match[1]);
  }
  return variables;
}

function expressionDependsOnVariables(text, expression, sourceVariables, seenVariables = new Set()) {
  const sourceList = [...sourceVariables].filter(Boolean);
  for (const source of sourceList) {
    if (new RegExp(`\\b${escapeRegExp(source)}(?:\\.[xyzw]{1,4})?\\b`).test(expression)) return true;
  }

  const variables = [...String(expression || "").matchAll(/\b(?:tmpvar_\d+|cse_\d+)\b/g)].map((match) => match[0]);
  for (const variable of variables) {
    if (seenVariables.has(variable)) continue;
    const nextSeen = new Set(seenVariables);
    nextSeen.add(variable);
    for (const assignment of assignmentExpressionsForVariable(text, variable)) {
      if (expressionDependsOnVariables(text, assignment, sourceVariables, nextSeen)) return true;
    }
  }
  return false;
}

function expressionDependsOnVectorVariables(text, expression, sourceVariables, seenVariables = new Set()) {
  const sourceList = [...sourceVariables].filter(Boolean);
  for (const source of sourceList) {
    const name = escapeRegExp(source);
    if (new RegExp(`\\b${name}\\b(?!\\s*\\.)`).test(expression)) return true;
    if (new RegExp(`\\b${name}\\.(?:xyz|rgb|xyzw|rgba|xxx|yyy|zzz)\\b`).test(expression)) return true;
  }

  const variables = [...String(expression || "").matchAll(/\b(?:tmpvar_\d+|cse_\d+)\b/g)].map((match) => match[0]);
  for (const variable of variables) {
    if (seenVariables.has(variable)) continue;
    const nextSeen = new Set(seenVariables);
    nextSeen.add(variable);
    for (const assignment of assignmentExpressionsForVariable(text, variable)) {
      if (expressionDependsOnVectorVariables(text, assignment, sourceVariables, nextSeen)) return true;
    }
  }
  return false;
}

function expressionDependencyMatches(text, expression, pattern, seenVariables = new Set()) {
  if (pattern.test(String(expression || ""))) return true;
  const variables = [...String(expression || "").matchAll(/\b(?:tmpvar_\d+|cse_\d+)\b/g)].map((match) => match[0]);
  for (const variable of variables) {
    if (seenVariables.has(variable)) continue;
    const nextSeen = new Set(seenVariables);
    nextSeen.add(variable);
    for (const assignment of assignmentExpressionsForVariable(text, variable)) {
      if (expressionDependencyMatches(text, assignment, pattern, nextSeen)) return true;
    }
  }
  return false;
}

function glFragColorExpressions(text, components) {
  const expressions = [];
  const componentPattern = components.length ? `\\.(?:${components.map(escapeRegExp).join("|")})` : "(?:\\.[xyzw]{1,4})?";
  for (const match of text.matchAll(new RegExp(`\\bgl_FragColor${componentPattern}\\s*=\\s*([^;]+);`, "g"))) {
    expressions.push(match[1]);
  }
  for (const match of text.matchAll(/\bgl_FragColor\s*=\s*([^;]+);/g)) {
    const expression = match[1].trim();
    const variable = /^(tmpvar_\d+|cse_\d+)$/.exec(expression);
    if (variable && components.length) {
      expressions.push(...assignmentExpressionsForVariable(text, variable[1], components));
      continue;
    }
    expressions.push(expression);
    if (!variable) continue;
    expressions.push(...assignmentExpressionsForVariable(text, variable[1], components));
  }
  return expressions;
}

function outputChannelsDependOnSampler(text, sampler, components) {
  const sampledVariables = sampledVariablesForSampler(text, sampler);
  if (!sampledVariables.size) return false;
  return glFragColorExpressions(text, components).some((expression) =>
    expressionDependsOnVariables(text, expression, sampledVariables),
  );
}

function outputColorDependsOnSampler(text, sampler) {
  const sampledColorVariables = sampledColorVariablesForSampler(text, sampler);
  if (!sampledColorVariables.size) return false;
  return glFragColorExpressions(text, ["xyz", "xyzw", "x", "y", "z"]).some((expression) =>
    expressionDependsOnVectorVariables(text, expression, sampledColorVariables),
  );
}

function outputAlphaDependsOnSampler(text, sampler) {
  return outputChannelsDependOnSampler(text, sampler, ["w", "xyzw"]);
}

function roleEntry(role, sampler, hash) {
  return { role, sampler, hash };
}

function samplerContributesToOutput(text, sampler) {
  return outputColorDependsOnSampler(text, sampler) || outputAlphaDependsOnSampler(text, sampler);
}

function isLikelyEmissiveShadergraph(filePath) {
  const name = path.basename(filePath, ".shadergraph").toLowerCase();
  return /(?:glow|eyeglow|eye_glow|light|fire|flame|energy|crystal|halo|electric|shine|lamp)/.test(name);
}

function analyzeShadergraph(filePath) {
  const buffer = fs.readFileSync(filePath);
  const text = buffer.toString("latin1");
  const hashSequence = extractNullTerminatedHashSequence(buffer);
  const hashes = uniqueHashList(hashSequence);
  const samplerTable = extractSamplerTable(text);
  const uniformSamplers = extractUniformSamplers(text);
  const samplerOrder = samplerTable.length ? samplerTable : uniformSamplers;
  const nativeSamplerBindings = extractNativeTch0SamplerBindings(buffer);
  const samplerToHash = { ...(nativeSamplerBindings?.samplerToHash || {}) };

  if (!Object.keys(samplerToHash).length) {
    const samplerHashes = hashes.length === 1 && samplerOrder.length > 1 ? samplerOrder.map(() => hashes[0]) : hashes;
    for (let index = 0; index < samplerHashes.length && index < samplerOrder.length; index += 1) {
      samplerToHash[samplerOrder[index]] = samplerHashes[index];
    }
  }

  const roles = {};
  const varyingSources = extractRenderableVaryingSources(text);
  for (const [sampler, hash] of Object.entries(samplerToHash)) {
    if (!roles.normal && usesAsNormal(text, sampler)) {
      roles.normal = roleEntry("normal", sampler, hash);
      continue;
    }
  }

  if (samplerToHash.sampler54 && !roles.baseColor) {
    roles.baseColor = roleEntry("baseColor", "sampler54", samplerToHash.sampler54);
  }

  if (!roles.baseColor) {
    for (const [sampler, hash] of Object.entries(samplerToHash)) {
      if (roles.normal?.sampler === sampler) continue;
      if (!usesAsLitDiffuse(text, sampler)) continue;
      roles.baseColor = roleEntry("baseColor", sampler, hash);
      break;
    }
  }

  if (!roles.baseColor) {
    for (const [sampler, hash] of Object.entries(samplerToHash)) {
      if (roles.normal?.sampler === sampler) continue;
      if (sampler === "sampler60") continue;
      if (!usesBaseUv(text, sampler)) continue;
      roles.baseColor = roleEntry("baseColor", sampler, hash);
      break;
    }
  }

  if (!roles.baseColor) {
    for (const [sampler, hash] of Object.entries(samplerToHash)) {
      if (roles.normal?.sampler === sampler) continue;
      if (sampler === "sampler60") continue;
      if (!outputColorDependsOnSampler(text, sampler)) continue;
      roles.baseColor = roleEntry("baseColor", sampler, hash);
      break;
    }
  }

  for (const [sampler, hash] of Object.entries(samplerToHash)) {
    if (roles.normal?.sampler === sampler || roles.baseColor?.sampler === sampler) continue;
    if (sampler === "sampler60") {
      roles.lookup = roleEntry("lookup", sampler, hash);
    } else if (!roles.reflection && (usesReflectionUv(text, sampler) || /sampler(?:88|104|105)/.test(sampler))) {
      roles.reflection = roleEntry("reflection", sampler, hash);
    }
  }

  if (roles.baseColor && isLikelyEmissiveShadergraph(filePath)) {
    roles.emissive = roleEntry("emissive", roles.baseColor.sampler, roles.baseColor.hash);
  }

  for (const [sampler, hash] of Object.entries(samplerToHash)) {
    if (!roles.alphaMask && (usesAsAlphaMask(text, sampler) || outputAlphaDependsOnSampler(text, sampler))) {
      roles.alphaMask = roleEntry("alphaMask", sampler, hash);
    }
    const isRenderableAnimatedSampler =
      roles.baseColor?.sampler === sampler ||
      roles.alphaMask?.sampler === sampler ||
      samplerContributesToOutput(text, sampler);
    if (
      !roles.uvAnimation &&
      isRenderableAnimatedSampler &&
      roles.reflection?.sampler !== sampler &&
      roles.lookup?.sampler !== sampler &&
      usesAnimatedUv(text, sampler, varyingSources)
    ) {
      roles.uvAnimation = roleEntry("uvAnimation", sampler, hash);
    }
  }
  if (usesAlphaBlend(text) || Object.keys(samplerToHash).some((sampler) => outputAlphaDependsOnSampler(text, sampler))) {
    roles.alphaBlend = roleEntry("alphaBlend", "", "");
  }
  if (usesRimLighting(text)) roles.rimLighting = roleEntry("rimLighting", "", "");
  if (usesVertexColor(text)) roles.vertexColor = roleEntry("vertexColor", "", "");
  if (usesUniformColor(text)) roles.uniformColor = roleEntry("uniformColor", "", "");
  if (!roles.alphaBlend && usesUniformAlpha(text)) roles.alphaBlend = roleEntry("alphaBlend", "", "");

  return {
    filePath,
    hashes,
    hashSequence,
    samplerTable,
    uniformSamplers,
    nativeSamplerBindings,
    samplerToHash,
    roles,
  };
}

module.exports = {
  analyzeShadergraph,
  extractNullTerminatedHashSequence,
  extractNullTerminatedHashes,
  extractNativeTch0SamplerBindings,
  extractSamplerTable,
  extractUniformSamplers,
  isLikelyEmissiveShadergraph,
  reflectionModeForSampler,
};
