#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { buildCurrentNativeLayoutBCallbackBoundaryAudit } = require("./current_native_layout_b_callback_boundary_audit");
const { buildCurrentNativeLayoutBCommonApplySetterFieldsAudit } = require("./current_native_layout_b_common_apply_setter_fields_audit");
const { buildCurrentNativeLayoutBComponentSlotRegistrationAudit } = require("./current_native_layout_b_component_slot_registration_audit");
const { buildCurrentNativeLayoutBComponentTableEntryAudit } = require("./current_native_layout_b_component_table_entry_audit");
const { buildCurrentNativeLayoutBDirectCallerStructBuilderAudit } = require("./current_native_layout_b_direct_caller_struct_builder_audit");
const { buildCurrentNativeLayoutBEntryOwnerAudit } = require("./current_native_layout_b_entry_owner_audit");
const { buildCurrentNativeLayoutBFlagProducerAudit } = require("./current_native_layout_b_flag_producer_audit");
const { buildCurrentNativeLayoutBIndirectSlotAudit } = require("./current_native_layout_b_indirect_slot_audit");
const { buildCurrentNativeLayoutBObjectAcCandidateDisqualificationAudit } = require("./current_native_layout_b_object_ac_candidate_disqualification_audit");
const { buildCurrentNativeLayoutBObjectAcRuntimeCaptureTargets } = require("./current_native_layout_b_object_ac_runtime_capture_targets");
const { buildCurrentNativeLayoutBObjectAcStoreCoverageAudit } = require("./current_native_layout_b_object_ac_store_coverage_audit");
const { buildCurrentNativeLayoutBResourceCallerDynamicFieldsAudit } = require("./current_native_layout_b_resource_caller_dynamic_fields_audit");
const { buildCurrentNativeObjectAcOwnerTraceAudit } = require("./current_native_object_ac_owner_trace_audit");
const { buildCurrentNativeObjectAcWidthOverlapAudit } = require("./current_native_object_ac_width_overlap_audit");
const { summarizeCapture } = require("./current_native_layout_b_object_ac_runtime_capture_summary");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultCaptureInput = "extracted/reports/layout_b_object_ac_runtime_capture.jsonl";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-object-ac-producer-gate-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_object_ac_producer_gate_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_object_ac_producer_gate_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function closedRow(id, gate, source, evidence) {
  return {
    id,
    gate,
    source,
    evidenceState: "negative-closed",
    resolvedProducerRows: 0,
    needsRuntimeCapture: false,
    renderPromotionAllowed: false,
    evidence,
  };
}

