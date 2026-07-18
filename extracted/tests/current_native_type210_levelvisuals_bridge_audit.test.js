const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeType210LevelVisualsBridgeAudit,
  exportCurrentNativeType210LevelVisualsBridgeAudit,
} = require("../tools/current_native_type210_levelvisuals_bridge_audit");

test("type 0x210 LevelVisuals bridge audit classifies the path as static lens flare primitives", () => {
  const manifest = buildCurrentNativeType210LevelVisualsBridgeAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.opcodeRows, 14);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.levelVisualsStaticLensFlareListRecovered, true);
  assert.equal(manifest.summary.levelVisualsUsesType210GlobalRecovered, true);
  assert.equal(manifest.summary.staticLensFlareResourceKeyResolveRows, 2);
  assert.equal(manifest.summary.staticLensFlareHelperRows, 2);
  assert.equal(manifest.summary.type210PrimitiveBuilderRecovered, true);
  assert.equal(manifest.summary.classifiedAsLevelVisualsLensFlareRows, 1);
  assert.equal(manifest.summary.heroPfxRenderPermissionRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const listLoad = manifest.opcodeRows.find((row) => row.role === "levelvisuals-static-lensflare-list");
  assert.equal(listLoad?.addressHex, "0x8cc3f4");
  assert.match(listLoad.evidence, /LevelVisuals \+0x58/);

  const globalLoad = manifest.opcodeRows.find((row) => row.role === "levelvisuals-loads-type210-global");
  assert.equal(globalLoad?.addressHex, "0x8cc414");
  assert.match(globalLoad.evidence, /0x3035098/);

  const builderCall = manifest.opcodeRows.find((row) => row.role === "type210-render-callback-calls-primitive-builder");
  assert.equal(builderCall?.addressHex, "0x8cb60c");
  assert.match(builderCall.evidence, /0x8cb7fc/);
});

test("exportCurrentNativeType210LevelVisualsBridgeAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-type210-levelvisuals-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeType210LevelVisualsBridgeAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.levelVisualsStaticLensFlareListRecovered, true);
  assert.equal(summary.levelVisualsUsesType210GlobalRecovered, true);
  assert.equal(summary.type210PrimitiveBuilderRecovered, true);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /LevelVisuals static lens flare/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /classifiedAsLevelVisualsLensFlareRows/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /levelvisuals-static-lensflare-list/);
});
