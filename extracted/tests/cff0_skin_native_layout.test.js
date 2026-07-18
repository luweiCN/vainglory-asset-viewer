const assert = require("node:assert/strict");
const test = require("node:test");

const { annotateNativeLayout, buildNativeRanges } = require("../tools/cff0_skin_native_layout");

const schemaRows = [
  {
    typeName: "SkinRep",
    fieldIndex: "0",
    fieldOffset: "0x0",
    nextFieldOffset: "0x8",
    exactSpanCandidates: "",
    candidateTypes: "",
  },
  {
    typeName: "SkinRep",
    fieldIndex: "1",
    fieldOffset: "0x8",
    nextFieldOffset: "0x40",
    exactSpanCandidates: "AnimatedMesh@0x101857b40:0x38:kind1:-0x20:exact-span",
    candidateTypes: "",
  },
  {
    typeName: "SkinRep",
    fieldIndex: "2",
    fieldOffset: "0x40",
    nextFieldOffset: "0x48",
    exactSpanCandidates: "StaticEntity*@0x101856c78:0x8:kind3:+0x28:exact-span",
    candidateTypes: "",
  },
  {
    typeName: "SkinRep",
    fieldIndex: "6",
    fieldOffset: "0x60",
    nextFieldOffset: "0x68",
    exactSpanCandidates: "Alias*@0x101856d20:0x8:kind3:+0x48:exact-span",
    candidateTypes: "",
  },
  {
    typeName: "AnimatedMesh",
    fieldIndex: "0",
    fieldOffset: "0x0",
    nextFieldOffset: "0x8",
    exactSpanCandidates: "",
    candidateTypes: "",
  },
  {
    typeName: "AnimatedMesh",
    fieldIndex: "3",
    fieldOffset: "0x18",
    nextFieldOffset: "0x28",
    exactSpanCandidates: "AnimationPool@0x101857ae8:0x10:kind1:-0x20:exact-span",
    candidateTypes: "",
  },
  {
    typeName: "AnimatedMesh",
    fieldIndex: "4",
    fieldOffset: "0x28",
    nextFieldOffset: "0x30",
    exactSpanCandidates: "",
    candidateTypes: "",
  },
];

test("buildNativeRanges expands embedded AnimatedMesh ranges under SkinRep", () => {
  const ranges = buildNativeRanges(schemaRows);

  assert.ok(ranges.some((range) => range.nativePath === "SkinRep.field1/AnimatedMesh.field0" && range.start === 0x8));
  assert.ok(ranges.some((range) => range.nativePath === "SkinRep.field1/AnimatedMesh.field3" && range.start === 0x20));
});

test("annotateNativeLayout prefers nested native inline paths", () => {
  const [meshField, skeletonLikeField, topLevelField, outsideField] = annotateNativeLayout(
    [
      { localFieldOffset: "8", role: "mesh" },
      { localFieldOffset: "32", role: "skeleton" },
      { localFieldOffset: "64", role: "object-ref" },
      { localFieldOffset: "200", role: "effect-label" },
    ],
    schemaRows,
  );

  assert.equal(meshField.nativeInlinePath, "SkinRep.field1/AnimatedMesh.field0");
  assert.equal(skeletonLikeField.nativeInlinePath, "SkinRep.field1/AnimatedMesh.field3");
  assert.equal(topLevelField.nativeInlinePath, "SkinRep.field2");
  assert.equal(outsideField.nativeInlineStatus, "outside-skinrep-inline");
});

test("annotateNativeLayout expands compact format 4 offsets before matching native fields", () => {
  const [compactField, nativeField] = annotateNativeLayout(
    [
      { definitionFormatByte: "4", localFieldOffset: "48", role: "object-ref" },
      { definitionFormatByte: "5", localFieldOffset: "96", role: "object-ref" },
    ],
    schemaRows,
  );

  assert.equal(compactField.nativeInlinePath, "SkinRep.field6");
  assert.equal(compactField.nativeComparableOffset, "96");
  assert.equal(nativeField.nativeInlinePath, "SkinRep.field6");
  assert.equal(nativeField.nativeComparableOffset, "96");
});
