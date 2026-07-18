const assert = require("node:assert/strict");
const test = require("node:test");

const { engineHashHex } = require("../tools/engine_hash");

test("engineHashHex matches Vainglory bind token skeleton hashes", () => {
  assert.equal(engineHashHex("root_bnd"), "6743820F");
  assert.equal(engineHashHex("spineC_bnd"), "5A157984");
  assert.equal(engineHashHex("headA_bnd"), "4FFE12BE");
  assert.equal(engineHashHex("headB_bnd"), "43446C62");
  assert.equal(engineHashHex("rHandIK_bnd"), "5541D42F");
  assert.equal(engineHashHex("sword_bnd"), "0DA9777E");
  assert.equal(engineHashHex("shield_bnd"), "379816F6");
});
