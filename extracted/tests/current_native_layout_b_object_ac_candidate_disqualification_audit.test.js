const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBObjectAcCandidateDisqualificationAudit,
  exportCurrentNativeLayoutBObjectAcCandidateDisqualificationAudit,
} = require("../tools/current_native_layout_b_object_ac_candidate_disqualification_audit");

test("object +0xac candidate disqualification audit excludes the remaining broad 0x200 candidates", () => {
  const manifest = buildCurrentNativeLayoutBObjectAcCandidateDisqualificationAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.candidateRows, 2);
  assert.equal(manifest.summary.disqualifiedCandidateRows, 2);
  assert.equal(manifest.summary.type210LevelVisualsLensFlareDisqualifiedRows, 1);
  assert.equal(manifest.summary.hudMinimapCurrentOwnerDisqualifiedRows, 1);
  assert.equal(manifest.summary.exactLayoutBParticleFlagProducerRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.pointerMismatchRows, 0);
  assert.equal(manifest.summary.directCallerRows, 6);

  const lensFlareCandidate = manifest.candidateRows.find((row) => row.storeAddressHex === "0x8cb3c0");
  assert.equal(lensFlareCandidate?.classification, "type210-levelvisuals-lensflare-not-layout-b");
  assert.equal(lensFlareCandidate.includesParticleMaskCandidate, true);
  assert.equal(lensFlareCandidate.exactLayoutBParticleFlagProducer, false);
  assert.match(lensFlareCandidate.evidence, /LevelVisuals \+0x58/);
  assert.match(lensFlareCandidate.evidence, /0x26c88d0/);

  const minimapCandidate = manifest.candidateRows.find((row) => row.storeAddressHex === "0x8cffb4");
  assert.equal(minimapCandidate?.classification, "hud-minimap-current-owner-not-layout-b");
  assert.equal(minimapCandidate.includesParticleMaskCandidate, true);
  assert.equal(minimapCandidate.exactLayoutBParticleFlagProducer, false);
  assert.match(minimapCandidate.evidence, /HUD_Minimap/);
  assert.match(minimapCandidate.evidence, /0x94afb8/);

  const typePointer = manifest.pointerRows.find((row) => row.addressHex === "0x26c88d0");
  assert.equal(typePointer?.actualPointerHex, "0x8cb1ec");
  assert.equal(typePointer.pointerMatches, true);

  const thunkPointer = manifest.pointerRows.find((row) => row.addressHex === "0x26c8990");
  assert.equal(thunkPointer?.actualPointerHex, "0x8cb3f8");
  assert.equal(thunkPointer.pointerMatches, true);

  const minimapAttach = manifest.directCallerRows.find((row) => row.callerHex === "0x94afb8");
  assert.equal(minimapAttach?.targetHex, "0x8cff24");
  assert.equal(minimapAttach.mode, "bl");
});

test("exportCurrentNativeLayoutBObjectAcCandidateDisqualificationAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-object-ac-candidates-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBObjectAcCandidateDisqualificationAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.disqualifiedCandidateRows, 2);
  assert.equal(summary.exactLayoutBParticleFlagProducerRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /object \+0xac broad particle-mask candidates/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /type210-levelvisuals-lensflare-not-layout-b/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /hud-minimap-current-owner-not-layout-b/);
});
