const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildCurrentNativeParticleRegistrationChainAudit,
} = require("../tools/current_native_particle_registration_chain_audit");

test("layout A explicit refresh direct caller is non-particle flag evidence", () => {
  const manifest = buildCurrentNativeParticleRegistrationChainAudit();

  assert.equal(manifest.summary.layoutAExplicitRefreshEntryDirectCallers, 1);
  assert.equal(manifest.summary.layoutAExplicitRefreshMidBlockDirectCallers, 0);
  assert.equal(manifest.summary.layoutAExplicitRefreshCallsiteRows, 1);
  assert.equal(manifest.summary.layoutAExplicitRefreshCallsiteOpcodeMismatchRows, 0);
  assert.equal(manifest.summary.layoutAExplicitRefreshParticleMaskRows, 0);
  assert.equal(manifest.summary.layoutAExplicitRefreshOnlyNonParticleFlags, true);

  const [callsite] = manifest.layoutAExplicitRefreshCallsites;
  assert.equal(callsite.addressHex, "0x8abf54");
  assert.equal(callsite.target, "0xd7ffdc");
  assert.equal(callsite.flagValues, "0x5|0x1");
  assert.equal(callsite.containsParticleMask, false);
  assert.equal(callsite.primaryValueAddressHex, "0x8abf50");
  assert.equal(callsite.fallbackValueAddressHex, "0x8ac984");
  assert.equal(callsite.fallbackBranchAddressHex, "0x8ac988");
  assert.equal(callsite.opcodeMatches, true);
});
