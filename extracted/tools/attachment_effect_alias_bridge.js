#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultResourceBridgePath = "extracted/reports/attachment_effect_resource_bridge.tsv";
const defaultEffectResourcePath = "extracted/reports/effect_resource_index.tsv";
const defaultHeroNamesPath = "extracted/reports/hero_ability_effect_sound_buff_names.tsv";
const defaultDefinitionChainPath = "extracted/reports/definition_manifest_chain.tsv";
const defaultDefinitionLinksPath = "extracted/reports/definition_build_links.tsv";
const defaultTsvOut = "extracted/reports/attachment_effect_alias_bridge.tsv";
const defaultJsonOut = "extracted/reports/attachment_effect_alias_bridge_summary.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readTsv(filePath) {
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

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function effectBasename(relativePath) {
  return path.basename(String(relativePath || ""), ".pfx");
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

function compactNormalize(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "");
}

function normalizeHeroCode(code) {
  const match = String(code || "").match(/Hero\d{3}/i);
  return match ? `Hero${match[0].slice(4).padStart(3, "0")}` : "";
}

function normalizeResourceRoot(value) {
  const heroCode = normalizeHeroCode(value);
  if (heroCode) return heroCode;
  const cleaned = String(value || "")
    .replace(/^\*/, "")
    .replace(/\*$/, "")
    .trim();
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(cleaned) ? cleaned : "";
}

function extractHeroCodes(row) {
  return uniq(
    [row.targetRelativePath, row.meshSamples, row.skeletonSamples, row.targetLinkedPath]
      .join("|")
      .match(/Hero\d{3}/gi) || [],
  ).map(normalizeHeroCode);
}

function parseEffectToken(token, heroNameRows) {
  const effectRows = heroNameRows.filter((row) => row.kind === "Effect");
  for (const row of effectRows) {
    if (`Effect_${row.hero}_${row.name}` === token) {
      return {
        hero: row.hero,
        effectName: row.name,
        matchKind: "hero-effect-name-table",
      };
    }
  }

  const key = String(token || "").replace(/^Effect_/, "");
  const heroes = uniq(effectRows.map((row) => row.hero)).sort((left, right) => right.length - left.length);
  const hero = heroes.find((name) => key.startsWith(`${name}_`));
  if (!hero) return { hero: "", effectName: key, matchKind: "token-prefix-fallback" };
  return {
    hero,
    effectName: key.slice(hero.length + 1),
    matchKind: "token-prefix-fallback",
  };
}

function definitionScoreForHero(hero, row) {
  const label = String(row.manifestLabel || "").replace(/^\*/, "").replace(/\*$/, "");
  const target = String(row.targetRelativePath || "");
  let score = 0;
  if (label === hero) score += 100;
  if (label.startsWith(`${hero}_`)) score += 80;
  if (target.endsWith(`/${hero}.def`)) score += 70;
  if (target.includes(`/${hero}_`)) score += 50;
  if (!score) return 0;
  if (Number(row.childResourceRows || 0) > 0) score += 10;
  if (extractHeroCodes(row).length) score += 5;
  return score;
}

function definitionCandidatesForHero(hero, definitionRows) {
  if (!hero) return [];
  const candidates = definitionRows
    .map((row) => ({ row, score: definitionScoreForHero(hero, row) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.row.manifestLabel).localeCompare(String(right.row.manifestLabel));
    })
    .map((entry) => entry.row);
  const primaryRows = candidates.filter((row) => {
    const label = String(row.manifestLabel || "").replace(/^\*/, "").replace(/\*$/, "");
    return label === hero || String(row.targetRelativePath || "").endsWith(`/${hero}.def`);
  });
  if (primaryRows.length) return primaryRows;

  const resourceBackedRows = candidates.filter(
    (row) => Number(row.childResourceRows || 0) > 0 || String(row.skeletonSamples || "").includes("Hero"),
  );
  return resourceBackedRows.length ? resourceBackedRows : candidates;
}

function definitionLabel(row) {
  return String(row.manifestLabel || "").replace(/^\*/, "").replace(/\*$/, "");
}

function normalizedParsedHero(parsed, definitionRows) {
  if (!parsed?.hero) return parsed;
  if (definitionCandidatesForHero(parsed.hero, definitionRows).length) return parsed;

  const candidates = uniq((definitionRows || []).map(definitionLabel))
    .filter((label) => {
      if (!label || label === parsed.hero) return false;
      if (!parsed.hero.startsWith(label)) return false;
      const suffix = parsed.hero.slice(label.length).replace(/^_+/, "");
      return suffix.length >= 2 && definitionCandidatesForHero(label, definitionRows).length;
    })
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
  const hero = candidates[0];
  if (!hero) return parsed;

  const suffix = parsed.hero.slice(hero.length).replace(/^_+/, "");
  return {
    ...parsed,
    hero,
    effectName: [suffix, parsed.effectName].filter(Boolean).join("_"),
    originalHero: parsed.hero,
    originalEffectName: parsed.effectName,
    matchKind: "definition-prefix-hero-rehome",
  };
}

