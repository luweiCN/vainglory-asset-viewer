const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutAAddRecordFlagSourceAudit,
  exportCurrentNativeLayoutAAddRecordFlagSourceAudit,
} = require("../tools/current_native_layout_a_add_record_flag_source_audit");

test("layout A add-record flag source audit proves registered setup uses non-particle flags", () => {
  const manifest = buildCurrentNativeLayoutAAddRecordFlagSourceAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.typeCallbackRows, 5);
  assert.equal(manifest.summary.registeredSetupRows, 8);
  assert.equal(manifest.summary.addRecordRows, 7);
  assert.equal(manifest.summary.callbackToSetupRecovered, true);
  assert.equal(manifest.summary.registeredSetupDefaultFlagsOneRecovered, true);
  assert.equal(manifest.summary.layoutAAddRecordForwardFlagsRecovered, true);
  assert.equal(manifest.summary.registeredFlagParticleMaskRows, 0);
  assert.equal(manifest.summary.externalUnknownD7FA14CallerRows, 0);
  assert.equal(manifest.summary.directAddRecordCallerRows, 2);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);

  const callback = manifest.typeCallbackRows.find((row) => row.role === "layout-a-type-callback-a-entry");
  assert.equal(callback?.addressHex, "0xd80124");

  const call = manifest.typeCallbackRows.find((row) => row.role === "layout-a-type-callback-a-calls-setup");
  assert.equal(call?.addressHex, "0xd80134");
  assert.match(call.evidence, /0xd7f968/);

  const defaultFlags = manifest.registeredSetupRows.find((row) => row.role === "layout-a-registered-setup-default-flags-one");
  assert.equal(defaultFlags?.addressHex, "0xd7fa04");
  assert.match(defaultFlags.evidence, /w2=1/);

  const forward = manifest.addRecordRows.find((row) => row.role === "layout-a-add-record-forward-saved-flags");
  assert.equal(forward?.addressHex, "0xd7faac");
  assert.match(forward.evidence, /w2/);

  assert.deepEqual(
    manifest.directD7FA14Callers.map((row) => row.callerAddressHex),
    ["0xd7fa10"],
  );
});

test("exportCurrentNativeLayoutAAddRecordFlagSourceAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-a-add-record-flags-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutAAddRecordFlagSourceAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.registeredSetupDefaultFlagsOneRecovered, true);
  assert.equal(summary.registeredFlagParticleMaskRows, 0);
  assert.equal(summary.externalUnknownD7FA14CallerRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /layout A add-record flag source/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /w2=1/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /layout-a-add-record-forward-saved-flags/);
});
