const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  auditNativeBinaryVersions,
  exportNativeBinaryVersionAudit,
  md5File,
  md5FromAnalysisLog,
} = require("../tools/native_binary_version_audit");

test("md5FromAnalysisLog extracts the imported binary checksum", () => {
  const log = "Loading file:///tmp/libGameKindred.so?MD5=618654fa13ae6422fa051b5bec5f2192...";
  assert.equal(md5FromAnalysisLog(log), "618654fa13ae6422fa051b5bec5f2192");
});

test("auditNativeBinaryVersions marks exact and cross-build native evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-version-"));
  const exactBinary = path.join(tempDir, "exact.bin");
  const mismatchBinary = path.join(tempDir, "mismatch.bin");
  fs.writeFileSync(exactBinary, "same");
  fs.writeFileSync(mismatchBinary, "other");
  const exactMd5 = md5File(exactBinary);

  const manifest = auditNativeBinaryVersions([
    {
      platform: "android",
      binaryPath: exactBinary,
      analysisLogText: `Loading file:///tmp/libGameKindred.so?MD5=${exactMd5}...`,
    },
    {
      platform: "ios",
      binaryPath: mismatchBinary,
      analysisLogText: "Loading file:///tmp/GameKindred?MD5=00000000000000000000000000000000...",
    },
  ]);

  assert.equal(manifest.summary.exactBuilds, 1);
  assert.equal(manifest.summary.crossBuildReferences, 1);
  assert.deepEqual(
    manifest.items.map((item) => ({ platform: item.platform, status: item.status })),
    [
      { platform: "android", status: "exact-build" },
      { platform: "ios", status: "cross-build-reference" },
    ],
  );
});

test("exportNativeBinaryVersionAudit writes viewer JSON and report TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-version-export-"));
  const binaryPath = path.join(tempDir, "binary.bin");
  const logPath = path.join(tempDir, "analysis.log");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");
  const jsonOut = path.join(tempDir, "summary.json");
  fs.writeFileSync(binaryPath, "same");
  fs.writeFileSync(logPath, `Loading file:///tmp/binary.bin?MD5=${md5File(binaryPath)}...`);

  const summary = exportNativeBinaryVersionAudit({
    entries: [{ platform: "android", binaryPath, analysisLogPath: logPath }],
    viewerOut,
    tsvOut,
    jsonOut,
  });

  assert.equal(summary.entries, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /exact-build/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /currentMd5/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.exactBuilds, 1);
});
