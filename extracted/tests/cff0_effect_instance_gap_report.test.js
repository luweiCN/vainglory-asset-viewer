const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCff0EffectInstanceGapReport,
  exportCff0EffectInstanceGapReport,
  reportRowsForManifest,
} = require("../tools/cff0_effect_instance_gap_report");

const manifest = {
  generatedAt: "2026-06-27T00:00:00.000Z",
  items: [
    {
      ownerLabel: "Ringo_DefaultSkin",
      effectToken: "Effect_Ringo_Complete",
      resolvedResourcePaths: ["Effects/Ringo/Complete.pfx"],
      resolvedActionLabels: ["attack"],
      resolvedBindingTargets: ["Bone_RightHand"],
      resolvedStartSeconds: ["0"],
      nativeSourceKinds: ["native-effect-spawn"],
    },
    {
      ownerLabel: "Ringo_DefaultSkin",
      effectToken: "Effect_Ringo_NoTiming",
      resolvedResourcePaths: ["Effects/Ringo/NoTiming.pfx"],
      resolvedActionLabels: ["ability01"],
      resolvedBindingTargets: ["Bone_LeftHand"],
      resolvedStartSeconds: [],
      nativeSourceKinds: ["native-effect-spawn"],
    },
    {
      ownerLabel: "Adagio_DefaultSkin",
      effectToken: "Effect_Adagio_NoResource",
      resolvedResourcePaths: [],
      resolvedActionLabels: [],
      resolvedBindingTargets: [],
      resolvedStartSeconds: ["0.3"],
      nativeSourceKinds: ["native-effect-vcall"],
    },
    {
      ownerLabel: "Joule_DefaultSkin",
      effectToken: "Effect_Joule_MechFork",
      resolvedResourcePaths: ["Effects/Joule/Joule_MechFork.pfx"],
      resolvedActionLabels: [],
      resolvedBindingTargets: ["Bone_Fork"],
      resolvedStartSeconds: ["0"],
      nativeSourceKinds: ["native-visual-binding"],
    },
    {
      ownerLabel: "Lyra_DefaultSkin",
      effectToken: "Effect_Lyra_DefinitionOnly",
      resolvedResourcePaths: [],
      resolvedActionLabels: [],
      resolvedBindingTargets: [],
      resolvedStartSeconds: [],
    },
  ],
};

test("buildCff0EffectInstanceGapReport summarizes unresolved CFF0 runtime evidence", () => {
  const report = buildCff0EffectInstanceGapReport(manifest, "2026-06-27T01:00:00.000Z");

  assert.equal(report.summary.rows, 5);
  assert.equal(report.summary.completeRows, 2);
  assert.equal(report.summary.gapRows, 3);
  assert.equal(report.summary.runtimeLinkedRows, 4);
  assert.equal(report.summary.definitionOnlyRows, 1);
  assert.equal(report.summary.runtimeLinkedGapRows, 2);
  assert.equal(report.summary.definitionOnlyGapRows, 1);
  assert.equal(report.summary.missingResourceRows, 2);
  assert.equal(report.summary.missingActionRows, 2);
  assert.equal(report.summary.missingBindingRows, 2);
  assert.equal(report.summary.missingTimingRows, 2);
  assert.deepEqual(report.summary.byReason, {
    "missing-action": 2,
    "missing-binding": 2,
    "missing-resource": 2,
    "missing-timing": 2,
  });
  assert.deepEqual(report.summary.topOwners[0], ["Adagio_DefaultSkin", 1]);
  assert.equal(report.items[0].missingReasons, "missing-timing");
  assert.equal(report.items[0].runtimeEvidenceKind, "native");
  assert.equal(report.items[2].runtimeEvidenceKind, "definition-only");
  assert.equal(reportRowsForManifest(report)[0].resolvedTimingCount, 0);
});

test("exportCff0EffectInstanceGapReport writes viewer JSON and audit TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-cff0-effect-instance-gaps-"));
  const graphPath = path.join(tempDir, "graph.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");
  const jsonOut = path.join(tempDir, "summary.json");
  fs.writeFileSync(graphPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const summary = exportCff0EffectInstanceGapReport({ graphPath, viewerOut, tsvOut, jsonOut });

  assert.equal(summary.gapRows, 3);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /missingTimingRows/);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /definitionOnlyGapRows/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /missingReasons/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.completeRows, 2);
});

test("buildCff0EffectInstanceGapReport does not treat inherited actions as runtime evidence", () => {
  const report = buildCff0EffectInstanceGapReport(
    {
      items: [
        {
          ownerLabel: "Celeste_Skin_Hlwn",
          effectToken: "Effect_Celeste_EventHorizon",
          resolvedResourcePaths: ["Effects/Hero014/Celeste_EventHorizon.assetbundle/Celeste_EventHorizon.pfx"],
          resolvedActionLabels: ["attack"],
          resolvedBindingTargets: [],
          resolvedStartSeconds: [],
          inheritedActionKeys: ["attack"],
          inheritedActionSource: "effect-token-unique-runtime-action",
        },
      ],
    },
    "2026-06-27T02:00:00.000Z",
  );

  assert.equal(report.summary.runtimeLinkedRows, 0);
  assert.equal(report.summary.definitionOnlyRows, 1);
  assert.equal(report.summary.runtimeLinkedGapRows, 0);
  assert.equal(report.summary.definitionOnlyGapRows, 1);
  assert.equal(report.items[0].runtimeEvidenceKind, "definition-only");
  assert.equal(report.items[0].missingReasons, "missing-binding|missing-timing");
});
