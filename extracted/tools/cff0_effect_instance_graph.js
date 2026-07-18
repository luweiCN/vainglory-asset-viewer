#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultObjectRefsPath = "extracted/reports/cff0_runtime_object_refs.tsv";
const defaultPfxPath = "extracted/reports/effect_pfx_resource_manifest.tsv";
const defaultHooksPath = "extracted/reports/effect_hook_runtime_manifest.tsv";
const defaultProjectileBindingsPath = "extracted/reports/effect_projectile_binding_coverage.tsv";
const defaultViewerOut = "extracted/viewer/cff0-effect-instance-graph.json";
const defaultTsvOut = "extracted/reports/cff0_effect_instance_graph.tsv";
const defaultJsonOut = "extracted/reports/cff0_effect_instance_graph_summary.json";

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
  return Array.isArray(value)
    ? value.join("|").replace(/\t/g, " ").replace(/\r?\n/g, " ")
    : String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function listValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function buildPfxTokenIndex(pfxRows = []) {
  const index = new Map();
  for (const row of pfxRows || []) {
    if (!row.relativePath) continue;
    const tokens = uniqueSorted([...listValue(row.intrinsicEffectTokens), ...listValue(row.hookEffectTokens)]);
    for (const token of tokens) {
      const paths = index.get(token) || [];
      paths.push(row.relativePath);
      index.set(token, uniqueSorted(paths));
    }
  }
  return index;
}

function buildNativeHookTokenIndex(hookRows = []) {
  const index = new Map();
  for (const row of hookRows || []) {
    if (!row.effectToken) continue;
    const rows = index.get(row.effectToken) || [];
    rows.push(row);
    index.set(row.effectToken, rows);
  }
  return index;
}

function buildProjectileBindingTokenIndex(projectileRows = []) {
  const index = new Map();
  for (const row of projectileRows || []) {
    if (!row.modelLabel) continue;
    for (const effectToken of listValue(row.effectTokens)) {
      const key = `${row.modelLabel}\t${effectToken}`;
      const rows = index.get(key) || [];
      rows.push(row);
      index.set(key, rows);
    }
  }
  return index;
}

function projectileRowsForEffect(row, effectToken, projectileTokenIndex) {
  const ownerLabel = row.ownerLabel || row.modelLabel || "";
  return projectileTokenIndex.get(`${ownerLabel}\t${effectToken}`) || [];
}

function projectileHookRowsForItem(row, projectileRowsForItem, nativeHookTokenIndex) {
  const entries = [];
  const seen = new Set();
  for (const projectileRow of projectileRowsForItem || []) {
    for (const effectToken of listValue(projectileRow.nativeEffectHookTokens)) {
      for (const entry of nativeHookRowsForEffect(row, effectToken, nativeHookTokenIndex)) {
        const hook = entry.hook || {};
        const key = [
          effectToken,
          entry.matchKind,
          hook.platform || "",
          hook.sourceFunction || hook.sourceFunctionName || "",
          hook.sourceLine || hook.line || "",
          hook.effectToken || "",
        ].join("\t");
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ ...entry, effectToken });
      }
    }
  }
  return entries;
}

function ownerHeroRoot(ownerLabel) {
  return String(ownerLabel || "").replace(/_DefaultSkin$/, "").replace(/_Skin_[A-Za-z0-9_]+$/, "");
}

function nativeHookMatchKind(row, hook) {
  const ownerLabel = row.ownerLabel || row.modelLabel || "";
  const root = ownerHeroRoot(ownerLabel);
  const variantLabels = listValue(hook.resourceVariantModelLabels);
  const resourceRoots = listValue(hook.heroResourceRoots);
  const heroNames = listValue(hook.heroNames);
  if (variantLabels.includes(ownerLabel)) return "variant-model-label";
  if (resourceRoots.includes(root) || heroNames.includes(root)) return "hero-resource-root";
  if (!variantLabels.length && !resourceRoots.length && !heroNames.length) return "global-effect-token";
  return "";
}

