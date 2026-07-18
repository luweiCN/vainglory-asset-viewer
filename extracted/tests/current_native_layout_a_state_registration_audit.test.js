const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildCurrentNativeLayoutAStateRegistrationAudit,
} = require("../tools/current_native_layout_a_state_registration_audit");

test("layout A state registration audit recovers the callback slot path into the 0x2fc state machine", () => {
  const manifest = buildCurrentNativeLayoutAStateRegistrationAudit();

  assert.equal(manifest.summary.moduleRegistrationCallerRows, 1);
  assert.equal(manifest.summary.typeSetupGuardCallRows, 1);
  assert.equal(manifest.summary.slotInstallerBranchRows, 3);
  assert.equal(manifest.summary.callbackReferenceRows, 4);
  assert.equal(manifest.summary.stateMachineCallbackReferenceRows, 1);
  assert.equal(manifest.summary.offset2fcDispatchCallRows, 1);
  assert.equal(manifest.summary.typeGlobalReadRows, 26);
  assert.equal(manifest.summary.typeGlobalCreateResolveReadRows, 1);
  assert.equal(manifest.summary.typeGlobalStateCallbackNeighborhoodReadRows, 1);
  assert.equal(manifest.summary.typedQueryEvidenceRows, 20);
  assert.equal(manifest.summary.typedQueryTypeLiteralRows, 1);
  assert.equal(manifest.summary.typedQueryCallRows, 1);
  assert.equal(manifest.summary.typedQueryTypeGlobalCompareRows, 1);
  assert.equal(manifest.summary.typedQueryStateByteWriteRows, 6);
  assert.equal(manifest.summary.stateFamilyDirectRenderBoundaryCallRows, 0);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  assert.equal(manifest.typeRecord.globalAddressHex, "0x3034b10");
  assert.equal(manifest.typeRecord.typeLiteral, "0xc8");
  assert.equal(manifest.typeRecord.controlLiteral, "0x90");
  assert.equal(manifest.typeRecord.recordStride, "0x2e8");
  assert.deepEqual(manifest.moduleRegistrationCallers.map((row) => row.callerAddressHex), ["0xc71748"]);
  assert.deepEqual(
    manifest.callbackReferences.map((row) => row.callbackAddressHex),
    ["0xc809d0", "0xc80ae4", "0xc80b6c", "0xc80c9c"],
  );

  const stateCallback = manifest.callbackReferences.find((row) => row.callbackRole === "offset-2fc-state-machine-callback");
  assert.equal(stateCallback?.callbackAddressHex, "0xc80c9c");
  assert.equal(stateCallback?.xrefAddressHex, "0xc809b4");
  assert.equal(stateCallback?.slotInstallerBranchAddressHex, "0xc809cc");

  assert.deepEqual(manifest.offset2fcDispatchCalls.map((row) => row.addressHex), ["0xc80cac"]);
  assert.ok(manifest.typeGlobalReads.some((row) => row.xrefAddressHex === "0xc5a034" && row.contextRole === "create-resolve-read"));
  assert.ok(
    manifest.typeGlobalReads.some(
      (row) => row.xrefAddressHex === "0xc80f2c" && row.contextRole === "state-callback-neighborhood-read",
    ),
  );
  assert.ok(
    manifest.typedQueryOpcodeRows.some(
      (row) => row.role === "typed-query-calls-object-query-helper" && row.actualTargetHex === "0xca2aac",
    ),
  );
  assert.ok(
    manifest.typedQueryOpcodeRows.some(
      (row) => row.role === "typed-query-compares-global-type-index" && row.actualOpcodeHex === "6b09015f",
    ),
  );
  assert.deepEqual(manifest.stateFamilyDirectRenderBoundaryCalls, []);

  for (const item of manifest.items) {
    assert.equal(item.renderPromotionAllowed, false);
  }
});
