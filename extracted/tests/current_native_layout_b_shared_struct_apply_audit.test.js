const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBSharedStructApplyAudit,
  exportCurrentNativeLayoutBSharedStructApplyAudit,
} = require("../tools/current_native_layout_b_shared_struct_apply_audit");

test("layout B shared struct apply audit maps caller fields into specialized and common apply blocks", () => {
  const manifest = buildCurrentNativeLayoutBSharedStructApplyAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.blockRows, 4);
  assert.equal(manifest.summary.wrapperRows, 3);
  assert.equal(manifest.summary.opcodeRows, 60);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.callerFieldLoadRows, 24);
  assert.equal(manifest.summary.specializedApplyRows, 3);
  assert.equal(manifest.summary.commonApplyRows, 20);
  assert.equal(manifest.summary.commonTailRows, 3);
  assert.equal(manifest.summary.directObjectAcProducerRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const createAttach = manifest.blockRows.find((row) => row.id === "create-with-external-resource-wrapper");
  assert.equal(createAttach?.specializedApplyTargetHex, "0x8d483c");
  assert.match(createAttach.callerFieldOffsets, /\+0x65/);
  assert.match(createAttach.callerFieldOffsets, /\+0x68/);

  const commonApply = manifest.blockRows.find((row) => row.id === "common-struct-apply-tail");
  assert.equal(commonApply?.role, "common-apply");
  assert.match(commonApply.evidence, /\+0x67/);
  assert.match(commonApply.evidence, /\+0x34\/\+0x38\/\+0x3c/);
});

test("exportCurrentNativeLayoutBSharedStructApplyAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-shared-apply-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBSharedStructApplyAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.callerFieldLoadRows, 24);
  assert.equal(summary.directObjectAcProducerRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /shared struct apply/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /common-struct-apply-tail/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /create-with-required-resource-wrapper/);
});