function nativeHookRowsForEffect(row, effectToken, nativeHookTokenIndex) {
  const hooks = nativeHookTokenIndex.get(effectToken) || [];
  return hooks
    .map((hook) => ({ hook, matchKind: nativeHookMatchKind(row, hook) }))
    .filter((entry) => entry.matchKind);
}

function nativeLocatorLabelsForHook(hook = {}) {
  return uniqueSorted([...listValue(hook.locatorLabel), ...listValue(hook.boneToken)]);
}

function nativeBindHintsForHook(hook = {}) {
  return uniqueSorted([...listValue(hook.bindHint), ...listValue(hook.runtimeBindingEvidence), ...listValue(hook.runtimeBindingKind)]);
}

function nativeBindingTargetsForHook(hook = {}) {
  const locators = nativeLocatorLabelsForHook(hook);
  if (locators.length) return locators;
  const bindingKinds = listValue(hook.runtimeBindingKind);
  if (bindingKinds.length) return uniqueSorted(bindingKinds);
  return listValue(hook.runtimeBindingEvidence);
}

function parseTargetLabelOffsets(value) {
  const offsetsByLabel = new Map();
  for (const entry of listValue(value)) {
    const match = entry.match(/^(\d+):(.+)$/);
    if (!match) continue;
    const offsets = offsetsByLabel.get(match[2]) || [];
    offsets.push(match[1]);
    offsetsByLabel.set(match[2], uniqueSorted(offsets));
  }
  return offsetsByLabel;
}

function objectRefLookupKey(row, targetObjectOffset = row.targetObjectOffset) {
  return [
    row.relativePath || "",
    row.blockIndex || "",
    row.ownerLabel || row.modelLabel || "",
    row.ownerRecordStartField || row.recordStartField || "",
    String(targetObjectOffset || ""),
  ].join("\t");
}

function parseObjectRefTargetOffsets(value) {
  return listValue(value)
    .map((entry) => {
      const match = entry.match(/->(\d+)$/);
      return match ? match[1] : "";
    })
    .filter(Boolean);
}

function buildObjectRefLookup(objectRefRows = []) {
  const lookup = new Map();
  for (const row of objectRefRows || []) {
    const key = objectRefLookupKey(row);
    const rows = lookup.get(key) || [];
    rows.push(row);
    lookup.set(key, rows);
  }
  return lookup;
}

function resolveReferencedEvidence(row, objectRefLookup, maxDepth = 4) {
  const referencedRows = [];
  const seenOffsets = new Set();
  const queue = parseObjectRefTargetOffsets(row.targetObjectRefs).map((targetObjectOffset) => ({ targetObjectOffset, depth: 1 }));

  while (queue.length) {
    const current = queue.shift();
    if (!current.targetObjectOffset || current.depth > maxDepth || seenOffsets.has(current.targetObjectOffset)) continue;
    seenOffsets.add(current.targetObjectOffset);
    const childRows = objectRefLookup.get(objectRefLookupKey(row, current.targetObjectOffset)) || [];
    for (const childRow of childRows) {
      referencedRows.push(childRow);
      for (const targetObjectOffset of parseObjectRefTargetOffsets(childRow.targetObjectRefs)) {
        queue.push({ targetObjectOffset, depth: current.depth + 1 });
      }
    }
  }

  return {
    referencedObjectOffsets: uniqueSorted([...seenOffsets]),
    referencedAnimations: uniqueSorted(referencedRows.flatMap((childRow) => listValue(childRow.targetAnimations))),
    referencedResources: uniqueSorted(referencedRows.flatMap((childRow) => listValue(childRow.targetResources))),
    referencedEffects: uniqueSorted(referencedRows.flatMap((childRow) => listValue(childRow.targetEffects))),
    referencedAudios: uniqueSorted(referencedRows.flatMap((childRow) => listValue(childRow.targetAudios))),
    referencedBones: uniqueSorted(referencedRows.flatMap((childRow) => listValue(childRow.targetBones))),
    referencedBindTokens: uniqueSorted(referencedRows.flatMap((childRow) => listValue(childRow.targetBindTokens))),
  };
}

