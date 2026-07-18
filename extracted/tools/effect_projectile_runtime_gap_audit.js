#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultEffectTsv = "extracted/reports/native_effect_spawn_manifest.tsv";
const defaultCoverageTsv = "extracted/reports/effect_projectile_binding_coverage.tsv";
const defaultPfxManifest = "extracted/viewer/effect-pfx-resource-manifest.json";
const defaultViewerOut = "extracted/viewer/effect-projectile-runtime-gap-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_runtime_gap_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_runtime_gap_audit.tsv";

const placedBindingStatuses = new Set([
  "definition-bone",
  "native-definition-logical-locator",
  "native-emitter-semantic-slot",
  "native-emitter-slot",
  "native-nearby-bone",
  "native-runtime-locator-transform",
]);

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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

function readJsonItems(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed : parsed.items || [];
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

function pipeValues(value) {
  if (Array.isArray(value)) return uniqueInOrder(value);
  return uniqueInOrder(String(value || "").split("|").filter(Boolean));
}

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizedPathHeroTerms(value) {
  return [...String(value || "").matchAll(/(?:Characters|Effects)\/([^/\t]+)\//g)].map((match) => normalized(match[1]));
}

function effectTokenHeroTerm(value) {
  return normalized(
    String(value || "")
      .replace(/^Effect_/i, "")
      .split("_")
      .find(Boolean) || "",
  );
}

function significantEffectTerms(value) {
  return uniqueInOrder(
    String(value || "")
      .replace(/^Effect_/i, "")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .split(/[^A-Za-z0-9]+|_/)
      .map((part) => part.trim().toLowerCase())
      .filter(
        (part) =>
          part.length >= 3 &&
          !["effect", "projectile", "proj", "shot", "attack", "impact", "core"].includes(part),
      ),
  );
}

function pfxCandidateRowsForDefinition(definition, pfxRows) {
  const terms = significantEffectTerms(definition.effectToken);
  if (terms.length < 2) return [];
  return (pfxRows || [])
    .map((row) => {
      const relativePath = row?.relativePath || row?.path || "";
      const text = normalized(relativePath);
      const score = terms.filter((term) => text.includes(term)).length;
      return { relativePath, score };
    })
    .filter((row) => row.relativePath && row.score >= Math.min(terms.length, 3))
    .sort((left, right) => right.score - left.score || left.relativePath.localeCompare(right.relativePath))
    .slice(0, 5);
}

function coverageHeroAliases(row) {
  const modelHero = String(row?.modelLabel || "").split("_")[0] || "";
  return uniqueInOrder([
    normalized(row?.heroLabel),
    normalized(modelHero),
    ...normalizedPathHeroTerms(row?.runtimeSourceRelativePath),
    ...normalizedPathHeroTerms(row?.resourcePath),
    ...pipeValues(row?.nativeEffectHookTokens).map(effectTokenHeroTerm),
    ...pipeValues(row?.effectTokens).map(effectTokenHeroTerm),
  ]).filter(Boolean);
}

function heroAliasMatches(definitionHero, coverageAlias) {
  const definition = normalized(definitionHero);
  const alias = normalized(coverageAlias);
  if (!definition || !alias) return false;
  if (definition === alias) return true;
  if (/^[a-z][a-z0-9]{2,}$/.test(alias) && !/^hero\d+$/i.test(alias) && definition.startsWith(alias)) return true;
  return false;
}

function coverageHeroMatches(definitionHeroNames, coverage) {
  const heroNames = pipeValues(definitionHeroNames);
  if (!heroNames.length) return true;
  const aliases = coverageHeroAliases(coverage);
  return heroNames.some((heroName) => aliases.some((alias) => heroAliasMatches(heroName, alias)));
}

function tokenSet(row) {
  return new Set(
    uniqueInOrder([
      ...pipeValues(row.nativeEffectHookTokens),
      ...pipeValues(row.effectTokens),
      ...pipeValues(row.nativeEffectHookToken),
      ...pipeValues(row.effectToken),
    ]),
  );
}

function actionMatches(definition, coverage) {
  const definitionKeys = new Set(pipeValues(definition.actionKeys));
  const coverageKeys = new Set([...pipeValues(coverage.actionKeys), ...pipeValues(coverage.nativeEffectHookActionKeys)]);
  if (!definitionKeys.size || !coverageKeys.size) return true;
  for (const key of definitionKeys) {
    if (coverageKeys.has(key)) return true;
    if (key.startsWith("attack") && coverageKeys.has("attack")) return true;
    if (key.startsWith("ability01") && coverageKeys.has("ability01")) return true;
    if (key.startsWith("ability02") && coverageKeys.has("ability02")) return true;
    if (key.startsWith("ability03") && coverageKeys.has("ability03")) return true;
  }
  return false;
}

function isProjectileDefinition(row) {
  return (
    row?.sourceKind === "native-effect-selector" &&
    row?.selectorOutputRole === "projectile" &&
    /^Effect_/.test(row?.effectToken || "")
  );
}

function coverageMatchTiers(definition, coverageRows) {
  const effectToken = definition.effectToken || "";
  const tokenRows = (coverageRows || []).filter((coverage) => tokenSet(coverage).has(effectToken));
  const heroRows = tokenRows.filter((coverage) => coverageHeroMatches(definition.heroNames, coverage));
  const actionRows = heroRows.filter((coverage) => actionMatches(definition, coverage));
  return { tokenRows, heroRows, actionRows };
}

function firstValue(rows, field) {
  return rows.find((row) => row?.[field])?.[field] || "";
}

function rowStatus(matchTiers) {
  const matchedRows = matchTiers.actionRows || [];
  if (matchedRows.some((row) => placedBindingStatuses.has(row.bindingStatus))) return "projectile-definition-placed";
  if (matchedRows.length) return "projectile-definition-effect-only";
  if (matchTiers.heroRows?.length) return "projectile-definition-action-mismatch";
  if (matchTiers.tokenRows?.length) return "projectile-definition-hero-mismatch";
  return "projectile-definition-no-token-resource";
}

function bestMatchedRowsForStatus(status, matchTiers) {
  if (status === "projectile-definition-action-mismatch") return matchTiers.heroRows || [];
  if (status === "projectile-definition-hero-mismatch") return matchTiers.tokenRows || [];
  return matchTiers.actionRows || [];
}

function blockerForStatus(status) {
  if (status === "projectile-definition-placed") return "";
  if (status === "projectile-definition-no-token-resource") {
    return "no effect projectile runtime resource matched this native projectile definition";
  }
  if (status === "projectile-definition-hero-mismatch") {
    return "effect projectile resource exists, but hero alias/name did not match this native projectile definition";
  }
  if (status === "projectile-definition-action-mismatch") {
    return "effect projectile resource exists for this hero, but action keys did not match this native projectile definition";
  }
  return "effect resource matched, but runtime placement/emitter evidence is still missing";
}

function auditRow(definition, matchTiers, pfxRows = []) {
  const status = rowStatus(matchTiers);
  const matchedRows = bestMatchedRowsForStatus(status, matchTiers);
  const pfxCandidates =
    status === "projectile-definition-no-token-resource" ? pfxCandidateRowsForDefinition(definition, pfxRows) : [];
  return {
    platform: definition.platform || "",
    status,
    readyForProjectileRuntime: status === "projectile-definition-placed",
    heroNames: pipeValues(definition.heroNames),
    actionKeys: pipeValues(definition.actionKeys),
    effectToken: definition.effectToken || "",
    pairedImpactEffectTokens: pipeValues(definition.nearbyEffectTokens),
    soundTokens: pipeValues(definition.nearbySoundTokens),
    matchedModelLabels: uniqueInOrder(matchedRows.map((row) => row.modelLabel).filter(Boolean)),
    matchedBindingStatuses: uniqueInOrder(matchedRows.map((row) => row.bindingStatus).filter(Boolean)),
    matchedResourcePaths: uniqueInOrder(matchedRows.map((row) => row.resourcePath).filter(Boolean)),
    pfxCandidateResourcePaths: pfxCandidates.map((candidate) => candidate.relativePath),
    bindingStatus: firstValue(matchedRows, "bindingStatus"),
    bindingBoneToken: firstValue(matchedRows, "bindingBoneToken"),
    nativeEmitterLabel: firstValue(matchedRows, "nativeEmitterLabel"),
    nativeProjectileId: firstValue(matchedRows, "nativeProjectileId"),
    runtimeLocatorLabel: firstValue(matchedRows, "runtimeLocatorLabel"),
    sourceFunctionName: definition.functionName || "",
    sourceLineNumber: definition.line || "",
    sourceFile: definition.sourceFile || "",
    selectorOutputTarget: definition.selectorOutputTarget || "",
    blocker: blockerForStatus(status),
  };
}

function summarize(items) {
  const byStatus = {};
  const heroes = new Set();
  const effects = new Set();
  for (const item of items || []) {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    for (const hero of item.heroNames || []) heroes.add(hero);
    if (item.effectToken) effects.add(item.effectToken);
  }
  const placedProjectileDefinitions = byStatus["projectile-definition-placed"] || 0;
  const definitionOnlyProjectileDefinitions = byStatus["projectile-definition-effect-only"] || 0;
  const actionMismatchProjectileDefinitions = byStatus["projectile-definition-action-mismatch"] || 0;
  const heroMismatchProjectileDefinitions = byStatus["projectile-definition-hero-mismatch"] || 0;
  const tokenMissingProjectileDefinitions = byStatus["projectile-definition-no-token-resource"] || 0;
  const noCoverageProjectileDefinitions =
    actionMismatchProjectileDefinitions + heroMismatchProjectileDefinitions + tokenMissingProjectileDefinitions;
  return {
    projectileDefinitions: items.length,
    placedProjectileDefinitions,
    definitionOnlyProjectileDefinitions,
    actionMismatchProjectileDefinitions,
    heroMismatchProjectileDefinitions,
    tokenMissingProjectileDefinitions,
    tokenMissingWithPfxCandidateRows: items.filter((item) => item.status === "projectile-definition-no-token-resource" && item.pfxCandidateResourcePaths?.length).length,
    noCoverageProjectileDefinitions,
    readyForProjectileRuntimeRows: placedProjectileDefinitions,
    blockingProjectileRuntimeRows: definitionOnlyProjectileDefinitions + noCoverageProjectileDefinitions,
    heroes: heroes.size,
    effectTokens: effects.size,
    byStatus,
  };
}

function buildProjectileRuntimeGapAudit({
  effectRows = [],
  coverageRows = [],
  pfxRows = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const items = (effectRows || [])
    .filter(isProjectileDefinition)
    .map((definition) => auditRow(definition, coverageMatchTiers(definition, coverageRows), pfxRows))
    .sort(
      (left, right) =>
        left.effectToken.localeCompare(right.effectToken) ||
        left.platform.localeCompare(right.platform) ||
        left.sourceFile.localeCompare(right.sourceFile) ||
        Number(left.sourceLineNumber || 0) - Number(right.sourceLineNumber || 0),
    );
  return {
    generatedAt,
    source: { effectTsv: defaultEffectTsv, coverageTsv: defaultCoverageTsv, pfxManifest: defaultPfxManifest },
    summary: summarize(items),
    items,
  };
}

function reportRowsForAudit(audit) {
  return audit.items.map((item) => ({
    platform: item.platform,
    status: item.status,
    readyForProjectileRuntime: item.readyForProjectileRuntime,
    heroNames: item.heroNames,
    actionKeys: item.actionKeys,
    effectToken: item.effectToken,
    pairedImpactEffectTokens: item.pairedImpactEffectTokens,
    soundTokens: item.soundTokens,
    bindingStatus: item.bindingStatus,
    bindingBoneToken: item.bindingBoneToken,
    nativeEmitterLabel: item.nativeEmitterLabel,
    nativeProjectileId: item.nativeProjectileId,
    runtimeLocatorLabel: item.runtimeLocatorLabel,
    matchedModelLabels: item.matchedModelLabels,
    matchedBindingStatuses: item.matchedBindingStatuses,
    matchedResourcePaths: item.matchedResourcePaths,
    pfxCandidateResourcePaths: item.pfxCandidateResourcePaths,
    sourceFunctionName: item.sourceFunctionName,
    sourceLineNumber: item.sourceLineNumber,
    sourceFile: item.sourceFile,
    selectorOutputTarget: item.selectorOutputTarget,
    blocker: item.blocker,
  }));
}

function exportProjectileRuntimeGapAudit({
  effectTsv = defaultEffectTsv,
  coverageTsv = defaultCoverageTsv,
  pfxManifest = defaultPfxManifest,
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
  generatedAt = new Date().toISOString(),
} = {}) {
  const audit = buildProjectileRuntimeGapAudit({
    effectRows: readTsv(effectTsv),
    coverageRows: readTsv(coverageTsv),
    pfxRows: readJsonItems(pfxManifest),
    generatedAt,
  });
  audit.source = { effectTsv, coverageTsv, pfxManifest };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "platform",
    "status",
    "readyForProjectileRuntime",
    "heroNames",
    "actionKeys",
    "effectToken",
    "pairedImpactEffectTokens",
    "soundTokens",
    "bindingStatus",
    "bindingBoneToken",
    "nativeEmitterLabel",
    "nativeProjectileId",
    "runtimeLocatorLabel",
    "matchedModelLabels",
    "matchedBindingStatuses",
    "matchedResourcePaths",
    "pfxCandidateResourcePaths",
    "sourceFunctionName",
    "sourceLineNumber",
    "sourceFile",
    "selectorOutputTarget",
    "blocker",
  ]);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileRuntimeGapAudit({
    effectTsv: optionValue(args, "--effect-tsv", defaultEffectTsv),
    coverageTsv: optionValue(args, "--coverage-tsv", defaultCoverageTsv),
    pfxManifest: optionValue(args, "--pfx-manifest", defaultPfxManifest),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileRuntimeGapAudit,
  exportProjectileRuntimeGapAudit,
  readTsv,
  reportRowsForAudit,
  summarize,
};
