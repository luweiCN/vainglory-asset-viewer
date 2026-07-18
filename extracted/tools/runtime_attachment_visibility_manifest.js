#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { parseAnimationFamily3Layout } = require("./animation_tools");

const defaultBindingsPath = "extracted/viewer/skin-animation-bindings.json";
const defaultAnimationIndexPath = "extracted/reports/animation_resource_index.tsv";
const defaultJsonOut = "extracted/viewer/runtime-attachment-visibility-manifest.json";
const defaultTsvOut = "extracted/reports/runtime_attachment_visibility_manifest.tsv";

const NATIVE_SCALE_MASK = (1 << 7) | (1 << 8) | (1 << 9);
const DEFAULT_VISIBLE_SCALE_THRESHOLD = 0.5;

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function round(value, digits = 6) {
  return Number(Number(value || 0).toFixed(digits));
}

function stableId(parts) {
  return crypto.createHash("md5").update(parts.join("\t")).digest("hex").slice(0, 16);
}

function decodeFloat16(value) {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function scaleMagnitude(scale) {
  if (!Array.isArray(scale) || !scale.length) return 0;
  return Math.max(...scale.map((value) => Math.abs(Number(value) || 0)));
}

function readBaseScale(buffer, offset) {
  return [buffer.readFloatLE(offset + 32), buffer.readFloatLE(offset + 36), buffer.readFloatLE(offset + 40)];
}

function readTrackScaleForFrame(buffer, layout, trackIndex, frameIndex) {
  const scale = readBaseScale(buffer, layout.basePoseOffset + trackIndex * 48);
  if (frameIndex === 0) return scale;

  const mask = layout.trackMasks[trackIndex] || 0;
  if (!mask) return scale;

  const frameBaseOffset = layout.frameDataOffset + (frameIndex - 1) * layout.frameStrideHalfWords * 2;
  let cursor = frameBaseOffset + layout.trackValueOffsets[trackIndex] * 2;
  const componentIndexes = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10];
  for (let bit = 0; bit < componentIndexes.length; bit += 1) {
    if ((mask & (1 << bit)) === 0) continue;
    const decoded = decodeFloat16(buffer.readUInt16LE(cursor));
    const component = componentIndexes[bit];
    if (component >= 8 && component <= 10) scale[component - 8] = decoded;
    cursor += 2;
  }
  return scale;
}

function visibilityWindows(visibleFrames, fps) {
  const windows = [];
  let startFrame = null;
  const secondsForFrame = (frame) => (Number(fps) > 0 ? round(frame / fps) : null);

  for (let index = 0; index <= visibleFrames.length; index += 1) {
    const visible = Boolean(visibleFrames[index]);
    if (visible && startFrame == null) startFrame = index;
    if ((!visible || index === visibleFrames.length) && startFrame != null) {
      const endFrame = index - 1;
      windows.push({
        startFrame,
        endFrame,
        startSeconds: secondsForFrame(startFrame),
        endSeconds: secondsForFrame(endFrame + 1),
      });
      startFrame = null;
    }
  }

  return windows;
}

function extractScaleVisibilityRowsForAnimation({
  animationPath,
  buffer,
  threshold = DEFAULT_VISIBLE_SCALE_THRESHOLD,
} = {}) {
  const layout = parseAnimationFamily3Layout(buffer);
  const rows = [];
  for (let trackIndex = 0; trackIndex < layout.trackCount; trackIndex += 1) {
    const mask = layout.trackMasks[trackIndex] || 0;
    if ((mask & NATIVE_SCALE_MASK) === 0) continue;

    const visibleFrames = [];
    const magnitudes = [];
    for (let frameIndex = 0; frameIndex < layout.frameCount; frameIndex += 1) {
      const scale = readTrackScaleForFrame(buffer, layout, trackIndex, frameIndex);
      const magnitude = scaleMagnitude(scale);
      magnitudes.push(magnitude);
      visibleFrames.push(magnitude >= threshold);
    }

    const visibleFrameCount = visibleFrames.filter(Boolean).length;
    const visibleWindowRows = visibilityWindows(visibleFrames, layout.fps);
    rows.push({
      animationPath,
      boneIndex: trackIndex,
      trackMask: mask,
      trackMaskHex: `0x${mask.toString(16)}`,
      fps: round(layout.fps, 3),
      frameCount: layout.frameCount,
      duration: round(layout.frameCount / layout.fps),
      visibleFrameCount,
      hiddenFrameCount: layout.frameCount - visibleFrameCount,
      visibilityStatus:
        visibleFrameCount === 0
          ? "hidden-scale-track"
          : visibleFrameCount === layout.frameCount
            ? "always-visible-scale-track"
            : "time-windowed",
      firstVisibleFrame: visibleWindowRows[0]?.startFrame ?? "",
      lastVisibleFrame: visibleWindowRows.at(-1)?.endFrame ?? "",
      visibleWindows: visibleWindowRows,
      visibleWindowsText: visibleWindowRows.map((window) => `${window.startFrame}-${window.endFrame}`).join("|"),
      maxScale: round(Math.max(...magnitudes), 4),
      minScale: round(Math.min(...magnitudes), 4),
    });
  }
  return rows;
}

