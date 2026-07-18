const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildCurrentNativeLayoutAOwnerGlobalUsageAudit,
} = require("../tools/current_native_layout_a_owner_global_usage_audit");

test("layout A owner global usage scan covers all current text reads", () => {
  const manifest = buildCurrentNativeLayoutAOwnerGlobalUsageAudit();

  assert.equal(manifest.summary.globals, 5);
  assert.equal(manifest.summary.textReferenceRows, 12);
  assert.equal(manifest.summary.modeledReadRows, 10);
  assert.equal(manifest.summary.unmodeledReadRows, 2);
  assert.equal(manifest.summary.createHelperReadRows, 9);
  assert.equal(manifest.summary.ownerListScanReadRows, 3);
  assert.equal(manifest.summary.unclassifiedReadRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const unmodeledReads = manifest.items
    .filter((row) => !row.wasModeledByRegistrationAudit)
    .map((row) => row.xrefAddressHex)
    .sort();
  assert.deepEqual(unmodeledReads, ["0x914ea0", "0x916fc0"]);

  for (const addressHex of unmodeledReads) {
    const row = manifest.items.find((item) => item.xrefAddressHex === addressHex);
    assert.equal(row?.ownerListScanRead, true);
    assert.equal(row?.createHelperRead, false);
    assert.equal(row?.renderPromotionAllowed, false);
  }
});
