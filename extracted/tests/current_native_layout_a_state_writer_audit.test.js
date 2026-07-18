const assert = require("node:assert/strict");
const test = require("node:test");

const { buildCurrentNativeLayoutAStateWriterAudit } = require("../tools/current_native_layout_a_state_writer_audit");

test("layout A state writer audit bounds 0x2fc and object-byte write sources", () => {
  const manifest = buildCurrentNativeLayoutAStateWriterAudit();

  assert.equal(manifest.summary.offset2fcAccessRows, 24);
  assert.equal(manifest.summary.offset2fcStoreRows, 4);
  assert.equal(manifest.summary.offset2fcKnownWriterRows, 4);
  assert.equal(manifest.summary.offset2fcDispatchCallerRows, 1);
  assert.equal(manifest.summary.objectByte58TrackedWriteRows, 2);
  assert.equal(manifest.summary.objectByte59TrackedWriteRows, 2);
  assert.equal(manifest.summary.objectByteUpdateCallerRows, 4);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  assert.deepEqual(
    manifest.offset2fcKnownWriters.map((row) => row.addressHex).sort(),
    ["0xb3949c", "0xc5f37c", "0xc5f470", "0xc5f55c"].sort(),
  );
  assert.deepEqual(manifest.offset2fcDispatchCallers.map((row) => row.callerAddressHex), ["0xc80cac"]);

  const roleToItem = new Map(manifest.items.map((item) => [item.role, item]));
  assert.equal(roleToItem.get("offset-2fc-state-machine-dispatch")?.opcodeMatches, true);
  assert.equal(roleToItem.get("object-byte-58-setter-sets-active")?.opcodeMatches, true);
  assert.equal(roleToItem.get("object-byte-59-derived-setter")?.opcodeMatches, true);
  assert.equal(roleToItem.get("object-byte-update-reads-byte-59")?.opcodeMatches, true);

  for (const item of manifest.items) {
    assert.equal(item.renderPromotionAllowed, false);
  }
});
