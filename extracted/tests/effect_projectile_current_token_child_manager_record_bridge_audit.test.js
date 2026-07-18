const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentTokenChildManagerRecordBridgeAudit,
  exportProjectileCurrentTokenChildManagerRecordBridgeAudit,
  readTsv,
} = require("../tools/effect_projectile_current_token_child_manager_record_bridge_audit");

function payloadSetterDownstreamAudit() {
  return {
    summary: {
      managerRuntimeRows: 2,
      renderPromotionAllowedRows: 0,
    },
    items: [
      {
        downstreamFunctionHex: "0xe39678",
        downstreamClass: "object50-runtime-manager-helper",
        argument0Provenance: "object+0x50-runtime",
        sourceHelperFunctionHex: "0x8d4fdc",
        renderPromotionAllowed: false,
      },
      {
        downstreamFunctionHex: "0xe39830",
        downstreamClass: "object50-runtime-manager-helper",
        argument0Provenance: "object+0x50-runtime",
        sourceHelperFunctionHex: "0x8d4fdc",
        renderPromotionAllowed: false,
      },
    ],
  };
}

function targetPayloadAudit() {
  return {
    parameterWriterHex: "0xe39830",
    payloadBuilderHex: "0xe3a510",
    summary: {
      dynamicParameterUpdateRows: 2,
      parameterWriterMechanicRows: 5,
      payloadBridgeRows: 4,
      targetObjectLoadRows: 9,
      payloadBuilderReturnsTargetPlus40: true,
      pfxEmitterOwnerRows: 0,
      renderPromotionAllowedRows: 0,
      opcodeRows: 17,
      opcodeMismatchRows: 0,
    },
    dynamicParameterUpdateRows: [
      { role: "dynamic-a", callTargetHex: "0xe39830", opcodeMatches: true },
      { role: "dynamic-b", callTargetHex: "0xe39830", opcodeMatches: true },
    ],
    parameterWriterMechanicRows: [
      { role: "target-parameter-writer-tailcall", addressHex: "0xe39874", opcodeMatches: true },
    ],
    payloadBridgeRows: [
      { role: "target-payload-builder-adds-0x40", addressHex: "0xe3a510", opcodeMatches: true },
    ],
  };
}

function managerDrawBridgeAudit() {
  return {
    summary: {
      targetPayloadRefreshBridgeRecovered: true,
      targetPayloadApplyRecovered: true,
      particleDrawFilterBridgeRecovered: true,
      renderQueueAppendRecovered: true,
      objectAcToBackingFlagBridgeRecovered: true,
      renderPromotionAllowedRows: 0,
      opcodeRows: 44,
      opcodeMismatchRows: 0,
    },
  };
}

function particleDrawChainAudit() {
  return {
    summary: {
      particleDrawBatchRecovered: true,
      entryArrayBuilderRecovered: true,
      sharedManagerEntryMaterializationRecovered: true,
      backingFilterRecovered: true,
      renderQueueAppendRecovered: true,
      renderTakeoverAllowedRows: 0,
    },
  };
}

function kindredBridgeAudit() {
  return {
    summary: {
      pfxEmitterManagerEntryOwnerRecovered: false,
      exactLayoutBParticleFlagProducerRows: 0,
      blockedRows: 2,
      renderPromotionAllowed: false,
    },
    rows: [
      {
        id: "pfx-emitter-manager-entry-owner",
        bridgeStage: "promotion-blocker",
        evidenceState: "blocked",
        nextRequiredEvidence: "trace concrete owner into manager record +0x8",
        renderPromotionAllowed: false,
      },
      {
        id: "exact-layout-b-particle-flag-producer",
        bridgeStage: "promotion-blocker",
        evidenceState: "blocked",
        nextRequiredEvidence: "recover exact object+0xac producer with mask 0x200",
        renderPromotionAllowed: false,
      },
    ],
  };
}

