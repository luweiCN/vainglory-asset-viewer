const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildCurrentNativeParticleMaskCandidateOwnerAudit,
} = require("../tools/current_native_particle_mask_candidate_owner_audit");

test("0x210 particle-mask candidate owner is recovered but not tied to layout B", () => {
  const manifest = buildCurrentNativeParticleMaskCandidateOwnerAudit();

  assert.equal(manifest.summary.rows, 33);
  assert.equal(manifest.summary.opcodeRows, 30);
  assert.equal(manifest.summary.pointerRows, 3);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.pointerMismatchRows, 0);
  assert.equal(manifest.summary.type210RegistrationRecovered, true);
  assert.equal(manifest.summary.ownerResolveType210Recovered, true);
  assert.equal(manifest.summary.bit2OnlyUpdateRecovered, true);
  assert.equal(manifest.summary.packedCoverageRecovered, true);
  assert.equal(manifest.summary.packedCoverageCanSetParticleMaskRows, 2);
  assert.equal(manifest.summary.coverageCallbackPointerRows, 2);
  assert.equal(manifest.summary.type210CallbackPointerRows, 3);
  assert.equal(manifest.summary.directOwnerPathCallers, 0);
  assert.equal(manifest.summary.type210GlobalTextReferenceRows, 1);
  assert.equal(manifest.summary.type210GlobalOnlyOwnerReadRecovered, true);
  assert.equal(manifest.summary.renderCallbackRecovered, true);
  assert.equal(manifest.summary.renderCallbackCallsPrimitiveBuilderRecovered, true);
  assert.equal(manifest.summary.type210FamilyDirectRenderBoundaryCallRows, 0);
  assert.equal(manifest.summary.tiedToLayoutBRows, 0);
  assert.equal(manifest.summary.exactLayoutBParticleFlagProducerRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
  assert.equal(manifest.layoutBLinkStatus, "separate-type-0x210-not-layout-b-0x118");

  const globalStore = manifest.items.find((row) => row.role === "type-0x210-global-index-store");
  assert.equal(globalStore?.addressHex, "0x8cb100");
  const coverageStore = manifest.items.find((row) => row.role === "packed-coverage-flags-store");
  assert.equal(coverageStore?.addressHex, "0x8cb3c0");
  const renderCallback = manifest.items.find((row) => row.role === "type-0x210-vtable-render-callback-slot");
  assert.equal(renderCallback?.actualPointerHex, "0x8cb418");
  assert.equal(manifest.type210FamilyDirectRenderBoundaryCalls.length, 0);
});
