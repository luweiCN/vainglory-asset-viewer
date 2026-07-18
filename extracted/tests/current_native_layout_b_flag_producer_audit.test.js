const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBFlagProducerAudit,
  exportCurrentNativeLayoutBFlagProducerAudit,
} = require("../tools/current_native_layout_b_flag_producer_audit");

test("buildCurrentNativeLayoutBFlagProducerAudit classifies +0xac producers without promoting candidates", () => {
  const report = buildCurrentNativeLayoutBFlagProducerAudit({}, "TEST_DATE");

  assert.equal(report.generatedAt, "TEST_DATE");
  assert.equal(report.summary.accessRows, 134);
  assert.equal(report.summary.storeRows, 64);
  assert.equal(report.summary.layoutBKnownReadRows, 2);
  assert.equal(report.summary.layoutBConstructorSeedRows, 1);
  assert.equal(report.summary.layoutBFamilyFlagOverlapWriteRows, 1);
  assert.equal(report.summary.layoutBFamilyFlagOverlapNonConstructorRows, 0);
  assert.equal(report.summary.layoutBFamilyWideParticleMaskProducerRows, 0);
  assert.equal(report.summary.exactLayoutBParticleFlagProducerRows, 0);
  assert.equal(report.summary.renderPromotionAllowedRows, 0);
  assert.equal(report.summary.stackFrameFalsePositiveRows, 9);
  assert.equal(report.summary.particleMaskCandidateNotLayoutBRows, 2);
  assert.equal(report.summary.fullFieldReplacementEffectResourceRows, 8);
  assert.equal(report.summary.fullFieldReplacementEffectResourceScalarRows, 8);
  assert.equal(report.summary.fullFieldReplacementUnknownOwnerRows, 0);
  assert.equal(report.summary.activeChildSelectorStateNotLayoutBRows, 3);
  assert.equal(report.summary.counterUpdateNotLayoutBRows, 8);
  assert.equal(report.summary.fullFieldReplacementUnrelatedConfigRows, 1);

  const candidate = report.items.find((row) => row.addressHex === "0x8cb3c0");
  assert.equal(candidate?.producerClass, "particle-mask-candidate-not-layout-b");
  assert.equal(candidate.includesParticleMask, true);
  assert.equal(candidate.exactLayoutBParticleFlagProducer, false);

  const unrelatedConfig = report.items.find((row) => row.addressHex === "0x8ec6c0");
  assert.equal(unrelatedConfig?.producerClass, "full-field-replacement-unrelated-config");
  assert.match(unrelatedConfig.fieldPath, /rankedEloBucket/);

  const effectResource = report.items.find((row) => row.addressHex === "0xc8eb80");
  assert.equal(effectResource?.producerClass, "full-field-replacement-effect-resource-scalar-not-layout-b");
  assert.match(effectResource.fieldPath, /Effect_Kraken_Attack/);
  assert.match(effectResource.mutationSummary, /scalar constant/);

  const duplicateEffectResource = report.items.find((row) => row.addressHex === "0xc8ed00");
  assert.equal(duplicateEffectResource?.producerClass, "full-field-replacement-effect-resource-scalar-not-layout-b");
  assert.match(duplicateEffectResource.fieldPath, /Effect_Kraken_Attack/);

  const selectorState = report.items.find((row) => row.addressHex === "0x9a2744");
  assert.equal(selectorState?.producerClass, "active-child-selector-state-not-layout-b");
  assert.match(selectorState.mutationSummary, /selected-child state/);

  assert.deepEqual(
    report.layoutBFamilyFlagOverlapWrites.map((row) => row.addressHex),
    ["0x8d2dbc"],
  );
  const wideSeed = report.layoutBFamilyFlagOverlapWrites[0];
  assert.equal(wideSeed.accessKind, "str-x");
  assert.equal(wideSeed.objectFieldOffsetHex, "0xa8");
  assert.equal(wideSeed.byteWidth, 8);
  assert.equal(wideSeed.exactLayoutBParticleFlagProducer, false);
});

test("exportCurrentNativeLayoutBFlagProducerAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-flag-producer-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBFlagProducerAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.exactLayoutBParticleFlagProducerRows, 0);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.storeRows, 64);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /current Android layout B/i);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /particle-mask-candidate-not-layout-b/);
});