function summarizeRows(items) {
  const ownerLabels = new Set();
  const effectTokens = new Set();
  let resourceBoundRows = 0;
  let animationLinkedRows = 0;
  let boneLinkedRows = 0;
  let audioLinkedRows = 0;
  let objectRefExpandedRows = 0;
  let runtimeResourceLinkedRows = 0;
  let runtimeAnimationLinkedRows = 0;
  let runtimeBoneLinkedRows = 0;
  let runtimeAudioLinkedRows = 0;
  let nativeHookLinkedRows = 0;
  let nativeActionLinkedRows = 0;
  let nativeLocatorLinkedRows = 0;
  let nativeTimingLinkedRows = 0;
  let projectileBindingLinkedRows = 0;
  let projectileActionLinkedRows = 0;
  let projectileBoneLinkedRows = 0;
  let projectileTimingLinkedRows = 0;
  let resolvedResourceLinkedRows = 0;
  let resolvedActionLinkedRows = 0;
  let resolvedBindingLinkedRows = 0;
  let resolvedTimingLinkedRows = 0;

  for (const item of items || []) {
    ownerLabels.add(item.ownerLabel);
    effectTokens.add(item.effectToken);
    if (item.resourcePaths.length) resourceBoundRows += 1;
    if (item.targetAnimations.length) animationLinkedRows += 1;
    if (item.targetBones.length || item.targetBindTokens.length) boneLinkedRows += 1;
    if (item.targetAudios.length) audioLinkedRows += 1;
    if (
      item.referencedAnimations?.length ||
      item.referencedResources?.length ||
      item.referencedEffects?.length ||
      item.referencedAudios?.length ||
      item.referencedBones?.length ||
      item.referencedBindTokens?.length
    ) {
      objectRefExpandedRows += 1;
    }
    if ((item.runtimeResources || item.targetResources || []).length || item.resourcePaths.length) runtimeResourceLinkedRows += 1;
    if ((item.runtimeAnimations || item.targetAnimations || []).length) runtimeAnimationLinkedRows += 1;
    if ((item.runtimeBindings || item.targetBones || item.targetBindTokens || []).length) runtimeBoneLinkedRows += 1;
    if ((item.runtimeAudios || item.targetAudios || []).length) runtimeAudioLinkedRows += 1;
    if (item.nativeHookMatchKinds?.length) nativeHookLinkedRows += 1;
    if (item.nativeActionKeys?.length || item.nativeActionNames?.length) nativeActionLinkedRows += 1;
    if (item.nativeLocatorLabels?.length) nativeLocatorLinkedRows += 1;
    if (item.nativeRuntimeStartSeconds?.length) nativeTimingLinkedRows += 1;
    if (item.projectileMatchKinds?.length) projectileBindingLinkedRows += 1;
    if (item.projectileActionKeys?.length) projectileActionLinkedRows += 1;
    if (item.projectileBoneTokens?.length || item.projectileEmitterLabels?.length || item.projectileHookBindingTargets?.length) {
      projectileBoneLinkedRows += 1;
    }
    if (item.projectileRuntimeStartSeconds?.length || item.projectileHookRuntimeStartSeconds?.length) projectileTimingLinkedRows += 1;
    if (item.resolvedResourcePaths?.length) resolvedResourceLinkedRows += 1;
    if (item.resolvedActionLabels?.length || item.resolvedActionKeys?.length) resolvedActionLinkedRows += 1;
    if (item.resolvedBindingTargets?.length) resolvedBindingLinkedRows += 1;
    if (item.resolvedStartSeconds?.length) resolvedTimingLinkedRows += 1;
  }

  return {
    rows: items.length,
    ownerLabels: ownerLabels.size,
    effectTokens: effectTokens.size,
    resourceBoundRows,
    animationLinkedRows,
    boneLinkedRows,
    audioLinkedRows,
    objectRefExpandedRows,
    runtimeResourceLinkedRows,
    runtimeAnimationLinkedRows,
    runtimeBoneLinkedRows,
    runtimeAudioLinkedRows,
    nativeHookLinkedRows,
    nativeActionLinkedRows,
    nativeLocatorLinkedRows,
    nativeTimingLinkedRows,
    projectileBindingLinkedRows,
    projectileActionLinkedRows,
    projectileBoneLinkedRows,
    projectileTimingLinkedRows,
    resolvedResourceLinkedRows,
    resolvedActionLinkedRows,
    resolvedBindingLinkedRows,
    resolvedTimingLinkedRows,
  };
}

