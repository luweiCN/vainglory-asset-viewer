const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildAnimationPathRecovery,
  expandPrintfIntegerPattern,
  md5Upper,
} = require("../tools/animation_path_recovery");

test("expandPrintfIntegerPattern expands integer placeholders within a bounded range", () => {
  assert.deepEqual(expandPrintfIntegerPattern("A_%d_B_%02d.anim", 1), [
    "A_0_B_0.anim",
    "A_0_B_1.anim",
    "A_1_B_0.anim",
    "A_1_B_1.anim",
  ]);
});

test("buildAnimationPathRecovery matches known build animation paths by hash", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-animation-paths-"));
  const knownPath = "Characters/moveCursor/Art/moveCursor.go.anim";
  const knownHash = md5Upper(knownPath);
  const unknownHash = "0123456789ABCDEF0123456789ABCDEF";
  const indexPath = path.join(tempDir, "animation_resource_index.tsv");
  const candidatesPath = path.join(tempDir, "animation_candidate_files.tsv");

  fs.writeFileSync(
    indexPath,
    [
      "category\trelativePath\thash\tsize\tmagic4\tfilePath\tlinkedPath",
      `animation\t${knownPath}\t${knownHash}\t12\t....\t/data/${knownHash}\t/tree/${knownPath}`,
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    candidatesPath,
    [
      "hash\tsize\tduration\tfps\tframeCount\ttrackCount\tchannelGroupCount\tnameTableValue\tfilePath\tlinkedPath",
      `${knownHash}\t12\t1\t30\t30\t4\t3\t8\t/data/${knownHash}\t/candidates/${knownHash}.anim`,
      `${unknownHash}\t20\t2\t30\t60\t6\t3\t12\t/data/${unknownHash}\t/candidates/${unknownHash}.anim`,
      "",
    ].join("\n"),
  );

  const recovery = buildAnimationPathRecovery({
    animationIndexPath: indexPath,
    candidatePath: candidatesPath,
    placeholderRows: [],
    placeholderMax: 1,
  });

  assert.deepEqual(
    recovery.matches.map((entry) => [entry.hash, entry.relativePath, entry.matchSource]),
    [[knownHash, knownPath, "known-build-path"]],
  );
  assert.deepEqual(
    recovery.unresolved.map((entry) => entry.hash),
    [unknownHash],
  );
});
