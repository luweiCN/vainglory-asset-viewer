const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildCurrentNativeTextureSamplerStateSemanticsAudit,
} = require("../tools/current_native_texture_sampler_state_semantics_audit");

test("current native texture sampler state semantics are opcode and table bounded", () => {
  const manifest = buildCurrentNativeTextureSamplerStateSemanticsAudit({}, "TEST_DATE");
  const { summary } = manifest;

  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.tableMismatchRows, 0);
  assert.equal(summary.wrapStatePackingRecovered, true);
  assert.equal(summary.filterStatePackingRecovered, true);
  assert.equal(summary.textureRecordBinderSamplerStateRecovered, true);
  assert.equal(summary.wrapModeTableRecovered, true);
  assert.equal(summary.mipmapMinFilterTableRecovered, true);
  assert.equal(summary.nearestLinearFilterTableRecovered, true);
  assert.equal(summary.textureSamplerStateFormulaRecovered, true);
  assert.equal(summary.textureSamplerDirtyBit, 41);
  assert.equal(summary.textureSamplerDirtyBitMaskHex, "0x20000000000");
  assert.equal(summary.wrapReservedTableRows, 1);
  assert.equal(summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.equal(summary.materialSamplerTextureObjectOwnershipRecovered, false);
  assert.equal(summary.shaderTextureFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.ok(
    manifest.items.some(
      (row) =>
        row.stage === "wrap-mode-table" &&
        row.index === 0 &&
        row.actualValueHex === "0x812f" &&
        row.meaning === "GL_CLAMP_TO_EDGE",
    ),
  );
  assert.ok(
    manifest.items.some(
      (row) =>
        row.stage === "mipmap-min-filter-table" &&
        row.index === 3 &&
        row.actualValueHex === "0x2703" &&
        row.meaning === "GL_LINEAR_MIPMAP_LINEAR",
    ),
  );
});