function runtimeEffectNameAliases(effectName) {
  const aliases = [];
  if (/_ProjectileImpact$/i.test(effectName)) {
    aliases.push(effectName.replace(/_ProjectileImpact$/i, "_Explosion"));
    aliases.push(effectName.replace(/_ProjectileImpact$/i, "_Hit"));
  } else if (/_Projectile$/i.test(effectName)) {
    aliases.push(effectName.replace(/_Projectile$/i, "_Shot"));
    aliases.push(effectName.replace(/_Projectile$/i, "_Proj"));
  }
  return aliases;
}

function collectEffectNameVariants(effectName, parsedHero, definitionRows, includeRuntimeAliases) {
  const variants = new Set([effectName]);
  const addVariant = (variant) => {
    if (!variant) return;
    variants.add(variant);
    if (includeRuntimeAliases) {
      for (const alias of runtimeEffectNameAliases(variant)) variants.add(alias);
    }
  };

  addVariant(effectName);
  if (/_Idle$/i.test(effectName)) addVariant(effectName.replace(/_Idle$/i, ""));

  for (const row of definitionRows) {
    const label = String(row.manifestLabel || "").replace(/^\*/, "").replace(/\*$/, "");
    const subAlias = label.startsWith(`${parsedHero}_`) ? label.slice(parsedHero.length + 1).split("_")[0] : "";
    if (subAlias && effectName.startsWith(`${subAlias}_`)) addVariant(effectName.slice(subAlias.length + 1));
  }

  return [...variants];
}

function effectNameVariants(effectName, parsedHero, definitionRows) {
  return collectEffectNameVariants(effectName, parsedHero, definitionRows, true);
}

