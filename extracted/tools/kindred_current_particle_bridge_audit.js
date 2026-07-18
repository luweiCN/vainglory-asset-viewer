#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultAndroidTypeSourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/009d1.c";
const defaultAndroidUpdateSourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/009d2.c";
const defaultAndroidComponentSourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/009d3.c";
const defaultIosComponentSourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/10004.c";
const defaultComponentChainPath = "extracted/reports/kindred_effect_component_runtime_chain_audit.json";
const defaultParticleRegistrationPath = "extracted/reports/current_native_particle_registration_chain_audit.json";
const defaultParticleDrawPath = "extracted/reports/current_native_particle_draw_chain_audit.json";
const defaultPositionSamplerPath = "extracted/reports/current_native_position_sampler_owner_audit.json";
const defaultJsonOut = "extracted/reports/kindred_current_particle_bridge_audit.json";
const defaultViewerOut = "extracted/viewer/kindred-current-particle-bridge-audit.json";
const defaultTsvOut = "extracted/reports/kindred_current_particle_bridge_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function readJson(filePath, fallback = {}) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function sourceBundleFromPaths(paths = {}) {
  return {
    androidType: {
      sourcePath: paths.androidTypeSourcePath || defaultAndroidTypeSourcePath,
      text: readText(paths.androidTypeSourcePath || defaultAndroidTypeSourcePath),
    },
    androidUpdate: {
      sourcePath: paths.androidUpdateSourcePath || defaultAndroidUpdateSourcePath,
      text: readText(paths.androidUpdateSourcePath || defaultAndroidUpdateSourcePath),
    },
    androidComponent: {
      sourcePath: paths.androidComponentSourcePath || defaultAndroidComponentSourcePath,
      text: readText(paths.androidComponentSourcePath || defaultAndroidComponentSourcePath),
    },
    iosComponent: {
      sourcePath: paths.iosComponentSourcePath || defaultIosComponentSourcePath,
      text: readText(paths.iosComponentSourcePath || defaultIosComponentSourcePath),
    },
  };
}

function hasTokens(text, tokens = []) {
  return tokens.every((token) => String(text || "").includes(token));
}

function evidenceState(found, blocker = false) {
  if (blocker) return "blocked";
  return found ? "evidence-found" : "evidence-missing";
}

function increment(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
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

function sourceReference(source, token) {
  const lines = String(source?.text || "").split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(token));
  return {
    sourceFile: source?.sourcePath || "",
    sourceLine: index >= 0 ? index + 1 : "",
  };
}