function buildGateRows(audits) {
  const rows = [];

  rows.push(
    closedRow(
      "exact-strw-store-scan",
      "static-direct-store",
      "current_native_layout_b_flag_producer_audit",
      `${audits.flagProducer.summary.storeRows} exact +0xac str-w stores scanned; ${audits.flagProducer.summary.exactLayoutBParticleFlagProducerRows} exact layout B 0x200 producers.`,
    ),
  );
  rows.push(
    closedRow(
      "broad-mask-candidate-disqualification",
      "static-direct-store",
      "current_native_layout_b_object_ac_candidate_disqualification_audit",
      `${audits.candidateDisqualification.summary.disqualifiedCandidateRows}/${audits.candidateDisqualification.summary.candidateRows} broad 0x200-looking candidates are disqualified as non-layout-B owners.`,
    ),
  );
  rows.push(
    closedRow(
      "layout-b-family-width-overlap",
      "static-width-overlap",
      "current_native_object_ac_width_overlap_audit",
      `${audits.widthOverlap.summary.totalOverlapStoreRows} global width-overlap stores scanned; ${audits.widthOverlap.summary.layoutBFamilyNonConstructorRows} layout B non-constructor overlaps.`,
    ),
  );
  rows.push(
    closedRow(
      "out-of-family-owner-trace",
      "static-owner-trace",
      "current_native_object_ac_owner_trace_audit",
      `${audits.ownerTrace.summary.candidateRows} out-of-family nonzero width-overlap rows traced; ${audits.ownerTrace.summary.rowsWithLayoutBDirectCallers} have layout B direct callers.`,
    ),
  );
  rows.push(
    closedRow(
      "layout-b-callback-direct-exits",
      "callback-boundary",
      "current_native_layout_b_callback_boundary_audit",
      `${audits.callbackBoundary.summary.branchRows} layout B direct exits checked; ${audits.callbackBoundary.summary.candidateTargetHitRows} hit out-of-family +0xac candidates.`,
    ),
  );
  rows.push(
    closedRow(
      "layout-b-store-coverage",
      "layout-b-family-store",
      "current_native_layout_b_object_ac_store_coverage_audit",
      `${audits.storeCoverage.summary.storeRows} layout B stores scanned; ${audits.storeCoverage.summary.hiddenNonConstructorObjectAcProducerRows} hidden non-constructor +0xac producers.`,
    ),
  );
  rows.push(
    closedRow(
      "layout-b-constructor-entry-owner",
      "entry-owner",
      "current_native_layout_b_entry_owner_audit",
      `${audits.entryOwner.summary.constructorObjectAcSeedRows} constructor seed rows and ${audits.entryOwner.summary.constructorParticleMaskRows} constructor 0x200 rows; constructor seeds +0xac as 2.`,
    ),
  );
  rows.push(
    closedRow(
      "layout-b-indirect-slot-shape",
      "indirect-slot",
      "current_native_layout_b_indirect_slot_audit",
      `${audits.indirectSlot.summary.callbackArgumentRows} callback argument rows recovered; ${audits.indirectSlot.summary.staticCallbackPointerRows} static callback-pointer rows.`,
    ),
  );
  rows.push(
    closedRow(
      "component-slot-routing",
      "component-routing",
      "current_native_layout_b_component_slot_registration_audit",
      `${audits.componentSlot.summary.dispatchTableRows} component dispatch rows; ${audits.componentSlot.summary.directObjectAcProducerRows} direct +0xac producers.`,
    ),
  );
  rows.push(
    closedRow(
      "component-table-entry-routing",
      "component-routing",
      "current_native_layout_b_component_table_entry_audit",
      `${audits.componentTableEntry.summary.fullCallerStructTableEntryRows} full caller-struct entries; ${audits.componentTableEntry.summary.directObjectAcProducerRows} direct +0xac producers.`,
    ),
  );
  rows.push(
    closedRow(
      "direct-caller-struct-builder",
      "caller-struct",
      "current_native_layout_b_direct_caller_struct_builder_audit",
      `${audits.directCallerStruct.summary.fullCallerStructWriterRecoveredRows || 0} recovered caller-struct writer rows; ${audits.directCallerStruct.summary.directObjectAcProducerRows} direct +0xac producers.`,
    ),
  );
  rows.push(
    closedRow(
      "resource-caller-dynamic-fields",
      "caller-struct",
      "current_native_layout_b_resource_caller_dynamic_fields_audit",
      `${audits.resourceDynamic.summary.dynamicCallerFieldRows} dynamic caller fields reach common apply; ${audits.resourceDynamic.summary.directObjectAcProducerRows} direct +0xac producers.`,
    ),
  );
  rows.push(
    closedRow(
      "common-apply-setter-fields",
      "common-apply",
      "current_native_layout_b_common_apply_setter_fields_audit",
      `${audits.commonSetter.summary.objectStoreRows} object field stores in setter family; ${audits.commonSetter.summary.objectAcStoreRows} object+0xac stores.`,
    ),
  );

  rows.push({
    id: "layout-b-object-ac-runtime-capture",
    gate: "runtime-capture",
    source: "current_native_layout_b_object_ac_runtime_capture_summary",
    evidenceState:
      audits.runtimeCapture.summary.runtimeParticleFlagObservedEvents > 0 ? "runtime-evidence-observed" : audits.runtimeCapture.summary.captureStatus,
    resolvedProducerRows: audits.runtimeCapture.summary.runtimeParticleFlagObservedEvents,
    needsRuntimeCapture: audits.runtimeCapture.summary.runtimeParticleFlagObservedEvents === 0,
    renderPromotionAllowed: false,
    evidence: `${audits.runtimeCapture.summary.captureStatus}; ${audits.runtimeCapture.summary.observedHookTargets}/${audits.runtimeCapture.summary.targetRows} hook targets observed, ${audits.runtimeCapture.summary.layoutBObjectsWithParticleFlag} live objects with 0x200.`,
  });

  return rows;
}

