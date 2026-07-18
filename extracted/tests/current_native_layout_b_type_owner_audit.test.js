const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBTypeOwnerAudit,
  exportCurrentNativeLayoutBTypeOwnerAudit,
} = require("../tools/current_native_layout_b_type_owner_audit");

test("layout B type owner audit classifies every current 0x118 type-index read", () => {
  const manifest = buildCurrentNativeLayoutBTypeOwnerAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.layoutBTypeLiteral, "0x118");
  assert.equal(manifest.layoutBTypeIndexGlobalAddressHex, "0x2d44ea8");
  assert.equal(manifest.summary.typeIndexReadRows, 12);
  assert.equal(manifest.summary.createResolveReadRows, 5);
  assert.equal(manifest.summary.queryAllocateReadRows, 6);
  assert.equal(manifest.summary.stackQueryReadRows, 1);
  assert.equal(manifest.summary.layoutBFamilyCallReadRows, 11);
  assert.equal(manifest.summary.unclassifiedReadRows, 0);
  assert.equal(manifest.summary.opcodeRows, 15);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const query = manifest.items.find((row) => row.xrefAddressHex === "0x8a97a4");
  assert.equal(query?.ownerClass, "query-or-allocate-helper");
  assert.equal(query.helperCallAddressHex, "0x8a97ac");
  assert.equal(query.helperTargetHex, "0x188e2ac");

  const create = manifest.items.find((row) => row.xrefAddressHex === "0xbab2e0");
  assert.equal(create?.ownerClass, "create-resolve-helper");
  assert.equal(create.helperCallAddressHex, "0xbab2e4");
  assert.equal(create.helperTargetHex, "0x188b8b8");

  const stackQuery = manifest.items.find((row) => row.xrefAddressHex === "0xbab748");
  assert.equal(stackQuery?.ownerClass, "stack-query-helper");
  assert.equal(stackQuery.helperCallAddressHex, "0xbab754");
  assert.equal(stackQuery.helperTargetHex, "0x188b830");
  assert.match(stackQuery.contextEvidence, /w2=0x100/);
  assert.equal(stackQuery.renderPromotionAllowed, false);
});

test("exportCurrentNativeLayoutBTypeOwnerAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-type-owner-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBTypeOwnerAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.typeIndexReadRows, 12);
  assert.equal(summary.unclassifiedReadRows, 0);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.stackQueryReadRows, 1);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /layout B type owner/i);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /stack-query-helper/);
});