function buildCff0EffectInstanceGraph(
  { objectRefRows = [], pfxRows = [], hookRows = [], projectileRows = [] } = {},
  generatedAt = new Date().toISOString(),
) {
  const pfxTokenIndex = buildPfxTokenIndex(pfxRows);
  const objectRefLookup = buildObjectRefLookup(objectRefRows);
  const nativeHookTokenIndex = buildNativeHookTokenIndex(hookRows);
  const projectileTokenIndex = buildProjectileBindingTokenIndex(projectileRows);
  const items = [];
  const seen = new Set();

  for (const row of objectRefRows || []) {
    const effectTokens = listValue(row.targetEffects);
    if (!effectTokens.length) continue;
    const labelOffsets = parseTargetLabelOffsets(row.targetLabels);
    for (const effectToken of effectTokens) {
      const key = [
        row.relativePath,
        row.ownerLabel,
        row.ownerRecordStartField,
        row.ownerFieldOffset,
        row.targetObjectOffset,
        effectToken,
      ].join("\t");
      if (seen.has(key)) continue;
      seen.add(key);
      const referencedEvidence = resolveReferencedEvidence(row, objectRefLookup);
      const targetAnimations = listValue(row.targetAnimations);
      const targetResources = listValue(row.targetResources);
      const targetAudios = listValue(row.targetAudios);
      const targetBones = listValue(row.targetBones);
      const targetBindTokens = listValue(row.targetBindTokens);
      const resourcePaths = pfxTokenIndex.get(effectToken) || [];
      const nativeHookEntries = nativeHookRowsForEffect(row, effectToken, nativeHookTokenIndex);
      const nativeHooks = nativeHookEntries.map((entry) => entry.hook);
      const projectileRowsForItem = projectileRowsForEffect(row, effectToken, projectileTokenIndex);
      const projectileResourcePaths = uniqueSorted(
        projectileRowsForItem.flatMap((projectileRow) => [
          ...listValue(projectileRow.resourcePath),
          ...listValue(projectileRow.pairedProjectileResourcePaths),
          ...listValue(projectileRow.pairedImpactResourcePaths),
        ]),
      );
      const runtimeResources = uniqueSorted([
        ...targetResources,
        ...referencedEvidence.referencedResources,
        ...resourcePaths,
        ...projectileResourcePaths,
      ]);
      const runtimeAnimations = uniqueSorted([...targetAnimations, ...referencedEvidence.referencedAnimations]);
      const runtimeAudios = uniqueSorted([...targetAudios, ...referencedEvidence.referencedAudios]);
      const runtimeBones = uniqueSorted([...targetBones, ...referencedEvidence.referencedBones]);
      const runtimeBindTokens = uniqueSorted([...targetBindTokens, ...referencedEvidence.referencedBindTokens]);
      const nativeActionKeys = uniqueSorted(nativeHooks.flatMap((hook) => listValue(hook.actionKeys)));
      const nativeActionNames = uniqueSorted(nativeHooks.flatMap((hook) => listValue(hook.nativeActionNames || hook.actionNames)));
      const nativeResourcePaths = uniqueSorted(
        nativeHooks.flatMap((hook) => [
          ...listValue(hook.resourcePaths),
          ...listValue(hook.shadergraphGroupPaths),
          ...listValue(hook.shadergraphPaths),
        ]),
      );
      const nativeLocatorLabels = uniqueSorted(nativeHooks.flatMap(nativeLocatorLabelsForHook));
      const nativeBindHints = uniqueSorted(nativeHooks.flatMap(nativeBindHintsForHook));
      const nativeBindingTargets = uniqueSorted(nativeHooks.flatMap(nativeBindingTargetsForHook));
      const nativeRuntimeStartSeconds = uniqueSorted(nativeHooks.flatMap((hook) => listValue(hook.runtimeStartSeconds)));
      const nativeSourceKinds = uniqueSorted(nativeHooks.flatMap((hook) => listValue(hook.sourceKind)));
      const nativeHookMatchKinds = uniqueSorted(nativeHookEntries.map((entry) => entry.matchKind));
      const projectileHookEntries = projectileHookRowsForItem(row, projectileRowsForItem, nativeHookTokenIndex);
      const projectileHooks = projectileHookEntries.map((entry) => entry.hook);
      const projectileRoles = uniqueSorted(projectileRowsForItem.flatMap((projectileRow) => listValue(projectileRow.role)));
      const projectileActionKeys = uniqueSorted(projectileRowsForItem.flatMap((projectileRow) => listValue(projectileRow.actionKeys)));
      const projectileBindingStatuses = uniqueSorted(projectileRowsForItem.flatMap((projectileRow) => listValue(projectileRow.bindingStatus)));
      const projectileBoneTokens = uniqueSorted(projectileRowsForItem.flatMap((projectileRow) => listValue(projectileRow.bindingBoneToken)));
      const projectileEmitterLabels = uniqueSorted(projectileRowsForItem.flatMap((projectileRow) => listValue(projectileRow.nativeEmitterLabel)));
      const projectileRuntimeStartSeconds = uniqueSorted(projectileRowsForItem.flatMap((projectileRow) => listValue(projectileRow.runtimeStartSeconds)));
      const projectileMatchKinds = projectileRowsForItem.length ? ["model-effect-token"] : [];
      const projectileHookTokens = uniqueSorted(projectileHookEntries.map((entry) => entry.effectToken));
      const projectileHookMatchKinds = uniqueSorted(projectileHookEntries.map((entry) => entry.matchKind));
      const projectileHookBindingTargets = uniqueSorted(projectileHooks.flatMap(nativeBindingTargetsForHook));
      const projectileHookRuntimeStartSeconds = uniqueSorted(
        projectileHooks.flatMap((hook) => listValue(hook.runtimeStartSeconds)),
      );
      const runtimeBindings = uniqueSorted([...runtimeBones, ...runtimeBindTokens]);
      const resolvedResourcePaths = uniqueSorted([...runtimeResources, ...nativeResourcePaths]);
      const resolvedActionKeys = uniqueSorted([...nativeActionKeys, ...projectileActionKeys]);
      const resolvedActionLabels = uniqueSorted([...nativeActionKeys, ...nativeActionNames, ...projectileActionKeys]);
      const resolvedStartSeconds = uniqueSorted([
        ...nativeRuntimeStartSeconds,
        ...projectileRuntimeStartSeconds,
        ...projectileHookRuntimeStartSeconds,
      ]);
      const resolvedBindingTargets = uniqueSorted([
        ...runtimeBindings,
        ...nativeBindingTargets,
        ...projectileBoneTokens,
        ...projectileEmitterLabels,
        ...projectileHookBindingTargets,
      ]);
      items.push({
        id: key,
        source: row.source || "cff0-ptch",
        relativePath: row.relativePath || "",
        blockIndex: row.blockIndex || "",
        definitionFormatByte: row.definitionFormatByte || "",
        definitionVersionByte: row.definitionVersionByte || "",
        ownerLabel: row.ownerLabel || row.modelLabel || "",
        ownerRecordStartField: row.ownerRecordStartField || row.recordStartField || "",
        ownerFieldOffset: row.ownerFieldOffset || "",
        ownerLocalFieldOffset: row.ownerLocalFieldOffset || "",
        targetObjectOffset: row.targetObjectOffset || "",
        targetFieldCount: row.targetFieldCount || "",
        effectToken,
        targetEffectLabelOffsets: labelOffsets.get(effectToken) || [],
        targetAnimations,
        targetResources,
        targetAudios,
        targetBones,
        targetBindTokens,
        targetObjectRefs: listValue(row.targetObjectRefs),
        referencedObjectOffsets: referencedEvidence.referencedObjectOffsets,
        referencedAnimations: referencedEvidence.referencedAnimations,
        referencedResources: referencedEvidence.referencedResources,
        referencedEffects: referencedEvidence.referencedEffects,
        referencedAudios: referencedEvidence.referencedAudios,
        referencedBones: referencedEvidence.referencedBones,
        referencedBindTokens: referencedEvidence.referencedBindTokens,
        runtimeResources,
        runtimeAnimations,
        runtimeAudios,
        runtimeBones,
        runtimeBindTokens,
        runtimeBindings,
        nativeActionKeys,
        nativeActionNames,
        nativeResourcePaths,
        nativeLocatorLabels,
        nativeBindHints,
        nativeBindingTargets,
        nativeRuntimeStartSeconds,
        nativeSourceKinds,
        nativeHookMatchKinds,
        projectileRoles,
        projectileActionKeys,
        projectileBindingStatuses,
        projectileBoneTokens,
        projectileEmitterLabels,
        projectileRuntimeStartSeconds,
        projectileResourcePaths,
        projectileMatchKinds,
        projectileHookTokens,
        projectileHookMatchKinds,
        projectileHookBindingTargets,
        projectileHookRuntimeStartSeconds,
        resolvedResourcePaths,
        resolvedActionKeys,
        resolvedActionLabels,
        resolvedStartSeconds,
        resolvedBindingTargets,
        resourcePaths,
        resourceEvidenceSource: pfxTokenIndex.has(effectToken) ? "pfx-effect-token" : "",
      });
    }
  }

  applyInheritedActionKeys(items);

  items.sort(
    (left, right) =>
      left.ownerLabel.localeCompare(right.ownerLabel) ||
      Number(left.ownerFieldOffset || 0) - Number(right.ownerFieldOffset || 0) ||
      Number(left.targetObjectOffset || 0) - Number(right.targetObjectOffset || 0) ||
      left.effectToken.localeCompare(right.effectToken),
  );

  return {
    generatedAt,
    summary: summarizeRows(items),
    items,
  };
}

