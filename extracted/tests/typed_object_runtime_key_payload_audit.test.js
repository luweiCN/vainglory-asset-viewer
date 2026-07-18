const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { loadResourceLookup, scanDataRoot } = require("../tools/typed_object_runtime_key_payload_audit");

function makeLookup(tempDir, matched = []) {
  const resourceIndexPath = path.join(tempDir, "build_resource_index.json");
  const symbolsPath = path.join(tempDir, "cff0_definition_symbols.tsv");
  fs.writeFileSync(resourceIndexPath, `${JSON.stringify({ matched })}\n`);
  fs.writeFileSync(symbolsPath, "relativePath\thash\tsymbol\n");
  return loadResourceLookup({
    buildResourceIndexPath: resourceIndexPath,
    definitionSymbolsPath: symbolsPath,
  });
}

function writeRuntimeKeyFrame(filePath, keyBytes) {
  const buffer = Buffer.alloc(96);
  buffer.writeUInt16BE(0x47, 0);
  buffer.writeUInt16BE(0x046f, 2);
  Buffer.from(keyBytes).copy(buffer, 4);
  fs.writeFileSync(filePath, buffer);
}

test("typed object payload audit keeps structural hits separate from usable runtime keys", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-typed-payload-"));
  const dataRoot = path.join(tempDir, "Data");
  fs.mkdirSync(dataRoot);
  writeRuntimeKeyFrame(path.join(dataRoot, "structural.bin"), [0x01, 0x02, 0x03, 0x00]);

  const audit = scanDataRoot({ dataRoot, lookup: makeLookup(tempDir) });

  assert.equal(audit.frameCandidateCount, 1);
  assert.equal(audit.resourceLikeKeyStringCount, 0);
  assert.equal(audit.resourceIndexedRuntimeKeyCandidateCount, 0);
  assert.equal(audit.reviewableRuntimeKeyCandidateCount, 0);
  assert.equal(audit.lowConfidenceStructuralCandidateCount, 1);
  assert.equal(audit.state, "structural-payload-fields-no-usable-runtime-key");
});

test("typed object payload audit reports resource-like keys without promoting them to active proof", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-typed-payload-"));
  const dataRoot = path.join(tempDir, "Data");
  fs.mkdirSync(dataRoot);
  writeRuntimeKeyFrame(path.join(dataRoot, "resource-like.bin"), "PreviewLevelKey\0");

  const audit = scanDataRoot({ dataRoot, lookup: makeLookup(tempDir) });

  assert.equal(audit.keyStringCandidateCount, 1);
  assert.equal(audit.resourceLikeKeyStringCount, 1);
  assert.equal(audit.resourceIndexedRuntimeKeyCandidateCount, 0);
  assert.equal(audit.reviewableRuntimeKeyCandidateCount, 1);
  assert.equal(audit.concreteRuntimeKeyFieldMatchedResourceIndex, false);
  assert.equal(audit.activePreviewProof, false);
  assert.equal(audit.rendererTakeoverAllowed, false);
  assert.equal(audit.state, "resource-like-runtime-key-fields-no-resource-index-match");
});

test("typed object payload audit marks resource-index matches as diagnostic only", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-typed-payload-"));
  const dataRoot = path.join(tempDir, "Data");
  fs.mkdirSync(dataRoot);
  writeRuntimeKeyFrame(path.join(dataRoot, "matched.bin"), "PreviewLevelKey\0");

  const audit = scanDataRoot({
    dataRoot,
    lookup: makeLookup(tempDir, [
      {
        relativePath: "PreviewLevelKey",
        buildPath: "build://PreviewLevelKey",
        filePath: "PreviewLevelKey",
      },
    ]),
  });

  assert.equal(audit.exactKeyStringMatchCount, 1);
  assert.equal(audit.resourceIndexedRuntimeKeyCandidateCount, 1);
  assert.equal(audit.concreteRuntimeKeyFieldMatchedResourceIndex, true);
  assert.equal(audit.activePreviewProof, false);
  assert.equal(audit.rendererTakeoverAllowed, false);
  assert.equal(audit.state, "payload-fields-match-resource-index-diagnostic-only");
});
