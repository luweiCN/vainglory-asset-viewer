#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultPayloadSetterDownstreamAuditPath =
  "extracted/reports/effect_projectile_current_token_child_payload_setter_downstream_audit.json";
const defaultTargetPayloadAuditPath = "extracted/reports/current_native_layout_b_target_payload_audit.json";
const defaultManagerDrawBridgeAuditPath = "extracted/reports/current_native_layout_b_manager_draw_bridge_audit.json";
const defaultParticleDrawChainAuditPath = "extracted/reports/current_native_particle_draw_chain_audit.json";
const defaultKindredBridgeAuditPath = "extracted/reports/kindred_current_particle_bridge_audit.json";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-token-child-manager-record-bridge-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_token_child_manager_record_bridge_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_token_child_manager_record_bridge_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function uniqueInOrder(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function readJson(filePath, fallback = {}) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function tsvEscape(value) {
  return Array.isArray(value)
    ? value.join("|").replace(/\t/g, " ").replace(/\r?\n/g, " ")
    : String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows || []) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function readTsv(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function managerRuntimeRows(payloadSetterDownstreamAudit) {
  return (payloadSetterDownstreamAudit.items || []).filter(
    (item) =>
      item.downstreamClass === "object50-runtime-manager-helper" &&
      item.argument0Provenance === "object+0x50-runtime",
  );
}

function targetParameterWriterRecovered(targetPayloadAudit, managerTargetHexes) {
  const summary = targetPayloadAudit.summary || {};
  const dynamicRows = targetPayloadAudit.dynamicParameterUpdateRows || [];
  const mechanicRows = targetPayloadAudit.parameterWriterMechanicRows || [];
  return (
    managerTargetHexes.includes(targetPayloadAudit.parameterWriterHex || "0xe39830") &&
    summary.dynamicParameterUpdateRows > 0 &&
    summary.parameterWriterMechanicRows > 0 &&
    summary.opcodeMismatchRows === 0 &&
    dynamicRows.some((row) => row.callTargetHex === (targetPayloadAudit.parameterWriterHex || "0xe39830")) &&
    mechanicRows.some((row) => row.role === "target-parameter-writer-tailcall")
  );
}

function targetPayloadBridgeRecovered(targetPayloadAudit) {
  const summary = targetPayloadAudit.summary || {};
  return Boolean(
    summary.payloadBridgeRows > 0 &&
      summary.targetObjectLoadRows > 0 &&
      summary.payloadBuilderReturnsTargetPlus40 &&
      summary.opcodeMismatchRows === 0,
  );
}

function managerDrawBridgeRecovered(managerDrawBridgeAudit) {
  const summary = managerDrawBridgeAudit.summary || {};
  return Boolean(
    summary.targetPayloadRefreshBridgeRecovered &&
      summary.targetPayloadApplyRecovered &&
      summary.particleDrawFilterBridgeRecovered &&
      summary.renderQueueAppendRecovered &&
      summary.opcodeMismatchRows === 0,
  );
}

function particleDrawChainRecovered(particleDrawChainAudit) {
  const summary = particleDrawChainAudit.summary || {};
  return Boolean(
    summary.particleDrawBatchRecovered &&
      summary.entryArrayBuilderRecovered &&
      summary.sharedManagerEntryMaterializationRecovered &&
      summary.backingFilterRecovered &&
      summary.renderQueueAppendRecovered &&
      summary.renderTakeoverAllowedRows === 0,
  );
}

function bridgeRow({ bridgeStage, evidenceState, evidenceSummary, sourceReports, recoveredFields, nextRequiredEvidence }) {
  return {
    status: "token-child-manager-record-bridge-diagnostic",
    bridgeStage,
    evidenceState,
    sourceReports,
    recoveredFields,
    evidenceSummary,
    nextRequiredEvidence,
    renderPromotionAllowed: false,
  };
}

function buildProjectileCurrentTokenChildManagerRecordBridgeAudit({
  payloadSetterDownstreamAudit = {},
  targetPayloadAudit = {},
  managerDrawBridgeAudit = {},
  particleDrawChainAudit = {},
  kindredBridgeAudit = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const managerRows = managerRuntimeRows(payloadSetterDownstreamAudit);
  const managerTargetHexes = uniqueInOrder(managerRows.map((row) => row.downstreamFunctionHex));
  const projectileManagerRuntimeBridgeRecovered =
    managerTargetHexes.includes("0xe39678") && managerTargetHexes.includes("0xe39830");
  const targetWriterRecovered = targetParameterWriterRecovered(targetPayloadAudit, managerTargetHexes);
  const targetBridgeRecovered = targetPayloadBridgeRecovered(targetPayloadAudit);
  const drawBridgeRecovered = managerDrawBridgeRecovered(managerDrawBridgeAudit);
  const particleBridgeRecovered = particleDrawChainRecovered(particleDrawChainAudit);
  const kindredSummary = kindredBridgeAudit.summary || {};
  const pfxEmitterManagerEntryOwnerRecovered = Boolean(kindredSummary.pfxEmitterManagerEntryOwnerRecovered);
  const exactLayoutBParticleFlagProducerRows = Number(kindredSummary.exactLayoutBParticleFlagProducerRows || 0);

  const items = [
    {
      ...bridgeRow({
        bridgeStage: "projectile-manager-runtime",
        evidenceState: projectileManagerRuntimeBridgeRecovered ? "evidence-found" : "missing",
        sourceReports: [defaultPayloadSetterDownstreamAuditPath],
        recoveredFields: ["object+0x50", "0xe39678", "0xe39830"],
        evidenceSummary:
          "current projectile token child setter downstream path reaches object+0x50 runtime manager helpers",
        nextRequiredEvidence: projectileManagerRuntimeBridgeRecovered
          ? ""
          : "recover both object+0x50 runtime helper targets from the projectile token setter downstream path",
      }),
      managerRuntimeTargetHexes: managerTargetHexes,
      sourceHelperFunctionHexes: uniqueInOrder(managerRows.map((row) => row.sourceHelperFunctionHex)),
    },
    bridgeRow({
      bridgeStage: "target-parameter-writer",
      evidenceState: targetWriterRecovered ? "evidence-found" : "missing",
      sourceReports: [defaultTargetPayloadAuditPath],
      recoveredFields: ["object+0x50", "target+0x80", "0xe39830", "0xe3ec44"],
      evidenceSummary: "layout B target payload audit proves object+0x50 parameter updates through 0xe39830",
      nextRequiredEvidence: targetWriterRecovered
        ? ""
        : "recover the target parameter writer mechanics from object+0x50 into typed parameter records",
    }),
    bridgeRow({
      bridgeStage: "target-payload-bridge",
      evidenceState: targetBridgeRecovered ? "evidence-found" : "missing",
      sourceReports: [defaultTargetPayloadAuditPath],
      recoveredFields: ["object+0x50", "target+0x40", "0xe3a510"],
      evidenceSummary: "layout B final payload bridge materializes target+0x40 through 0xe3a510",
      nextRequiredEvidence: targetBridgeRecovered ? "" : "recover target payload builder and final target object load",
    }),
    bridgeRow({
      bridgeStage: "manager-draw-bridge",
      evidenceState: drawBridgeRecovered ? "evidence-found" : "missing",
      sourceReports: [defaultManagerDrawBridgeAuditPath],
      recoveredFields: ["object+0xb0", "manager record", "backing record", "target+0x40"],
      evidenceSummary: "layout B manager draw bridge links target payload refresh into backing records and queue append",
      nextRequiredEvidence: drawBridgeRecovered ? "" : "recover manager refresh, backing apply, draw filter, and queue append",
    }),
    bridgeRow({
      bridgeStage: "particle-draw-chain",
      evidenceState: particleBridgeRecovered ? "evidence-found" : "missing",
      sourceReports: [defaultParticleDrawChainAuditPath],
      recoveredFields: ["manager record+0x8", "backing record flags", "entry array", "render queue"],
      evidenceSummary: "current particle draw chain builds entry arrays from manager records and appends render work",
      nextRequiredEvidence: particleBridgeRecovered ? "" : "recover particle draw batch, entry array, backing filter, and queue append",
    }),
    bridgeRow({
      bridgeStage: "promotion-blocker",
      evidenceState:
        pfxEmitterManagerEntryOwnerRecovered && exactLayoutBParticleFlagProducerRows > 0 ? "evidence-found" : "blocked",
      sourceReports: [defaultKindredBridgeAuditPath],
      recoveredFields: ["manager record+0x8", "object+0xac", "mask 0x200"],
      evidenceSummary:
        "bridge remains diagnostic-only until the concrete PFX/emitter manager-entry owner and exact layout-B particle flag producer are recovered",
      nextRequiredEvidence: [
        pfxEmitterManagerEntryOwnerRecovered ? "" : "trace concrete PFX/emitter owner into manager record +0x8",
        exactLayoutBParticleFlagProducerRows > 0 ? "" : "recover exact object+0xac producer with mask 0x200",
      ]
        .filter(Boolean)
        .join("; "),
    }),
  ];

  const summary = summarize(items, {
    managerRows,
    projectileManagerRuntimeBridgeRecovered,
    targetWriterRecovered,
    targetBridgeRecovered,
    drawBridgeRecovered,
    particleBridgeRecovered,
    pfxEmitterManagerEntryOwnerRecovered,
    exactLayoutBParticleFlagProducerRows,
  });

  return {
    generatedAt,
    source: {
      payloadSetterDownstreamAuditPath: defaultPayloadSetterDownstreamAuditPath,
      targetPayloadAuditPath: defaultTargetPayloadAuditPath,
      managerDrawBridgeAuditPath: defaultManagerDrawBridgeAuditPath,
      particleDrawChainAuditPath: defaultParticleDrawChainAuditPath,
      kindredBridgeAuditPath: defaultKindredBridgeAuditPath,
    },
    policy:
      "diagnostic-only current projectile token child manager-record bridge audit; joined bridge evidence does not promote rendering while PFX/emitter owner and exact particle flag producer remain unresolved",
    summary,
    items,
  };
}

function summarize(
  items,
  {
    managerRows,
    projectileManagerRuntimeBridgeRecovered,
    targetWriterRecovered,
    targetBridgeRecovered,
    drawBridgeRecovered,
    particleBridgeRecovered,
    pfxEmitterManagerEntryOwnerRecovered,
    exactLayoutBParticleFlagProducerRows,
  },
) {
  const closedBridgeRows = items.filter((item) => item.evidenceState === "evidence-found").length;
  const blockedRows = items.filter((item) => item.evidenceState === "blocked").length;
  const renderPromotionAllowed =
    projectileManagerRuntimeBridgeRecovered &&
    targetWriterRecovered &&
    targetBridgeRecovered &&
    drawBridgeRecovered &&
    particleBridgeRecovered &&
    pfxEmitterManagerEntryOwnerRecovered &&
    exactLayoutBParticleFlagProducerRows > 0;
  return {
    rows: items.length,
    projectileManagerRuntimeTargetRows: managerRows.length,
    projectileManagerRuntimeBridgeRecovered,
    targetParameterWriterRecovered: targetWriterRecovered,
    targetPayloadBridgeRecovered: targetBridgeRecovered,
    managerDrawBridgeRecovered: drawBridgeRecovered,
    particleDrawChainRecovered: particleBridgeRecovered,
    pfxEmitterManagerEntryOwnerRecovered,
    exactLayoutBParticleFlagProducerRows,
    closedBridgeRows,
    blockedRows,
    renderPromotionAllowedRows: renderPromotionAllowed ? 1 : 0,
    renderPromotionAllowed,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    bridgeStage: item.bridgeStage,
    evidenceState: item.evidenceState,
    sourceReports: item.sourceReports,
    recoveredFields: item.recoveredFields,
    managerRuntimeTargetHexes: item.managerRuntimeTargetHexes || [],
    sourceHelperFunctionHexes: item.sourceHelperFunctionHexes || [],
    evidenceSummary: item.evidenceSummary,
    nextRequiredEvidence: item.nextRequiredEvidence,
    renderPromotionAllowed: item.renderPromotionAllowed,
  }));
}

function exportProjectileCurrentTokenChildManagerRecordBridgeAudit({
  payloadSetterDownstreamAuditPath = defaultPayloadSetterDownstreamAuditPath,
  targetPayloadAuditPath = defaultTargetPayloadAuditPath,
  managerDrawBridgeAuditPath = defaultManagerDrawBridgeAuditPath,
  particleDrawChainAuditPath = defaultParticleDrawChainAuditPath,
  kindredBridgeAuditPath = defaultKindredBridgeAuditPath,
  payloadSetterDownstreamAudit = readJson(payloadSetterDownstreamAuditPath, { items: [] }),
  targetPayloadAudit = readJson(targetPayloadAuditPath, { summary: {} }),
  managerDrawBridgeAudit = readJson(managerDrawBridgeAuditPath, { summary: {} }),
  particleDrawChainAudit = readJson(particleDrawChainAuditPath, { summary: {} }),
  kindredBridgeAudit = readJson(kindredBridgeAuditPath, { summary: {} }),
  generatedAt = new Date().toISOString(),
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildProjectileCurrentTokenChildManagerRecordBridgeAudit({
    payloadSetterDownstreamAudit,
    targetPayloadAudit,
    managerDrawBridgeAudit,
    particleDrawChainAudit,
    kindredBridgeAudit,
    generatedAt,
  });
  audit.source = {
    payloadSetterDownstreamAuditPath,
    targetPayloadAuditPath,
    managerDrawBridgeAuditPath,
    particleDrawChainAuditPath,
    kindredBridgeAuditPath,
  };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "bridgeStage",
    "evidenceState",
    "sourceReports",
    "recoveredFields",
    "managerRuntimeTargetHexes",
    "sourceHelperFunctionHexes",
    "evidenceSummary",
    "nextRequiredEvidence",
    "renderPromotionAllowed",
  ]);
  return audit;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentTokenChildManagerRecordBridgeAudit({
    payloadSetterDownstreamAuditPath: optionValue(
      args,
      "--payload-setter-downstream-audit",
      defaultPayloadSetterDownstreamAuditPath,
    ),
    targetPayloadAuditPath: optionValue(args, "--target-payload-audit", defaultTargetPayloadAuditPath),
    managerDrawBridgeAuditPath: optionValue(args, "--manager-draw-bridge-audit", defaultManagerDrawBridgeAuditPath),
    particleDrawChainAuditPath: optionValue(args, "--particle-draw-chain-audit", defaultParticleDrawChainAuditPath),
    kindredBridgeAuditPath: optionValue(args, "--kindred-bridge-audit", defaultKindredBridgeAuditPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  }).summary;
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentTokenChildManagerRecordBridgeAudit,
  exportProjectileCurrentTokenChildManagerRecordBridgeAudit,
  readTsv,
};
