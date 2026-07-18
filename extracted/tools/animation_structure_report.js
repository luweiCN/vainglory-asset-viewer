const fs = require("node:fs");
const path = require("node:path");

const {
  animationDescriptorTableEnd,
  parseAnimationPackage,
  parseAnimationLayout,
  readLikelyTransformRecord,
  scanLikelyTransformRecords,
  trackDescriptorSpans,
} = require("./animation_tools");

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
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

function writeTsv(filePath, rows, columns) {
  const lines = [columns.join("\t")];
  for (const row of rows) {
    lines.push(columns.map((column) => String(row[column] ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function formatCodeSummary(trackFormatCodes) {
  const counts = new Map();
  for (const code of trackFormatCodes) counts.set(code, (counts.get(code) || 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([code, count]) => `0x${code.toString(16).padStart(3, "0")}:${count}`)
    .join(" ");
}

function countSummary(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => {
      const numericLeft = Number(left[0]);
      const numericRight = Number(right[0]);
      if (Number.isFinite(numericLeft) && Number.isFinite(numericRight) && numericLeft !== numericRight) {
        return numericLeft - numericRight;
      }
      return String(left[0]).localeCompare(String(right[0]));
    })
    .map(([value, count]) => `${value}:${count}`)
    .join(" ");
}

function formatDescriptorLengthSummary(spans) {
  return countSummary(
    spans.map((span) => `0x${span.formatCode.toString(16).padStart(3, "0")}/${span.length}`),
  );
}

function alignedTransformRunSummary(buffer, startOffset, trackCount, descriptorLength = 0) {
  if (startOffset == null || trackCount <= 0) {
    return {
      alignedTransformRunStartOffset: "",
      alignedTransformRunRecords: 0,
      alignedTransformRunComplete: false,
      alignedTransformRunEndOffset: "",
      packedDescriptorOffset: "",
      packedDescriptorLength: "",
      packedCurveDataOffset: "",
      packedCurveDataLength: "",
    };
  }

  let records = 0;
  for (let index = 0; index < trackCount; index += 1) {
    const offset = startOffset + index * 48;
    const record = readLikelyTransformRecord(buffer, offset, { allowZeroScale: true });
    if (!record) break;
    records += 1;
  }

  const endOffset = records ? startOffset + records * 48 : "";
  const packedDescriptorOffset = records === trackCount ? endOffset : "";
  const packedCurveDataOffset = records === trackCount ? endOffset + descriptorLength : "";
  return {
    alignedTransformRunStartOffset: startOffset,
    alignedTransformRunRecords: records,
    alignedTransformRunComplete: records === trackCount,
    alignedTransformRunEndOffset: endOffset,
    packedDescriptorOffset,
    packedDescriptorLength: records === trackCount ? descriptorLength : "",
    packedDescriptorBytesUsed: "",
    packedDescriptorSpanLengthSummary: "",
    formatDescriptorLengthSummary: "",
    packedCurveDataOffset,
    packedCurveDataLength: records === trackCount ? Math.max(0, buffer.length - packedCurveDataOffset) : "",
  };
}

function summarizeAnimationFile(relativePath, buffer) {
  const packageInfo = parseAnimationPackage(buffer);
  const firstEntry = packageInfo.entries[0];
  const payloadHeader = firstEntry.payloadHeader;
  const layout = parseAnimationLayout(buffer);
  const descriptorTableEnd = animationDescriptorTableEnd(layout);
  const descriptorSpans = trackDescriptorSpans(layout);
  const transformRecords = scanLikelyTransformRecords(buffer, {
    start: layout.dataOffset,
    end: buffer.length,
  });
  const firstTransform = transformRecords[0] || null;
  const alignedRun = alignedTransformRunSummary(buffer, firstTransform?.offset, layout.trackCount, layout.nameTableValue);
  const packedDescriptorSpans = alignedRun.packedDescriptorOffset === ""
    ? []
    : trackDescriptorSpans(layout, alignedRun.packedDescriptorOffset);

  return {
    relativePath,
    animDataEntryCount: packageInfo.entryCount,
    samplerFamily: firstEntry.samplerFamily,
    payloadOffset: firstEntry.payloadOffset,
    payloadSize: firstEntry.payloadSize,
    clipDuration: round(firstEntry.clipDuration, 6),
    payloadFps: round(payloadHeader.fps, 3),
    payloadFrameCount: payloadHeader.frameCount,
    payloadTrackCount: payloadHeader.trackCount,
    duration: round(layout.duration, 6),
    fps: round(layout.fps, 3),
    frameCount: layout.frameCount,
    trackCount: layout.trackCount,
    descriptorTableLength: layout.nameTableValue,
    descriptorBytesUsed: descriptorSpans.reduce((sum, span) => sum + span.length, 0),
    curveDataOffset: descriptorTableEnd,
    curveDataLength: Math.max(0, buffer.length - descriptorTableEnd),
    formatCodeSummary: formatCodeSummary(layout.trackFormatCodes),
    likelyTransformRecords: transformRecords.length,
    ...alignedRun,
    packedDescriptorBytesUsed: packedDescriptorSpans.reduce((sum, span) => sum + span.length, 0),
    packedDescriptorSpanLengthSummary: countSummary(packedDescriptorSpans.map((span) => span.length)),
    formatDescriptorLengthSummary: formatDescriptorLengthSummary(packedDescriptorSpans),
    firstTransformOffset: firstTransform?.offset ?? "",
    firstTransformQuaternion: firstTransform ? firstTransform.quaternion.map((value) => round(value)) : [],
    firstTransformTranslation: firstTransform ? firstTransform.translation.map((value) => round(value)) : [],
    firstTransformScale: firstTransform ? firstTransform.scale.map((value) => round(value)) : [],
    firstTransformQuaternionNorm: firstTransform ? round(firstTransform.quaternionNorm) : "",
  };
}

function buildAnimationStructureReport(rows, readFile = fs.readFileSync, generatedAt = new Date().toISOString()) {
  const items = [];
  const failures = [];

  for (const row of rows) {
    const filePath = row.linkedPath || row.filePath;
    try {
      items.push({
        ...summarizeAnimationFile(row.relativePath, readFile(filePath)),
        linkedPath: filePath,
      });
    } catch (error) {
      failures.push({
        relativePath: row.relativePath,
        linkedPath: filePath,
        error: error.message,
      });
    }
  }

  return {
    generatedAt,
    count: items.length,
    failureCount: failures.length,
    items,
    failures,
  };
}

function tsvRows(items) {
  return items.map((item) => ({
    ...item,
    firstTransformQuaternion: item.firstTransformQuaternion.join(","),
    firstTransformTranslation: item.firstTransformTranslation.join(","),
    firstTransformScale: item.firstTransformScale.join(","),
  }));
}

function writeAnimationStructureReport(report, { jsonOut, tsvOut, viewerOut, failuresOut }) {
  if (jsonOut) {
    fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
    fs.writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (viewerOut) {
    fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
    fs.writeFileSync(
      viewerOut,
      `${JSON.stringify({ generatedAt: report.generatedAt, count: report.count, items: report.items }, null, 2)}\n`,
    );
  }
  if (tsvOut) {
    writeTsv(tsvOut, tsvRows(report.items), [
      "relativePath",
      "animDataEntryCount",
      "samplerFamily",
      "payloadOffset",
      "payloadSize",
      "clipDuration",
      "payloadFps",
      "payloadFrameCount",
      "payloadTrackCount",
      "duration",
      "fps",
      "frameCount",
      "trackCount",
      "descriptorTableLength",
      "descriptorBytesUsed",
      "curveDataOffset",
      "curveDataLength",
      "formatCodeSummary",
      "likelyTransformRecords",
      "alignedTransformRunStartOffset",
      "alignedTransformRunRecords",
      "alignedTransformRunComplete",
      "alignedTransformRunEndOffset",
      "packedDescriptorOffset",
      "packedDescriptorLength",
      "packedDescriptorBytesUsed",
      "packedDescriptorSpanLengthSummary",
      "formatDescriptorLengthSummary",
      "packedCurveDataOffset",
      "packedCurveDataLength",
      "firstTransformOffset",
      "firstTransformQuaternion",
      "firstTransformTranslation",
      "firstTransformScale",
      "firstTransformQuaternionNorm",
      "linkedPath",
    ]);
  }
  if (failuresOut) {
    writeTsv(failuresOut, report.failures, ["relativePath", "linkedPath", "error"]);
  }
}

module.exports = {
  buildAnimationStructureReport,
  readTsv,
  summarizeAnimationFile,
  writeAnimationStructureReport,
};