function applyInheritedActionKeys(items = []) {
  const keysByEffectToken = new Map();
  for (const item of items) {
    const actionKeys = listValue(item.resolvedActionKeys);
    if (!actionKeys.length) continue;
    const keys = keysByEffectToken.get(item.effectToken) || new Set();
    for (const actionKey of actionKeys) keys.add(actionKey);
    keysByEffectToken.set(item.effectToken, keys);
  }

  for (const item of items) {
    if (listValue(item.resolvedActionKeys).length || listValue(item.resolvedActionLabels).length) {
      item.inheritedActionKeys = [];
      item.inheritedActionSource = "";
      continue;
    }
    const keys = keysByEffectToken.get(item.effectToken);
    if (!keys || keys.size !== 1) {
      item.inheritedActionKeys = [];
      item.inheritedActionSource = "";
      continue;
    }
    const inheritedActionKeys = [...keys];
    item.inheritedActionKeys = inheritedActionKeys;
    item.inheritedActionSource = "effect-token-unique-runtime-action";
    item.resolvedActionKeys = uniqueSorted([...item.resolvedActionKeys, ...inheritedActionKeys]);
    item.resolvedActionLabels = uniqueSorted([...item.resolvedActionLabels, ...inheritedActionKeys]);
  }
}

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    relativePath: item.relativePath,
    blockIndex: item.blockIndex,
    definitionFormatByte: item.definitionFormatByte,
    definitionVersionByte: item.definitionVersionByte,
    ownerLabel: item.ownerLabel,
    ownerRecordStartField: item.ownerRecordStartField,
    ownerFieldOffset: item.ownerFieldOffset,
    ownerLocalFieldOffset: item.ownerLocalFieldOffset,
    targetObjectOffset: item.targetObjectOffset,
    targetFieldCount: item.targetFieldCount,
    effectToken: item.effectToken,
    targetEffectLabelOffsets: item.targetEffectLabelOffsets.join("|"),
    targetAnimations: item.targetAnimations.join("|"),
    targetResources: item.targetResources.join("|"),
    targetAudios: item.targetAudios.join("|"),
    targetBones: item.targetBones.join("|"),
    targetBindTokens: item.targetBindTokens.join("|"),
    targetObjectRefs: item.targetObjectRefs.join("|"),
    referencedObjectOffsets: item.referencedObjectOffsets.join("|"),
    referencedAnimations: item.referencedAnimations.join("|"),
    referencedResources: item.referencedResources.join("|"),
    referencedEffects: item.referencedEffects.join("|"),
    referencedAudios: item.referencedAudios.join("|"),
    referencedBones: item.referencedBones.join("|"),
    referencedBindTokens: item.referencedBindTokens.join("|"),
    runtimeResources: item.runtimeResources.join("|"),
    runtimeAnimations: item.runtimeAnimations.join("|"),
    runtimeAudios: item.runtimeAudios.join("|"),
    runtimeBones: item.runtimeBones.join("|"),
    runtimeBindTokens: item.runtimeBindTokens.join("|"),
    runtimeBindings: item.runtimeBindings.join("|"),
    nativeActionKeys: item.nativeActionKeys.join("|"),
    nativeActionNames: item.nativeActionNames.join("|"),
    inheritedActionKeys: item.inheritedActionKeys.join("|"),
    inheritedActionSource: item.inheritedActionSource,
    nativeResourcePaths: item.nativeResourcePaths.join("|"),
    nativeLocatorLabels: item.nativeLocatorLabels.join("|"),
    nativeBindHints: item.nativeBindHints.join("|"),
    nativeBindingTargets: item.nativeBindingTargets.join("|"),
    nativeRuntimeStartSeconds: item.nativeRuntimeStartSeconds.join("|"),
    nativeSourceKinds: item.nativeSourceKinds.join("|"),
    nativeHookMatchKinds: item.nativeHookMatchKinds.join("|"),
    projectileRoles: item.projectileRoles.join("|"),
    projectileActionKeys: item.projectileActionKeys.join("|"),
    projectileBindingStatuses: item.projectileBindingStatuses.join("|"),
    projectileBoneTokens: item.projectileBoneTokens.join("|"),
    projectileEmitterLabels: item.projectileEmitterLabels.join("|"),
    projectileRuntimeStartSeconds: item.projectileRuntimeStartSeconds.join("|"),
    projectileResourcePaths: item.projectileResourcePaths.join("|"),
    projectileMatchKinds: item.projectileMatchKinds.join("|"),
    projectileHookTokens: item.projectileHookTokens.join("|"),
    projectileHookMatchKinds: item.projectileHookMatchKinds.join("|"),
    projectileHookBindingTargets: item.projectileHookBindingTargets.join("|"),
    projectileHookRuntimeStartSeconds: item.projectileHookRuntimeStartSeconds.join("|"),
    resolvedResourcePaths: item.resolvedResourcePaths.join("|"),
    resolvedActionKeys: item.resolvedActionKeys.join("|"),
    resolvedActionLabels: item.resolvedActionLabels.join("|"),
    resolvedStartSeconds: item.resolvedStartSeconds.join("|"),
    resolvedBindingTargets: item.resolvedBindingTargets.join("|"),
    resourcePaths: item.resourcePaths.join("|"),
    resourceEvidenceSource: item.resourceEvidenceSource,
  }));
}

