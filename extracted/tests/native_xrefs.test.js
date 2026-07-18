const test = require("node:test");
const assert = require("node:assert/strict");

const { findAdrpAddXrefs, parseInstructionLine } = require("../tools/native_xrefs");

test("parseInstructionLine reads address, mnemonic, and operands from objdump output", () => {
  const parsed = parseInstructionLine("  b2a420:\t\tadd\tx0, x8, #0x919");

  assert.deepEqual(parsed, {
    address: 0xb2a420,
    mnemonic: "add",
    operands: "x0, x8, #0x919",
    text: "  b2a420:\t\tadd\tx0, x8, #0x919",
  });
});

test("findAdrpAddXrefs matches ADRP plus ADD references to target addresses", () => {
  const lines = [
    "  b2a418:\t\tadrp\tx8, 0x1acd000",
    "  b2a41c:\t\tmov\tx1, x19",
    "  b2a420:\t\tadd\tx0, x8, #0x919",
    "  b2a424:\t\tbl\t0x8abc00",
  ];

  const matches = findAdrpAddXrefs(lines, [{ name: "HeroManifestPath", address: 0x1acd919 }]);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].targetName, "HeroManifestPath");
  assert.equal(matches[0].targetAddress, 0x1acd919);
  assert.equal(matches[0].adrpAddress, 0xb2a418);
  assert.equal(matches[0].xrefAddress, 0xb2a420);
  assert.equal(matches[0].register, "x8");
});
