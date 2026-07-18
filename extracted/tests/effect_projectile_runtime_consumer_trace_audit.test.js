const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileRuntimeConsumerTraceAudit,
  exportProjectileRuntimeConsumerTraceAudit,
  readTsv,
} = require("../tools/effect_projectile_runtime_consumer_trace_audit");

test("projectile runtime consumer trace keeps current binary evidence separate from cross-build hints", () => {
  const audit = buildProjectileRuntimeConsumerTraceAudit({
    targetDispatchAudit: {
      items: [
        {
          status: "target-dispatch-vtable-offsets",
          effectToken: "Effect_Test_Projectile",
          pairedImpactEffectTokens: ["Effect_Test_Impact"],
          heroNames: ["HeroTest"],
          actionKeys: ["ability01"],
          matchedContextFunctions: ["FUN_00d8494c"],
          dispatchHelperCalls: ["FUN_00d84dfc", "FUN_00d84e4c", "FUN_00d84e9c"],
          dispatchHelperRoles: ["context-command", "runtime-dispatch-command-a", "release-or-commit-command"],
          targetVtableOffsets: ["0x38", "0x58"],
        },
      ],
    },
    semanticJoinAudit: {
      items: [
        {
          effectToken: "Effect_Test_Projectile",
          requestedOffset: "0x38",
          resolvedFunctionAddressHex: "0x1234",
          outputWriteRows: 2,
          payloadCallsiteRows: 4,
          slotStatus: "descriptor-companion-slot",
        },
      ],
    },
    currentStringReferences: [
      {
        targetName: "Effect_Test_Projectile",
        targetAddressHex: "0x2000",
        xrefAddressHex: "0x3000",
        mode: "adrp-add",
      },
      {
        targetName: "Effect_Test_Impact",
        targetAddressHex: "0x2010",
        xrefAddressHex: "0x3010",
        mode: "adrp-add",
      },
    ],
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.generatedAt, "TEST_DATE");
  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.currentStringXrefRows, 2);
  assert.equal(audit.summary.rowsWithCurrentStringXrefs, 1);
  assert.equal(audit.summary.rowsWithCurrentVtableSemantics, 1);
  assert.equal(audit.summary.rowsWithCrossBuildConsumerHints, 1);
  assert.equal(audit.summary.semanticJoinRows, 1);
  assert.equal(audit.summary.outputWriteReferenceRows, 2);
  assert.equal(audit.summary.payloadReferenceRows, 4);
  assert.equal(audit.summary.currentConsumerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);
  assert.deepEqual(audit.summary.byStatus, {
    "current-vtable-and-token-crossbuild-consumer-unresolved": 1,
  });

  const row = audit.items[0];
  assert.equal(row.status, "current-vtable-and-token-crossbuild-consumer-unresolved");
  assert.equal(row.currentBinaryEvidence, "current-token-xref|current-vtable-slot-output-payload");
  assert.equal(row.crossBuildConsumerHint, "cross-build-target-dispatch-context");
  assert.deepEqual(row.currentReferencedTokens, ["Effect_Test_Projectile", "Effect_Test_Impact"]);
  assert.deepEqual(row.currentXrefAddresses, ["0x3000", "0x3010"]);
  assert.deepEqual(row.crossBuildContextFunctions, ["FUN_00d8494c"]);
  assert.equal(row.renderPromotionAllowed, false);
  assert.match(row.blocker, /current native consumer/);
});

test("projectile runtime consumer trace exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-consumer-trace-"));
  const targetDispatchAuditPath = path.join(tempDir, "effect_projectile_target_dispatch_audit.json");
  const semanticJoinAuditPath = path.join(tempDir, "effect_projectile_vtable_semantic_join_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-runtime-consumer-trace-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_runtime_consumer_trace_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_runtime_consumer_trace_audit.tsv");

  fs.writeFileSync(
    targetDispatchAuditPath,
    JSON.stringify({
      items: [
        {
          status: "target-dispatch-vtable-offsets",
          effectToken: "Effect_Test_Projectile",
          heroNames: ["HeroTest"],
          actionKeys: ["ability01"],
          matchedContextFunctions: ["FUN_00d8494c"],
        },
      ],
    }),
  );
  fs.writeFileSync(
    semanticJoinAuditPath,
    JSON.stringify({
      items: [
        {
          effectToken: "Effect_Test_Projectile",
          requestedOffset: "0x38",
          resolvedFunctionAddressHex: "0x1234",
          outputWriteRows: 1,
          payloadCallsiteRows: 3,
        },
      ],
    }),
  );

  const summary = exportProjectileRuntimeConsumerTraceAudit({
    targetDispatchAuditPath,
    semanticJoinAuditPath,
    currentStringReferences: [
      {
        targetName: "Effect_Test_Projectile",
        targetAddressHex: "0x2000",
        xrefAddressHex: "0x3000",
        mode: "adrp-add",
      },
    ],
    viewerOut,
    reportOut,
    tsvOut,
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.rows, 1);
  assert.equal(summary.currentStringXrefRows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /current-vtable-and-token-crossbuild-consumer-unresolved/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /Effect_Test_Projectile/);
  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].currentXrefAddresses, "0x3000");
  assert.equal(rows[0].renderPromotionAllowed, "false");
});