function heroCodeForResource(row) {
  const match = String(row.relativePath || "").match(/^Effects\/(Hero\d{3})\//i);
  return match ? normalizeHeroCode(match[1]) : "";
}

function effectResourceRoot(row) {
  const match = String(row.relativePath || "").match(/^Effects\/([^/]+)\//i);
  return match ? normalizeResourceRoot(match[1]) : "";
}

function exactBasenameMatches(token, effectRows) {
  const key = normalize(String(token || "").replace(/^Effect_/, ""));
  return effectRows.filter((row) => normalize(effectBasename(row.relativePath)) === key);
}

function definitionLabelsByResourcePath(definitionLinkRows) {
  const byPath = new Map();
  for (const row of definitionLinkRows) {
    if (row.sourceRelativePath !== "Effects/KindredEffects.def" || row.category !== "effect") continue;
    if (!byPath.has(row.targetRelativePath)) byPath.set(row.targetRelativePath, []);
    byPath.get(row.targetRelativePath).push(row.label);
  }
  return byPath;
}

function matchHeroAliasResources(parsed, definitionRows, effectRows) {
  const normalizedParsed = normalizedParsedHero(parsed, definitionRows);
  const definitions = definitionCandidatesForHero(normalizedParsed.hero, definitionRows);
  const heroCodes = uniq(definitions.flatMap(extractHeroCodes));
  const resourceRoots = uniq([
    ...heroCodes,
    ...definitions
      .map((row) => normalizeResourceRoot(row.manifestLabel))
      .filter((label) => label && !/^(Talent|Cutscene|Sidebar|Tutorial)_/i.test(label)),
  ]);
  const hasKnownRootResources = effectRows.some((row) => resourceRoots.includes(effectResourceRoot(row)));
  const variants = effectNameVariants(normalizedParsed.effectName, normalizedParsed.hero, definitions);
  const canonicalVariants = collectEffectNameVariants(normalizedParsed.effectName, normalizedParsed.hero, definitions, false);
  const exactNames = new Set();
  const compactExactNames = new Set();
  const suffixNames = new Set();
  const compactSuffixNames = new Set();
  const canonicalExactNames = new Set();

  for (const root of resourceRoots) {
    for (const variant of variants) {
      exactNames.add(normalize(`${root}_${variant}`));
      compactExactNames.add(compactNormalize(`${root}_${variant}`));
      suffixNames.add(normalize(`_${variant}`));
      const compactVariant = compactNormalize(variant);
      if (compactVariant.length >= 5) compactSuffixNames.add(compactVariant);
    }
    for (const variant of canonicalVariants) canonicalExactNames.add(normalize(`${root}_${variant}`));
  }

  let matches = effectRows.filter((row) => resourceRoots.includes(effectResourceRoot(row)) && exactNames.has(normalize(effectBasename(row.relativePath))));
  if (matches.length) {
    const usedDropIdle = variants.includes(normalizedParsed.effectName.replace(/_Idle$/i, "")) && /_Idle$/i.test(normalizedParsed.effectName);
    const usedRuntimeAlias = !matches.some((row) => canonicalExactNames.has(normalize(effectBasename(row.relativePath))));
    const matchKind = usedDropIdle
      ? "hero-code-drop-idle-basename"
      : usedRuntimeAlias
        ? "hero-code-effect-name-alias-basename"
        : "hero-code-exact-basename";
    return {
      matches,
      matchKind,
      evidenceStrength: "strong",
      definitions,
      heroCodes,
      resourceRoots,
      normalizedParsed,
    };
  }

  matches = effectRows.filter(
    (row) => resourceRoots.includes(effectResourceRoot(row)) && compactExactNames.has(compactNormalize(effectBasename(row.relativePath))),
  );
  if (matches.length) {
    return {
      matches,
      matchKind: "hero-code-compact-basename",
      evidenceStrength: "strong",
      definitions,
      heroCodes,
      resourceRoots,
      normalizedParsed,
    };
  }

  matches = effectRows.filter((row) => {
    const resourceRoot = effectResourceRoot(row);
    return resourceRoots.includes(resourceRoot) && [...suffixNames].some((suffix) => normalize(effectBasename(row.relativePath)).endsWith(suffix));
  });
  if (matches.length) {
    return {
      matches,
      matchKind: "hero-code-skin-variant-basename",
      evidenceStrength: "strong",
      definitions,
      heroCodes,
      resourceRoots,
      normalizedParsed,
    };
  }

  matches = effectRows.filter((row) => {
    const resourceRoot = effectResourceRoot(row);
    const basename = compactNormalize(effectBasename(row.relativePath));
    return resourceRoots.includes(resourceRoot) && [...compactSuffixNames].some((suffix) => suffix && basename.endsWith(suffix));
  });
  if (matches.length) {
    return {
      matches,
      matchKind: "hero-code-compact-skin-variant-basename",
      evidenceStrength: "strong",
      definitions,
      heroCodes,
      resourceRoots,
      normalizedParsed,
    };
  }

  const distinctiveVariants = variants.filter((variant) => {
    const normalized = normalize(variant);
    if (!normalized || ["a", "b", "c", "aa", "attack", "impact", "projectile", "proj", "mf"].includes(normalized)) return false;
    return normalized.length >= 5 || normalized.includes("_");
  });
  matches = hasKnownRootResources
    ? []
    : effectRows.filter((row) => {
        const basename = normalize(effectBasename(row.relativePath));
        return distinctiveVariants.some((variant) => {
          const normalizedVariant = normalize(variant);
          const compactVariant = compactNormalize(variant);
          const compactBasename = compactNormalize(basename);
          return (
            basename === normalizedVariant ||
            basename.endsWith(`_${normalizedVariant}`) ||
            compactBasename === compactVariant ||
            compactBasename.endsWith(compactVariant)
          );
        });
    });
  const matchedRoots = uniq(matches.map(effectResourceRoot));
  if (matches.length && matchedRoots.length === 1) {
    return {
      matches,
      matchKind: "unique-resource-root-effect-name",
      evidenceStrength: "strong",
      definitions,
      heroCodes: matchedRoots[0].startsWith("Hero") ? matchedRoots : heroCodes,
      resourceRoots,
      normalizedParsed,
    };
  }

  const terms = normalizedParsed.effectName
    .split("_")
    .map((part) => normalize(part))
    .filter((part) => part.length >= 5);
  matches = effectRows.filter((row) => {
      const heroCode = heroCodeForResource(row);
      const basename = normalize(effectBasename(row.relativePath));
      return heroCodes.includes(heroCode) && terms.some((term) => basename.includes(term));
    });
  if (matches.length) {
    return {
      matches,
      matchKind: "hero-code-keyword-candidate",
      evidenceStrength: "weak",
      definitions,
      heroCodes,
      resourceRoots,
      normalizedParsed,
    };
  }

  matches = effectRows.filter((row) => {
    const resourceRoot = effectResourceRoot(row);
    const basename = normalize(effectBasename(row.relativePath));
    return resourceRoots.includes(resourceRoot) && terms.some((term) => basename.includes(term));
  });

  return {
    matches,
    matchKind: matches.length ? "hero-resource-root-keyword-candidate" : "none",
    evidenceStrength: matches.length ? "weak" : "none",
    definitions,
    heroCodes,
    resourceRoots,
    normalizedParsed,
  };
}

function bridgeAttachmentEffectAliases(resourceBridgeRows, effectRows, heroNameRows, definitionRows, definitionLinkRows = []) {
  const labelsByPath = definitionLabelsByResourcePath(definitionLinkRows);

  return resourceBridgeRows.map((row) => {
    const parsed = parseEffectToken(row.token, heroNameRows);
    const exact = exactBasenameMatches(row.token, effectRows);
    const alias = exact.length ? null : matchHeroAliasResources(parsed, definitionRows, effectRows);
    const matches = exact.length ? exact : alias.matches;
    const manifestRows = exact.length ? [] : alias.definitions;
    const heroCodes = exact.length ? [] : alias.heroCodes;
    const matchKind = exact.length ? "exact-basename" : alias.matchKind;
    const evidenceStrength = exact.length ? "confirmed" : alias.evidenceStrength;
    const aliasStatus = exact.length
      ? "exact-resource"
      : evidenceStrength === "strong"
        ? "hero-alias-resource"
        : evidenceStrength === "weak"
          ? "resource-candidate"
          : "unresolved";
    const paths = uniq(matches.map((match) => match.relativePath));

    return {
      token: row.token,
      aliasStatus,
      matchKind,
      evidenceStrength,
      parsedHero: parsed.hero,
      parsedEffectName: parsed.effectName,
      parseKind: parsed.matchKind,
      manifestLabels: uniq(manifestRows.map((manifestRow) => manifestRow.manifestLabel)).join("|"),
      heroCodes: heroCodes.join("|"),
      resourceCount: paths.length,
      resourcePaths: paths.join("|"),
      resourceHashes: uniq(matches.map((match) => match.hash)).join("|"),
      resourceLabels: uniq(paths.flatMap((resourcePath) => labelsByPath.get(resourcePath) || [])).join("|"),
      priorResourceStatus: row.resourceStatus,
      nativeRoles: row.nativeRoles,
      nativePlatforms: row.nativePlatforms,
      nativeFunctions: row.nativeFunctions,
      nativeSemanticCalls: row.nativeSemanticCalls,
    };
  });
}

function summarize(rows) {
  const byStatus = {};
  const byMatchKind = {};
  const byEvidenceStrength = {};
  for (const row of rows) {
    byStatus[row.aliasStatus] = (byStatus[row.aliasStatus] || 0) + 1;
    byMatchKind[row.matchKind] = (byMatchKind[row.matchKind] || 0) + 1;
    byEvidenceStrength[row.evidenceStrength] = (byEvidenceStrength[row.evidenceStrength] || 0) + 1;
  }
  return {
    rows: rows.length,
    byStatus,
    byMatchKind,
    byEvidenceStrength,
    unresolvedTokens: rows.filter((row) => row.aliasStatus === "unresolved").map((row) => row.token),
    weakCandidateTokens: rows.filter((row) => row.aliasStatus === "resource-candidate").map((row) => row.token),
  };
}

function exportAttachmentEffectAliasBridge({
  resourceBridgePath = defaultResourceBridgePath,
  effectResourcePath = defaultEffectResourcePath,
  heroNamesPath = defaultHeroNamesPath,
  definitionChainPath = defaultDefinitionChainPath,
  definitionLinksPath = defaultDefinitionLinksPath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const resourceBridgeRows = readTsv(resourceBridgePath);
  const effectRows = readTsv(effectResourcePath);
  const heroNameRows = readTsv(heroNamesPath);
  const definitionRows = readTsv(definitionChainPath);
  const definitionLinkRows = fs.existsSync(definitionLinksPath) ? readTsv(definitionLinksPath) : [];
  const rows = bridgeAttachmentEffectAliases(resourceBridgeRows, effectRows, heroNameRows, definitionRows, definitionLinkRows);
  const columns = [
    "token",
    "aliasStatus",
    "matchKind",
    "evidenceStrength",
    "parsedHero",
    "parsedEffectName",
    "parseKind",
    "manifestLabels",
    "heroCodes",
    "resourceCount",
    "resourcePaths",
    "resourceHashes",
    "resourceLabels",
    "priorResourceStatus",
    "nativeRoles",
    "nativePlatforms",
    "nativeFunctions",
    "nativeSemanticCalls",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportAttachmentEffectAliasBridge({
    resourceBridgePath: optionValue(args, "--resource-bridge", defaultResourceBridgePath),
    effectResourcePath: optionValue(args, "--effects", defaultEffectResourcePath),
    heroNamesPath: optionValue(args, "--hero-names", defaultHeroNamesPath),
    definitionChainPath: optionValue(args, "--definitions", defaultDefinitionChainPath),
    definitionLinksPath: optionValue(args, "--definition-links", defaultDefinitionLinksPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  bridgeAttachmentEffectAliases,
  definitionCandidatesForHero,
  effectNameVariants,
  exportAttachmentEffectAliasBridge,
  matchHeroAliasResources,
  parseEffectToken,
};
