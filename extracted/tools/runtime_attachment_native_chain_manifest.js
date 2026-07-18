#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultUpdateChainPath = "extracted/reports/native_attachment_update_chain.tsv";
const defaultExtraTransformPath = "extracted/reports/native_attachment_extra_transform_chain.tsv";
const defaultAnimationApplyPath = "extracted/reports/native_attachment_animation_apply_chain.tsv";
const defaultAnimationRuntimePath = "extracted/reports/native_attachment_animation_runtime_chain.tsv";
const defaultHelperSemanticsPath = "extracted/reports/native_attachment_helper_semantics_chain.tsv";
const defaultHelperCallPath = "extracted/reports/native_attachment_helper_call_chain.tsv";
const defaultRuntimeDataComponentPath = "extracted/reports/native_attachment_runtime_data_component_chain.tsv";
const defaultAttachableRuntimePath = "extracted/reports/native_attachable_runtime_chain.tsv";
const defaultTsvOut = "extracted/reports/runtime_attachment_native_chain_manifest.tsv";
const defaultJsonOut = "extracted/reports/runtime_attachment_native_chain_manifest_summary.json";
const defaultViewerOut = "extracted/viewer/runtime-attachment-native-chain-manifest.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readTsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
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

function pipeValues(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueJoin(values) {
  return unique(values).join("|");
}

function sourceCharacterFromPath(value) {
  return String(value || "").match(/^Characters\/([^/]+)\//)?.[1] || "";
}

function sourceHeroNameFromPath(value) {
  const text = String(value || "");
  if (!/[/.]/.test(text)) return "";
  return path.basename(text, ".def");
}

function pathTokens(value) {
  return String(value || "")
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function resourceKeysForRow(...values) {
  const generic = new Set([
    "Characters",
    "Effects",
    "Art",
    "Ability",
    "Bone",
    "Buff",
    "Effect",
    "Sound",
    "DefaultSkin",
    "Skin",
    "def",
    "bnd",
  ]);
  const keys = [];
  for (const value of values) {
    for (const item of pipeValues(value)) {
      keys.push(item);
      keys.push(sourceCharacterFromPath(item));
      keys.push(sourceHeroNameFromPath(item));
      for (const token of pathTokens(item)) {
        if (!generic.has(token)) keys.push(token);
      }
    }
  }
  return unique(keys);
}

function bindTokenKeys(bindToken) {
  const token = String(bindToken || "").trim();
  if (!token) return [];
  const withoutSuffix = token.replace(/_bnd$/i, "");
  return unique([token, withoutSuffix, ...pathTokens(token)]);
}

function rowId(row) {
  return [
    row.sourceKind,
    row.chain,
    row.stage,
    row.platform,
    row.functionName,
    row.callbackFunction,
    row.helperFunction,
    row.bindToken,
    row.line,
    row.contextHash,
  ].join(":");
}

function baseRow({
  sourceKind,
  chain,
  stage,
  platform,
  resourceKeys = [],
  bindToken = "",
  token = "",
  functionName = "",
  callbackFunction = "",
  helperFunction = "",
  sourceFile = "",
  line = "",
  evidenceTags = "",
  complete = "",
  interpretation = "",
  contextHash = "",
}) {
  return {
    sourceKind,
    chain,
    stage,
    platform,
    resourceKeys: uniqueJoin(resourceKeys),
    bindToken,
    token,
    functionName,
    callbackFunction,
    helperFunction,
    sourceFile,
    line,
    evidenceTags,
    complete,
    interpretation,
    contextHash,
  };
}

function updateChainRows(rows) {
  return rows.map((row) =>
    baseRow({
      sourceKind: "attachment-frame-update",
      chain: row.chain || "attachment-frame-update",
      stage: row.stage || "",
      platform: row.platform || "",
      functionName: row.functionName || "",
      sourceFile: row.sourceFile || "",
      line: row.line || "",
      evidenceTags: row.evidenceTags || "",
      complete: row.complete || "",
      interpretation: "Native per-frame attachment transform update path.",
      contextHash: row.contextHash || "",
    }),
  );
}

function extraTransformRows(rows) {
  return rows.map((row) =>
    baseRow({
      sourceKind: "attachment-extra-transform",
      chain: "attachment-extra-transform",
      stage: row.stage || "",
      platform: row.platform || "",
      resourceKeys: [...bindTokenKeys(row.bindToken), ...resourceKeysForRow(row.bindToken, row.relatedFunctions)],
      bindToken: row.bindToken || "",
      token: uniqueJoin(bindTokenKeys(row.bindToken)),
      functionName: row.functionName || "",
      helperFunction: row.setterFunction || "",
      sourceFile: row.sourceFile || "",
      line: row.line || "",
      evidenceTags: row.evidenceTags || "",
      complete: row.complete || "",
      interpretation:
        row.kind === "multi-bind-extra-transform-object"
          ? "Native extra transform object registers a binding token used by attachment animation runtime."
          : "Native extra transform component registers or updates procedural attachment transforms.",
      contextHash: row.contextHash || "",
    }),
  );
}

function animationApplyRows(rows) {
  return rows.map((row) =>
    baseRow({
      sourceKind: "attachment-animation-apply",
      chain: row.chain || "attachment-animation-apply",
      stage: row.stage || "",
      platform: row.platform || "",
      functionName: row.functionName || "",
      sourceFile: row.sourceFile || "",
      line: row.line || "",
      evidenceTags: row.evidenceTags || "",
      complete: row.complete || "",
      interpretation: "Native path that applies mesh and animation resources to attachment components.",
      contextHash: row.contextHash || "",
    }),
  );
}

function animationRuntimeRows(rows) {
  return rows.map((row) =>
    baseRow({
      sourceKind: "attachment-animation-runtime",
      chain: row.chain || "attachment-animation-runtime",
      stage: row.stage || "",
      platform: row.platform || "",
      functionName: row.functionName || "",
      sourceFile: row.sourceFile || "",
      line: row.line || "",
      evidenceTags: row.evidenceTags || "",
      complete: row.complete || "",
      interpretation: "Native attachment animation component runtime path.",
      contextHash: row.contextHash || "",
    }),
  );
}

function helperSemanticsRows(rows) {
  return rows.map((row) =>
    baseRow({
      sourceKind: "attachment-helper-semantics",
      chain: "attachment-helper-semantics",
      stage: row.stage || "",
      platform: row.platform || "",
      resourceKeys: resourceKeysForRow(row.parentTokens, row.argKey),
      token: row.argKey || "",
      functionName: row.realFunction || row.helperFunction || "",
      helperFunction: row.helperFunction || "",
      sourceFile: row.sourceFiles || "",
      line: row.lineRange || "",
      evidenceTags: row.evidenceTags || "",
      complete: row.complete || "",
      interpretation: row.interpretation || "Native indexed runtime helper semantics.",
      contextHash: row.contextHash || "",
    }),
  );
}

function helperCallRows(rows) {
  return rows.map((row) =>
    baseRow({
      sourceKind: "attachment-helper-call",
      chain: "attachment-helper-call",
      stage: row.helperFamily || "helper-call",
      platform: row.platform || "",
      resourceKeys: resourceKeysForRow(
        row.parentTokens,
        row.visualParentTokens,
        row.combinedParentTokens,
        row.callbackTokens,
        row.nearbyTokens,
      ),
      token: uniqueJoin(resourceKeysForRow(row.parentTokens, row.combinedParentTokens, row.callbackTokens)),
      callbackFunction: row.callbackFunction || "",
      helperFunction: row.helperFunction || "",
      sourceFile: row.callbackSourceFile || "",
      line: row.line || "",
      evidenceTags: [row.parentRoles, row.parentBridgeStatuses, row.argKey].filter(Boolean).join("|"),
      complete: row.helperFunction ? "yes" : "",
      interpretation: "Native callback call site reads indexed runtime ability data for an attachment or effect hook.",
    }),
  );
}

function runtimeDataComponentRows(rows) {
  return rows.map((row) =>
    baseRow({
      sourceKind: "attachment-runtime-data-component",
      chain: "attachment-runtime-data-component",
      stage: row.stage || "",
      platform: row.platform || "",
      resourceKeys: resourceKeysForRow(row.componentToken, row.ownerToken, row.abilityFactoryToken),
      token: uniqueJoin(resourceKeysForRow(row.componentToken, row.ownerToken, row.abilityFactoryToken)),
      functionName: row.functions || "",
      sourceFile: row.sourceFiles || "",
      line: row.lineRange || "",
      evidenceTags: row.evidenceTags || "",
      complete: row.complete || "",
      interpretation: row.interpretation || "Native runtime ability-data component chain.",
      contextHash: row.contextHash || "",
    }),
  );
}

function attachableRuntimeRows(rows) {
  return rows.map((row) =>
    baseRow({
      sourceKind: "attachable-runtime",
      chain: row.chain || "attachable-runtime",
      stage: row.stage || "",
      platform: row.platform || "",
      functionName: row.functionName || "",
      sourceFile: row.sourceFile || "",
      line: row.line || "",
      evidenceTags: row.evidenceTags || "",
      complete: row.complete || "",
      interpretation: "Native attachable equip, refresh, or stored-resource runtime path.",
      contextHash: row.contextHash || "",
    }),
  );
}

function buildRuntimeAttachmentNativeChainRows({
  updateRows = [],
  extraTransformRows: extraRows = [],
  animationApplyRows: applyRows = [],
  animationRuntimeRows: runtimeRows = [],
  helperSemanticsRows: semanticsRows = [],
  helperCallRows: callRows = [],
  runtimeDataComponentRows: dataComponentRows = [],
  attachableRuntimeRows: attachableRows = [],
}) {
  const rows = [
    ...updateChainRows(updateRows),
    ...extraTransformRows(extraRows),
    ...animationApplyRows(applyRows),
    ...animationRuntimeRows(runtimeRows),
    ...helperSemanticsRows(semanticsRows),
    ...helperCallRows(callRows),
    ...runtimeDataComponentRows(dataComponentRows),
    ...attachableRuntimeRows(attachableRows),
  ];
  const seen = new Set();
  return rows
    .filter((row) => {
      const id = rowId(row);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((left, right) => {
      if (left.sourceKind !== right.sourceKind) return left.sourceKind.localeCompare(right.sourceKind);
      if (left.stage !== right.stage) return left.stage.localeCompare(right.stage);
      return `${left.resourceKeys}:${left.bindToken}:${left.functionName}`.localeCompare(
        `${right.resourceKeys}:${right.bindToken}:${right.functionName}`,
      );
    });
}

function increment(map, key) {
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}

function summarizeRuntimeAttachmentNativeChainRows(rows) {
  const bySourceKind = {};
  const byStage = {};
  const byBindToken = {};
  const byPlatform = {};
  for (const row of rows || []) {
    increment(bySourceKind, row.sourceKind);
    increment(byStage, row.stage);
    increment(byPlatform, row.platform);
    increment(byBindToken, row.bindToken);
  }
  return {
    rows: rows.length,
    completeRows: rows.filter((row) => row.complete === "yes").length,
    resourceLinkedRows: rows.filter((row) => row.resourceKeys).length,
    bindTokenRows: rows.filter((row) => row.bindToken).length,
    bySourceKind: Object.fromEntries(Object.entries(bySourceKind).sort(([left], [right]) => left.localeCompare(right))),
    byStage: Object.fromEntries(Object.entries(byStage).sort(([left], [right]) => left.localeCompare(right))),
    byBindToken: Object.fromEntries(Object.entries(byBindToken).sort(([left], [right]) => left.localeCompare(right))),
    byPlatform: Object.fromEntries(Object.entries(byPlatform).sort(([left], [right]) => left.localeCompare(right))),
  };
}

const columns = [
  "sourceKind",
  "chain",
  "stage",
  "platform",
  "resourceKeys",
  "bindToken",
  "token",
  "functionName",
  "callbackFunction",
  "helperFunction",
  "sourceFile",
  "line",
  "evidenceTags",
  "complete",
  "interpretation",
  "contextHash",
];

function exportRuntimeAttachmentNativeChainManifest({
  updateChainPath = defaultUpdateChainPath,
  extraTransformPath = defaultExtraTransformPath,
  animationApplyPath = defaultAnimationApplyPath,
  animationRuntimePath = defaultAnimationRuntimePath,
  helperSemanticsPath = defaultHelperSemanticsPath,
  helperCallPath = defaultHelperCallPath,
  runtimeDataComponentPath = defaultRuntimeDataComponentPath,
  attachableRuntimePath = defaultAttachableRuntimePath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
  viewerOut = defaultViewerOut,
} = {}) {
  const rows = buildRuntimeAttachmentNativeChainRows({
    updateRows: readTsv(updateChainPath),
    extraTransformRows: readTsv(extraTransformPath),
    animationApplyRows: readTsv(animationApplyPath),
    animationRuntimeRows: readTsv(animationRuntimePath),
    helperSemanticsRows: readTsv(helperSemanticsPath),
    helperCallRows: readTsv(helperCallPath),
    runtimeDataComponentRows: readTsv(runtimeDataComponentPath),
    attachableRuntimeRows: readTsv(attachableRuntimePath),
  });
  const summary = summarizeRuntimeAttachmentNativeChainRows(rows);
  writeTsv(tsvOut, rows, columns);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2)}\n`);
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportRuntimeAttachmentNativeChainManifest({
    updateChainPath: optionValue(args, "--update-chain", defaultUpdateChainPath),
    extraTransformPath: optionValue(args, "--extra-transform", defaultExtraTransformPath),
    animationApplyPath: optionValue(args, "--animation-apply", defaultAnimationApplyPath),
    animationRuntimePath: optionValue(args, "--animation-runtime", defaultAnimationRuntimePath),
    helperSemanticsPath: optionValue(args, "--helper-semantics", defaultHelperSemanticsPath),
    helperCallPath: optionValue(args, "--helper-call", defaultHelperCallPath),
    runtimeDataComponentPath: optionValue(args, "--runtime-data-component", defaultRuntimeDataComponentPath),
    attachableRuntimePath: optionValue(args, "--attachable-runtime", defaultAttachableRuntimePath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildRuntimeAttachmentNativeChainRows,
  exportRuntimeAttachmentNativeChainManifest,
  summarizeRuntimeAttachmentNativeChainRows,
};