function buildCurrentNativeLayoutBObjectAcProducerGateAudit(
  { binaryPath = defaultBinary, captureInput = defaultCaptureInput } = {},
  generatedAt = new Date().toISOString(),
) {
  const runtimeTargets = buildCurrentNativeLayoutBObjectAcRuntimeCaptureTargets({ binaryPath });
  const audits = {
    callbackBoundary: buildCurrentNativeLayoutBCallbackBoundaryAudit({ binaryPath }),
    candidateDisqualification: buildCurrentNativeLayoutBObjectAcCandidateDisqualificationAudit({ binaryPath }),
    commonSetter: buildCurrentNativeLayoutBCommonApplySetterFieldsAudit({ binaryPath }),
    componentSlot: buildCurrentNativeLayoutBComponentSlotRegistrationAudit({ binaryPath }),
    componentTableEntry: buildCurrentNativeLayoutBComponentTableEntryAudit({ binaryPath }),
    directCallerStruct: buildCurrentNativeLayoutBDirectCallerStructBuilderAudit({ binaryPath }),
    entryOwner: buildCurrentNativeLayoutBEntryOwnerAudit({ binaryPath }),
    flagProducer: buildCurrentNativeLayoutBFlagProducerAudit({ binaryPath }),
    indirectSlot: buildCurrentNativeLayoutBIndirectSlotAudit({ binaryPath }),
    resourceDynamic: buildCurrentNativeLayoutBResourceCallerDynamicFieldsAudit({ binaryPath }),
    runtimeCapture: summarizeCapture({ targetManifest: runtimeTargets, inputPath: captureInput }),
    storeCoverage: buildCurrentNativeLayoutBObjectAcStoreCoverageAudit({ binaryPath }),
    ownerTrace: buildCurrentNativeObjectAcOwnerTraceAudit({ binaryPath }),
    widthOverlap: buildCurrentNativeObjectAcWidthOverlapAudit({ binaryPath }),
  };
  const items = buildGateRows(audits);
  const staticExactProducerRows =
    audits.flagProducer.summary.exactLayoutBParticleFlagProducerRows +
    audits.storeCoverage.summary.hiddenNonConstructorObjectAcProducerRows +
    audits.commonSetter.summary.objectAcParticleMaskProducerRows +
    audits.directCallerStruct.summary.directObjectAcProducerRows +
    audits.resourceDynamic.summary.directObjectAcProducerRows;
  const runtimeObservedProducerRows = audits.runtimeCapture.summary.runtimeParticleFlagObservedEvents;
  const unresolvedRuntimeRows = items.filter((row) => row.needsRuntimeCapture).length;
  const summary = {
    sourceRows: items.length,
    negativeClosedRows: items.filter((row) => row.evidenceState === "negative-closed").length,
    staticExactProducerRows,
    runtimeObservedProducerRows,
    unresolvedRuntimeRows,
    runtimeCaptureStatus: audits.runtimeCapture.summary.captureStatus,
    staticDirectStoreGateClosed:
      audits.flagProducer.summary.exactLayoutBParticleFlagProducerRows === 0 &&
      audits.candidateDisqualification.summary.disqualifiedCandidateRows ===
        audits.candidateDisqualification.summary.candidateRows &&
      audits.widthOverlap.summary.layoutBFamilyNonConstructorRows === 0 &&
      audits.storeCoverage.summary.hiddenNonConstructorObjectAcProducerRows === 0,
    directOwnerTraceGateClosed:
      audits.ownerTrace.summary.rowsWithLayoutBDirectCallers === 0 &&
      audits.callbackBoundary.summary.candidateTargetHitRows === 0,
    callerStructApplyGateClosed:
      audits.directCallerStruct.summary.directObjectAcProducerRows === 0 &&
      audits.resourceDynamic.summary.directObjectAcProducerRows === 0 &&
      audits.commonSetter.summary.objectAcStoreRows === 0 &&
      audits.resourceDynamic.summary.dynamicFieldsReachCommonApply === true,
    producerResolved: staticExactProducerRows > 0 || runtimeObservedProducerRows > 0,
    remainingProofRoute: staticExactProducerRows > 0 || runtimeObservedProducerRows > 0 ? "producer-observed" : "runtime-capture-required",
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    captureInput,
    policy:
      "diagnostic-only producer gate for layout B object+0xac particle mask; static negative evidence and missing runtime capture must not alter rendering",
    summary,
    interpretation: {
      staticBoundary:
        "Exact +0xac stores, width-overlap stores, layout B internal stores, callback exits, component routing, caller-struct dynamic fields, and common-apply setters are all bounded without finding a layout B 0x200 producer.",
      remainingBoundary:
        "The unresolved proof route is a live original-runtime capture at the prepared object+0xac/manager/backing/draw boundaries, or a newly recovered indirect owner path that ties one external write to the layout B object identity.",
      rendererPolicy:
        "Renderer promotion stays closed until the producer is observed and the concrete PFX/emitter/material primitive owner is also recovered.",
    },
    items,
  };
}

function exportCurrentNativeLayoutBObjectAcProducerGateAudit({
  binaryPath = defaultBinary,
  captureInput = defaultCaptureInput,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBObjectAcProducerGateAudit({ binaryPath, captureInput });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "id",
    "gate",
    "source",
    "evidenceState",
    "resolvedProducerRows",
    "needsRuntimeCapture",
    "renderPromotionAllowed",
    "evidence",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBObjectAcProducerGateAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    captureInput: optionValue(args, "--capture-input", defaultCaptureInput),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBObjectAcProducerGateAudit,
  exportCurrentNativeLayoutBObjectAcProducerGateAudit,
};
