const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildCurrentNativeLayoutARefreshStateSourceAudit,
} = require("../tools/current_native_layout_a_refresh_state_source_audit");

test("layout A refresh state source audit anchors keep and clear predicates", () => {
  const manifest = buildCurrentNativeLayoutARefreshStateSourceAudit();

  assert.equal(manifest.summary.opcodeRows, 30);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.inputByteRefreshCallerRows, 3);
  assert.equal(manifest.summary.inputByteRefreshPlus2fcCallerRows, 2);
  assert.equal(manifest.summary.statePredicateGroups, 3);
  assert.equal(manifest.summary.trackedKeepCalls, 3);
  assert.equal(manifest.summary.trackedClearCalls, 3);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  assert.deepEqual(
    manifest.inputByteRefreshCallers.map((row) => row.callerAddressHex).sort(),
    ["0x8afe80", "0x8b8348", "0x97f9ec"].sort(),
  );

  const roleToItem = new Map(manifest.items.map((item) => [item.role, item]));
  assert.equal(roleToItem.get("input-byte-primary-caller-uses-owner-plus-2fc")?.opcodeMatches, true);
  assert.equal(roleToItem.get("input-byte-cached-caller-uses-owner-plus-2fc")?.opcodeMatches, true);
  assert.equal(roleToItem.get("input-byte-list-caller-loads-state-pointer")?.opcodeMatches, true);
  assert.equal(roleToItem.get("packed-owner-input-state-keeps-layout-child")?.opcodeMatches, true);
  assert.equal(roleToItem.get("object-byte-state-clears-layout-child")?.opcodeMatches, true);

  for (const item of manifest.items) {
    assert.equal(item.renderPromotionAllowed, false);
  }
});