function exportCff0EffectInstanceGraph({
  objectRefsPath = defaultObjectRefsPath,
  pfxPath = defaultPfxPath,
  hooksPath = defaultHooksPath,
  projectileBindingsPath = defaultProjectileBindingsPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const manifest = buildCff0EffectInstanceGraph({
    objectRefRows: readTsv(objectRefsPath),
    pfxRows: readTsv(pfxPath),
    hookRows: readTsv(hooksPath),
    projectileRows: readTsv(projectileBindingsPath),
  });
  manifest.source = { objectRefsPath, pfxPath, hooksPath, projectileBindingsPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);

  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "relativePath",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "ownerLabel",
    "ownerRecordStartField",
    "ownerFieldOffset",
    "ownerLocalFieldOffset",
    "targetObjectOffset",
    "targetFieldCount",
    "effectToken",
    "targetEffectLabelOffsets",
    "targetAnimations",
    "targetResources",
    "targetAudios",
    "targetBones",
    "targetBindTokens",
    "targetObjectRefs",
    "referencedObjectOffsets",
    "referencedAnimations",
    "referencedResources",
    "referencedEffects",
    "referencedAudios",
    "referencedBones",
    "referencedBindTokens",
    "runtimeResources",
    "runtimeAnimations",
    "runtimeAudios",
    "runtimeBones",
    "runtimeBindTokens",
    "runtimeBindings",
    "nativeActionKeys",
    "nativeActionNames",
    "inheritedActionKeys",
    "inheritedActionSource",
    "nativeResourcePaths",
    "nativeLocatorLabels",
    "nativeBindHints",
    "nativeBindingTargets",
    "nativeRuntimeStartSeconds",
    "nativeSourceKinds",
    "nativeHookMatchKinds",
    "projectileRoles",
    "projectileActionKeys",
    "projectileBindingStatuses",
    "projectileBoneTokens",
    "projectileEmitterLabels",
    "projectileRuntimeStartSeconds",
    "projectileResourcePaths",
    "projectileMatchKinds",
    "projectileHookTokens",
    "projectileHookMatchKinds",
    "projectileHookBindingTargets",
    "projectileHookRuntimeStartSeconds",
    "resolvedResourcePaths",
    "resolvedActionKeys",
    "resolvedActionLabels",
    "resolvedStartSeconds",
    "resolvedBindingTargets",
    "resourcePaths",
    "resourceEvidenceSource",
  ]);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  console.log(JSON.stringify(exportCff0EffectInstanceGraph({
    objectRefsPath: optionValue(args, "--object-refs", defaultObjectRefsPath),
    pfxPath: optionValue(args, "--pfx", defaultPfxPath),
    hooksPath: optionValue(args, "--hooks", defaultHooksPath),
    projectileBindingsPath: optionValue(args, "--projectile-bindings", defaultProjectileBindingsPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  }), null, 2));
}

module.exports = {
  buildCff0EffectInstanceGraph,
  buildNativeHookTokenIndex,
  buildObjectRefLookup,
  buildPfxTokenIndex,
  buildProjectileBindingTokenIndex,
  exportCff0EffectInstanceGraph,
  nativeHookMatchKind,
  parseObjectRefTargetOffsets,
  parseTargetLabelOffsets,
  reportRowsForManifest,
  resolveReferencedEvidence,
  summarizeRows,
};
