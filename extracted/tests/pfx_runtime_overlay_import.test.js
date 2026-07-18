const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildTargetRows,
  importRuntimeOverlay,
  summarizeCoverage,
} = require("../tools/pfx_runtime_overlay_import");
const { rebuildFromRuntimeOverlay } = require("../tools/pfx_runtime_overlay_rebuild");

test("summarizeCoverage exposes missing and short-read runtime overlay target samples", () => {
  const targets = buildTargetRows({
    targets: [
      { kind: "pattern16", virtualAddress: "0x1000", byteLength: 16, sourceSymbol: "DAT_A", callbacks: [{ id: 1 }] },
      { kind: "curve-table", virtualAddress: "0x2000", byteLength: 32, sourceSymbol: "DAT_B", callbacks: [{ id: 2 }] },
      { kind: "curve-table", virtualAddress: "0x3000", byteLength: 8, sourceSymbol: "DAT_C", callbacks: [] },
    ],
  });
  const overlayRows = [
    {
      kind: "pattern16",
      virtualAddress: "0x1000",
      byteLength: 16,
      bytes: Buffer.alloc(16),
    },
    {
      kind: "curve-table",
      virtualAddress: "0x2000",
      byteLength: 8,
      bytes: Buffer.alloc(8),
    },
  ];

  const { summary } = summarizeCoverage(targets, overlayRows);

  assert.equal(summary.readyForSemantics, false);
  assert.equal(summary.coveredRows, 1);
  assert.equal(summary.shortReadRows, 1);
  assert.equal(summary.missingRows, 1);
  assert.deepEqual(summary.shortReadTargetSamples[0], {
    kind: "curve-table",
    virtualAddress: "0x2000",
    byteLength: 32,
    availableBytes: 8,
    sourceSymbol: "DAT_B",
    callbackCount: 1,
  });
  assert.deepEqual(summary.missingTargetSamples[0], {
    kind: "curve-table",
    virtualAddress: "0x3000",
    byteLength: 8,
    availableBytes: 0,
    sourceSymbol: "DAT_C",
    callbackCount: 0,
  });
});

test("importRuntimeOverlay reports a missing runtime dump input directly", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-runtime-overlay-"));
  const targetsPath = path.join(tempDir, "targets.json");
  fs.writeFileSync(targetsPath, JSON.stringify({ targets: [] }));

  assert.throws(
    () => importRuntimeOverlay({ inputPath: path.join(tempDir, "missing.jsonl"), targetsPath }),
    /missing runtime dump input/,
  );
});

test("rebuildFromRuntimeOverlay explains missing overlay summaries for skip-import runs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-runtime-rebuild-"));

  assert.throws(
    () =>
      rebuildFromRuntimeOverlay({
        skipImport: true,
        validateOnly: true,
        overlaySummaryPath: path.join(tempDir, "missing-summary.json"),
        overlayPath: path.join(tempDir, "missing-overlay.jsonl"),
      }),
    /runtime overlay summary is missing/,
  );
});