test("projectile current token child manager record bridge audit joins projectile manager path to target payload and draw blockers", () => {
  const audit = buildProjectileCurrentTokenChildManagerRecordBridgeAudit({
    payloadSetterDownstreamAudit: payloadSetterDownstreamAudit(),
    targetPayloadAudit: targetPayloadAudit(),
    managerDrawBridgeAudit: managerDrawBridgeAudit(),
    particleDrawChainAudit: particleDrawChainAudit(),
    kindredBridgeAudit: kindredBridgeAudit(),
    generatedAt: "2026-07-06T00:00:00.000Z",
  });

  assert.equal(audit.summary.rows, 6);
  assert.equal(audit.summary.projectileManagerRuntimeTargetRows, 2);
  assert.equal(audit.summary.projectileManagerRuntimeBridgeRecovered, true);
  assert.equal(audit.summary.targetParameterWriterRecovered, true);
  assert.equal(audit.summary.targetPayloadBridgeRecovered, true);
  assert.equal(audit.summary.managerDrawBridgeRecovered, true);
  assert.equal(audit.summary.particleDrawChainRecovered, true);
  assert.equal(audit.summary.pfxEmitterManagerEntryOwnerRecovered, false);
  assert.equal(audit.summary.exactLayoutBParticleFlagProducerRows, 0);
  assert.equal(audit.summary.closedBridgeRows, 5);
  assert.equal(audit.summary.blockedRows, 1);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowed, false);

  const managerPath = audit.items.find((item) => item.bridgeStage === "projectile-manager-runtime");
  assert.deepEqual(managerPath.managerRuntimeTargetHexes, ["0xe39678", "0xe39830"]);
  assert.equal(managerPath.evidenceState, "evidence-found");

  const blocker = audit.items.find((item) => item.bridgeStage === "promotion-blocker");
  assert.equal(blocker.evidenceState, "blocked");
  assert.match(blocker.nextRequiredEvidence, /manager record \+0x8/);
  assert.match(blocker.nextRequiredEvidence, /object\+0xac/);
  assert.equal(blocker.renderPromotionAllowed, false);
});

test("projectile current token child manager record bridge exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "projectile-manager-record-bridge-"));
  const payloadSetterDownstreamAuditPath = path.join(
    tempDir,
    "effect_projectile_current_token_child_payload_setter_downstream_audit.json",
  );
  const targetPayloadAuditPath = path.join(tempDir, "current_native_layout_b_target_payload_audit.json");
  const managerDrawBridgeAuditPath = path.join(tempDir, "current_native_layout_b_manager_draw_bridge_audit.json");
  const particleDrawChainAuditPath = path.join(tempDir, "current_native_particle_draw_chain_audit.json");
  const kindredBridgeAuditPath = path.join(tempDir, "kindred_current_particle_bridge_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-current-token-child-manager-record-bridge-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_token_child_manager_record_bridge_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_token_child_manager_record_bridge_audit.tsv");

  fs.writeFileSync(payloadSetterDownstreamAuditPath, JSON.stringify(payloadSetterDownstreamAudit()));
  fs.writeFileSync(targetPayloadAuditPath, JSON.stringify(targetPayloadAudit()));
  fs.writeFileSync(managerDrawBridgeAuditPath, JSON.stringify(managerDrawBridgeAudit()));
  fs.writeFileSync(particleDrawChainAuditPath, JSON.stringify(particleDrawChainAudit()));
  fs.writeFileSync(kindredBridgeAuditPath, JSON.stringify(kindredBridgeAudit()));

  const audit = exportProjectileCurrentTokenChildManagerRecordBridgeAudit({
    payloadSetterDownstreamAuditPath,
    targetPayloadAuditPath,
    managerDrawBridgeAuditPath,
    particleDrawChainAuditPath,
    kindredBridgeAuditPath,
    generatedAt: "2026-07-06T00:00:00.000Z",
    viewerOut,
    reportOut,
    tsvOut,
  });

  assert.equal(audit.summary.rows, 6);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /projectile-manager-runtime/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /targetParameterWriterRecovered/);

  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 6);
  assert.equal(rows.find((row) => row.bridgeStage === "promotion-blocker").renderPromotionAllowed, "false");
});