function buildKindredCurrentParticleBridgeAudit(
  {
    sources = sourceBundleFromPaths(),
    componentChainManifest = readJson(defaultComponentChainPath),
    particleRegistrationManifest = readJson(defaultParticleRegistrationPath),
    particleDrawManifest = readJson(defaultParticleDrawPath),
    positionSamplerManifest = readJson(defaultPositionSamplerPath),
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const registrationSummary = particleRegistrationManifest.summary || {};
  const drawSummary = particleDrawManifest.summary || {};
  const positionSummary = positionSamplerManifest.summary || {};
  const layoutB = positionSamplerManifest.sceneEntityRecordEntryEvidence?.layoutB || {};
  const entryCallbacks = positionSamplerManifest.sceneEntityRecordEntryEvidence?.entryCallbacks || {};
  const renderOwnerBuilderLink = positionSamplerManifest.sceneEntityRecordEntryEvidence?.renderOwnerBuilderLink || {};
  const registrationChain = particleRegistrationManifest.registrationChain || {};
  const componentSummary = componentChainManifest.summary || {};

  const rows = [];
  const addRow = (row) => {
    rows.push({
      renderPromotionAllowed: false,
      ...row,
    });
  };

  const androidTypeFound = hasTokens(sources.androidType.text, [
    "0xa8) = 0x118",
    "FUN_009d200c",
    "FUN_009d2040",
  ]);
  const iosTypeFound = hasTokens(sources.iosComponent.text, [
    "0xa8) = 0x118",
    "FUN_10004470c",
    "FUN_100044740",
  ]);
  const currentLayoutBTypeFound = Boolean(registrationSummary.layoutBTypeRecordRecovered);
  addRow({
    id: "cross-build-component-type-0x118",
    bridgeStage: "component-shape",
    evidenceState: evidenceState(androidTypeFound && iosTypeFound && currentLayoutBTypeFound),
    originalSourceFiles: `${sources.androidType.sourcePath}|${sources.iosComponent.sourcePath}`,
    currentReport: defaultParticleRegistrationPath,
    recoveredFields: "type-record-size=0x118",
    originalEvidenceSummary:
      "Android and iOS original component registration records store a 0x118 component size; current Android layout B type record also stores 0x118.",
    nextRequiredEvidence: "none-for-field-shape; still need exact current constructor/create owner link",
    ...sourceReference(sources.androidType, "0xa8) = 0x118"),
  });

  const parameterIndexFound = componentSummary.parameterIndexRows >= 2 && componentSummary.closedEvidenceRows >= 25;
  const currentParamUpdateFound = Boolean(positionSummary.sceneEntityRecordEntryLayoutBMaterialParamUpdateRecovered);
  addRow({
    id: "component-parameter-packing-alignment",
    bridgeStage: "parameter-update",
    evidenceState: evidenceState(parameterIndexFound && currentParamUpdateFound),
    originalSourceFiles: `${sources.androidComponent.sourcePath}|${sources.androidUpdate.sourcePath}|${sources.iosComponent.sourcePath}`,
    currentReport: defaultPositionSamplerPath,
    recoveredFields: "+0x50|+0x10c|+0x110|+0xf8..+0x108",
    originalEvidenceSummary:
      "Original component packs Ally_Enemy/Color/Radius/Alpha/SizeXY/Duration indices at +0x10c/+0x110 and writes values into PFX object +0x50; current layout B has the same bitfield/value/target shape through 0x8d3a80 and 0xe39830.",
    nextRequiredEvidence: "map each current parameter writer to the exact PFX parameter index and surface input",
    ...sourceReference(sources.androidComponent, "Ally_Enemy"),
  });

  const originalManagerRegistrationFound =
    hasTokens(sources.androidUpdate.text, ["FUN_0198936c", "param_1 + 0x30", "param_1 + 0xb0"]) &&
    hasTokens(sources.iosComponent.text, ["FUN_1010a1dcc", "param_1 + 0x30", "param_1 + 0xb0"]);
  const currentManagerRegistrationFound =
    Boolean(positionSummary.sceneEntityRecordEntryLayoutBRecovered) &&
    Boolean(registrationSummary.layoutBRegistrationRecovered) &&
    Boolean(registrationSummary.managerEntryStoreRecovered);
  addRow({
    id: "component-manager-record-registration-alignment",
    bridgeStage: "manager-registration",
    evidenceState: evidenceState(originalManagerRegistrationFound && currentManagerRegistrationFound),
    originalSourceFiles: `${sources.androidUpdate.sourcePath}|${sources.iosComponent.sourcePath}`,
    currentReport: `${defaultParticleRegistrationPath}|${defaultPositionSamplerPath}`,
    recoveredFields: "+0x30|+0xb0|manager-record+0x8",
    originalEvidenceSummary:
      "Original component registers component +0x30 and stores the returned record index at +0xb0. Current layout B registers object +0x30 through 0x188eee0, stores the returned record index at +0xb0, and manager record +0x8 stores that entry pointer.",
    nextRequiredEvidence: "prove the current layout B create path is the same KindredEffects component create owner, not only the same field shape",
    ...sourceReference(sources.androidUpdate, "FUN_0198936c"),
  });

  const originalStateDispatchFound =
    hasTokens(sources.androidUpdate.text, ["param_1 + 0x58", "param_1 + 0xb8", "FUN_019894ac"]) &&
    hasTokens(sources.iosComponent.text, ["param_1 + 0x58", "param_1 + 0xb8", "FUN_1010a1ef8"]);
  const currentStateDispatchFound = Boolean(positionSummary.sceneEntityRecordEntryLayoutBStateDispatchRecovered);
  addRow({
    id: "component-state-dispatch-alignment",
    bridgeStage: "state-dispatch",
    evidenceState: evidenceState(originalStateDispatchFound && currentStateDispatchFound),
    originalSourceFiles: `${sources.androidUpdate.sourcePath}|${sources.iosComponent.sourcePath}`,
    currentReport: defaultPositionSamplerPath,
    recoveredFields: "+0x58|+0x60|+0xb8|+0xb0",
    originalEvidenceSummary:
      "Original component validates state object +0x58, switches on +0xb8, applies transforms, then submits or refreshes the stored record. Current layout B state dispatch has the same linked-state and record-dispatch shape.",
    nextRequiredEvidence: "recover the concrete state object producer for skill/action timing and visibility",
    ...sourceReference(sources.androidUpdate, "param_1 + 0x58"),
  });

  const helperDispatchFound = String(entryCallbacks.helperDispatch?.argumentPattern || "").includes("object +0x40");
  addRow({
    id: "current-entry-object40-helper-dispatch",
    bridgeStage: "entry-helper-dispatch",
    evidenceState: evidenceState(helperDispatchFound),
    originalSourceFiles: "",
    currentReport: defaultPositionSamplerPath,
    recoveredFields: "entry object+0x40|entry object+0x58|global-helper-dispatch",
    originalEvidenceSummary:
      "Current entry callback prepares object +0x58 and object +0x40 before tail-branching into the global helper/resource-render dispatch chain. This is current entry evidence, not proof that it is the same subrecord as PFX object +0x40.",
    nextRequiredEvidence: "prove whether original PFX object +0x40 and current entry object +0x40 are the same runtime payload family",
  });

  const renderOwnerLinkFound = Boolean(positionSummary.sceneEntityRecordEntryRenderOwnerBuilderLinked);
  addRow({
    id: "current-entry-render-owner-builder-link",
    bridgeStage: "render-owner-builder",
    evidenceState: evidenceState(renderOwnerLinkFound),
    originalSourceFiles: "",
    currentReport: defaultPositionSamplerPath,
    recoveredFields: "entry+0x8|owner-vtable+0x10|0x1892120|0x189366c",
    originalEvidenceSummary:
      renderOwnerBuilderLink.conclusion ||
      "Current entry objects are linked through owner A/B vtable +0x10 to render command builders.",
    nextRequiredEvidence: "recover the active source/program/material values selected for PFX entries, not only the generic owner builder path",
  });

  const particleDrawRecovered =
    Boolean(drawSummary.particleDrawBatchRecovered) &&
    Boolean(drawSummary.sharedManagerEntryMaterializationRecovered) &&
    Boolean(registrationSummary.backingFlagStorageRecovered) &&
    Boolean(registrationSummary.particleFlagFilterRecovered);
  addRow({
    id: "current-particle-draw-filter-recovered",
    bridgeStage: "particle-draw-batch",
    evidenceState: evidenceState(particleDrawRecovered),
    originalSourceFiles: "",
    currentReport: `${defaultParticleDrawPath}|${defaultParticleRegistrationPath}`,
    recoveredFields: "filter-mask=0x200|backing-record+0x18|manager-record+0x8",
    originalEvidenceSummary:
      "Current particle draw builds an entry array from the same manager record pool, filters backing record flags against 0x200, then materializes entry pointers from manager record +0x8.",
    nextRequiredEvidence: "recover which 0x118 layout B object writes +0xac with a value containing 0x200",
  });

  const exactFlagProducerRows = Number(registrationSummary.exactLayoutBParticleFlagProducerRows || 0);
  addRow({
    id: "current-layout-b-particle-flag-producer",
    bridgeStage: "promotion-blocker",
    evidenceState: evidenceState(exactFlagProducerRows > 0, exactFlagProducerRows === 0),
    originalSourceFiles: "",
    currentReport: defaultParticleRegistrationPath,
    recoveredFields: "object+0xac|particle-mask=0x200",
    originalEvidenceSummary:
      exactFlagProducerRows > 0
        ? "Current registration audit found an exact producer for layout B object +0xac particle draw flags."
        : "Current registration audit has no exact producer that writes the 0x118 layout B object's +0xac with the 0x200 particle draw flag; nearby 0x210/dynamic flag paths remain rejected or candidate-only.",
    nextRequiredEvidence: "trace the exact current package producer of object +0xac bit 0x200 for this 0x118 component family",
  });

  const unresolved = [
    ...(particleRegistrationManifest.unresolved || []),
    ...(particleDrawManifest.unresolved || []),
    ...(positionSamplerManifest.sceneEntityRecordEntryEvidence?.unresolved || []),
  ].join(" | ");
  const pfxOwnerResolved = !/PFX\/emitter|PFX\/emitter instance|particle manager records/i.test(unresolved);
  addRow({
    id: "pfx-emitter-manager-entry-owner",
    bridgeStage: "promotion-blocker",
    evidenceState: evidenceState(pfxOwnerResolved, !pfxOwnerResolved),
    originalSourceFiles: "",
    currentReport: `${defaultParticleRegistrationPath}|${defaultParticleDrawPath}`,
    recoveredFields: "PFX/emitter owner -> object+0x30 -> manager record+0x8",
    originalEvidenceSummary: pfxOwnerResolved
      ? "Current reports no longer list PFX/emitter manager-entry ownership as unresolved."
      : "Current reports still list the concrete PFX/emitter instance owner of the object+0x30 manager entry as unresolved.",
    nextRequiredEvidence:
      "trace create/activate callsites from KindredEffects PFX object or runtime emitter object into the manager registration object",
  });

  const byStage = {};
  const byEvidenceState = {};
  for (const row of rows) {
    increment(byStage, row.bridgeStage);
    increment(byEvidenceState, row.evidenceState);
  }
  const closedEvidenceRows = rows.filter((row) => row.evidenceState === "evidence-found").length;
  const blockedRows = rows.filter((row) => row.evidenceState === "blocked").length;
  const summary = {
    rows: rows.length,
    closedEvidenceRows,
    blockedRows,
    missingEvidenceRows: rows.filter((row) => row.evidenceState === "evidence-missing").length,
    crossBuildComponentShapeRecovered: androidTypeFound && iosTypeFound,
    currentLayoutBComponentShapeRecovered:
      currentLayoutBTypeFound &&
      currentParamUpdateFound &&
      currentManagerRegistrationFound &&
      currentStateDispatchFound,
    currentEntryRenderOwnerBuilderLinked: renderOwnerLinkFound,
    currentParticleDrawBatchRecovered: particleDrawRecovered,
    exactLayoutBParticleFlagProducerRows: exactFlagProducerRows,
    pfxEmitterManagerEntryOwnerRecovered: pfxOwnerResolved,
    renderPromotionAllowed: false,
    byStage,
    byEvidenceState,
  };
  return {
    generatedAt,
    policy:
      "diagnostic-only bridge between original Kindred component fields and current Android particle/scene-entry evidence; do not render PFX from this until exact current create owner, particle flag producer, emitter entry owner, and final draw material policy are recovered",
    inputs: {
      componentChain: defaultComponentChainPath,
      particleRegistration: defaultParticleRegistrationPath,
      particleDraw: defaultParticleDrawPath,
      positionSampler: defaultPositionSamplerPath,
    },
    summary,
    currentLayoutB: {
      registerFunctionHex: layoutB.registerFunctionHex || "",
      managerRegistration: layoutB.managerRegistration || null,
      materialParamUpdate: layoutB.materialParamUpdate || null,
      stateDispatch: layoutB.stateDispatch || null,
      helperDispatch: entryCallbacks.helperDispatch || null,
      renderOwnerBuilderLink: renderOwnerBuilderLink || null,
      registrationChain,
    },
    unresolved: rows.filter((row) => row.evidenceState !== "evidence-found").map((row) => ({
      id: row.id,
      nextRequiredEvidence: row.nextRequiredEvidence,
    })),
    items: rows,
  };
}

function exportKindredCurrentParticleBridgeAudit({
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
  paths = {},
} = {}) {
  const manifest = buildKindredCurrentParticleBridgeAudit({
    sources: sourceBundleFromPaths(paths),
    componentChainManifest: readJson(paths.componentChainPath || defaultComponentChainPath),
    particleRegistrationManifest: readJson(paths.particleRegistrationPath || defaultParticleRegistrationPath),
    particleDrawManifest: readJson(paths.particleDrawPath || defaultParticleDrawPath),
    positionSamplerManifest: readJson(paths.positionSamplerPath || defaultPositionSamplerPath),
  });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "id",
    "bridgeStage",
    "evidenceState",
    "sourceFile",
    "sourceLine",
    "currentReport",
    "recoveredFields",
    "originalEvidenceSummary",
    "nextRequiredEvidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportKindredCurrentParticleBridgeAudit({
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    paths: {
      androidTypeSourcePath: optionValue(args, "--android-type-source", defaultAndroidTypeSourcePath),
      androidUpdateSourcePath: optionValue(args, "--android-update-source", defaultAndroidUpdateSourcePath),
      androidComponentSourcePath: optionValue(args, "--android-component-source", defaultAndroidComponentSourcePath),
      iosComponentSourcePath: optionValue(args, "--ios-component-source", defaultIosComponentSourcePath),
      componentChainPath: optionValue(args, "--component-chain", defaultComponentChainPath),
      particleRegistrationPath: optionValue(args, "--particle-registration", defaultParticleRegistrationPath),
      particleDrawPath: optionValue(args, "--particle-draw", defaultParticleDrawPath),
      positionSamplerPath: optionValue(args, "--position-sampler", defaultPositionSamplerPath),
    },
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildKindredCurrentParticleBridgeAudit,
  exportKindredCurrentParticleBridgeAudit,
};