function buildRuntimeAttachmentVisibilityManifest({
  bindingItems = [],
  scaleRowsByAnimationPath = new Map(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const items = [];
  for (const bindingItem of bindingItems || []) {
    for (const animation of bindingItem.animations || []) {
      const scaleRows = scaleRowsByAnimationPath.get(animation.targetRelativePath) || [];
      for (const scaleRow of scaleRows) {
        const visibleWindowsText =
          scaleRow.visibleWindowsText ||
          (scaleRow.visibleWindows || []).map((window) => `${window.startFrame}-${window.endFrame}`).join("|");
        const id = stableId([
          bindingItem.rel,
          bindingItem.modelLabel,
          animation.targetRelativePath,
          String(scaleRow.boneIndex),
          visibleWindowsText,
        ]);
        items.push({
          id,
          rel: bindingItem.rel || "",
          character: bindingItem.character || "",
          modelLabel: bindingItem.modelLabel || "",
          sourceRelativePath: bindingItem.sourceRelativePath || "",
          animationLabel: animation.label || "",
          actionKeys: [animation.actionKey].filter(Boolean),
          actionKey: animation.actionKey || "",
          animationPath: animation.targetRelativePath || "",
          bindingSource: animation.bindingSource || "",
          boneIndex: scaleRow.boneIndex,
          trackMaskHex: scaleRow.trackMaskHex,
          duration: scaleRow.duration ?? animation.duration ?? "",
          fps: scaleRow.fps ?? animation.fps ?? "",
          frameCount: scaleRow.frameCount ?? animation.frameCount ?? "",
          visibleFrameCount: scaleRow.visibleFrameCount,
          hiddenFrameCount: scaleRow.hiddenFrameCount,
          firstVisibleFrame: scaleRow.firstVisibleFrame,
          lastVisibleFrame: scaleRow.lastVisibleFrame,
          visibleWindows: scaleRow.visibleWindows,
          visibleWindowsText,
          maxScale: scaleRow.maxScale,
          minScale: scaleRow.minScale,
          visibilityStatus: scaleRow.visibilityStatus,
          evidence: "native-scale-track",
          appliesTo: "embedded-effect-mesh",
        });
      }
    }
  }

  items.sort((left, right) => {
    if (left.rel !== right.rel) return left.rel.localeCompare(right.rel);
    if (left.actionKey !== right.actionKey) return left.actionKey.localeCompare(right.actionKey);
    if (left.animationPath !== right.animationPath) return left.animationPath.localeCompare(right.animationPath);
    return Number(left.boneIndex) - Number(right.boneIndex);
  });

  return {
    generatedAt,
    count: items.length,
    items,
  };
}

function summarize(items, animationFiles) {
  const byStatus = {};
  const byActionKey = {};
  const models = new Set();
  for (const item of items) {
    byStatus[item.visibilityStatus] = (byStatus[item.visibilityStatus] || 0) + 1;
    if (item.actionKey) byActionKey[item.actionKey] = (byActionKey[item.actionKey] || 0) + 1;
    if (item.modelLabel) models.add(item.modelLabel);
  }
  return {
    rows: items.length,
    models: models.size,
    animationFiles,
    byStatus,
    byActionKey,
  };
}

function animationPathLookup(animationIndexPath) {
  const lookup = new Map();
  for (const row of readTsv(animationIndexPath)) {
    if (row.category && row.category !== "animation") continue;
    const filePath = row.linkedPath || row.filePath;
    if (row.relativePath && filePath) lookup.set(row.relativePath, filePath);
  }
  return lookup;
}

function exportRuntimeAttachmentVisibilityManifest({
  bindingsPath = defaultBindingsPath,
  animationIndexPath = defaultAnimationIndexPath,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
  threshold = DEFAULT_VISIBLE_SCALE_THRESHOLD,
} = {}) {
  const bindings = JSON.parse(fs.readFileSync(bindingsPath, "utf8"));
  const animationFilesByPath = animationPathLookup(animationIndexPath);
  const scaleRowsByAnimationPath = new Map();
  const animationPaths = [
    ...new Set((bindings.items || []).flatMap((item) => (item.animations || []).map((animation) => animation.targetRelativePath))),
  ].filter(Boolean);

  let animationFiles = 0;
  for (const animationPath of animationPaths) {
    const filePath = animationFilesByPath.get(animationPath);
    if (!filePath || !fs.existsSync(filePath)) continue;
    try {
      const rows = extractScaleVisibilityRowsForAnimation({
        animationPath,
        buffer: fs.readFileSync(filePath),
        threshold,
      });
      if (rows.length) scaleRowsByAnimationPath.set(animationPath, rows);
      animationFiles += 1;
    } catch {
      // Non-family3 or malformed animation clips are left out of this evidence manifest.
    }
  }

  const manifest = buildRuntimeAttachmentVisibilityManifest({
    bindingItems: bindings.items || [],
    scaleRowsByAnimationPath,
  });
  const summary = summarize(manifest.items, animationFiles);
  const output = { ...manifest, summary };

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(output, null, 2)}\n`);

  writeTsv(tsvOut, manifest.items, [
    "rel",
    "modelLabel",
    "sourceRelativePath",
    "animationLabel",
    "actionKey",
    "animationPath",
    "boneIndex",
    "trackMaskHex",
    "visibilityStatus",
    "visibleFrameCount",
    "hiddenFrameCount",
    "firstVisibleFrame",
    "lastVisibleFrame",
    "visibleWindowsText",
    "maxScale",
    "minScale",
    "evidence",
  ]);

  return summary;
}

if (require.main === module) {
  const summary = exportRuntimeAttachmentVisibilityManifest({
    bindingsPath: optionValue(process.argv, "--bindings", defaultBindingsPath),
    animationIndexPath: optionValue(process.argv, "--animation-index", defaultAnimationIndexPath),
    jsonOut: optionValue(process.argv, "--json-out", defaultJsonOut),
    tsvOut: optionValue(process.argv, "--tsv-out", defaultTsvOut),
    threshold: Number(optionValue(process.argv, "--threshold", String(DEFAULT_VISIBLE_SCALE_THRESHOLD))),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildRuntimeAttachmentVisibilityManifest,
  exportRuntimeAttachmentVisibilityManifest,
  extractScaleVisibilityRowsForAnimation,
  visibilityWindows,
};
