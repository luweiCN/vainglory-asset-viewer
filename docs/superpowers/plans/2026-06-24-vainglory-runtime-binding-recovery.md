# Vainglory Runtime Binding Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-model viewer fixes with engine-derived runtime binding data for skins, attachments, visibility, materials, and animation playback.

**Architecture:** Treat `.def/CFF0` files as the source of truth and build evidence reports before changing viewer behavior. Decode instance payload structure incrementally, infer repeated component schemas from many definitions, generate a runtime manifest, then make the Three.js viewer consume that manifest instead of name-based and geometry-based guesses.

**Tech Stack:** Node.js CommonJS tools, `node:test`, existing CFF0/resource reports under `extracted/reports`, existing viewer under `extracted/viewer`, HackedGlory decompiled references under `external/HackedGlory`.

---

### Task 1: CFF0 Instance Evidence Report

**Files:**
- Create: `extracted/tools/definition_instance_graph.js`
- Create: `extracted/tests/definition_instance_graph.test.js`
- Modify: `extracted/tools/cff0_tools.js`
- Modify: `extracted/tools/export_cff0_reports.js`
- Generate: `extracted/reports/definition_instance_strings.tsv`
- Generate: `extracted/reports/definition_binding_tokens.tsv`

- [ ] **Step 1: Write failing tests**

Test `extractPayloadStringRecords` on a synthetic decoded payload that contains `Weapon`, `right_hand_bnd`, and `build://Characters/Hero028/Art/hero028.mesh`. Assert that it returns string offsets and classifies `right_hand_bnd` as a bind token.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test extracted/tests/definition_instance_graph.test.js`

Expected: FAIL because `definition_instance_graph.js` does not exist yet.

- [ ] **Step 3: Implement payload evidence extraction**

Create helpers that preserve `relativePath`, `blockIndex`, `payloadSize`, string index, string byte offset, semantic classification, nearest preceding label, and target resource path. Do not infer final attachment behavior in this task.

- [ ] **Step 4: Export reports**

Wire the tool into `export_cff0_reports.js` so normal CFF0 export writes the evidence reports together with the existing decoded instance TSV.

- [ ] **Step 5: Verify**

Run:

```bash
node --test extracted/tests/definition_instance_graph.test.js
node extracted/tools/export_cff0_reports.js
```

Expected: tests pass and the two new reports include bone/socket-like tokens such as `_bnd`, `<no_bone>`, `root_bnd`, and build resource links.

### Task 2: Definition Schema Clustering

**Files:**
- Create: `extracted/tools/definition_schema_clusters.js`
- Create: `extracted/tests/definition_schema_clusters.test.js`
- Generate: `extracted/reports/definition_schema_clusters.tsv`
- Generate: `extracted/reports/definition_schema_samples.json`

- [ ] **Step 1: Write tests**

Use synthetic string records from three definition blocks. Assert that records with the same resource-token pattern produce the same cluster signature, and records with mesh+skeleton+animation+bone tokens are tagged as a candidate render component.

- [ ] **Step 2: Implement clustering**

Group decoded instance blocks by `definitionFormatByte`, `definitionVersionByte`, payload size bucket, resource category sequence, and bind-token neighborhood. Keep output evidence-oriented: `candidateKind`, `confidence`, sample sources, and representative tokens.

- [ ] **Step 3: Verify on known heroes**

Run the clustering over existing reports and inspect `Characters/Hero021/Blackfeather.def`, `Characters/Hero028/Lance.def`, and `Characters/Hero048/Kinetic.def`. The report must show which blocks likely define body meshes, weapon meshes, effects, and attachment bones.

### Task 3: Runtime Skin Graph Manifest

**Files:**
- Create: `extracted/tools/runtime_skin_graph.js`
- Create: `extracted/tests/runtime_skin_graph.test.js`
- Modify: `extracted/tools/skin_preview_manifest.js`
- Generate: `extracted/reports/runtime_skin_graph.tsv`
- Generate: `extracted/viewer/runtime-skin-graph.json`

- [ ] **Step 1: Write tests**

Build a fixture where one skin has a body mesh, weapon mesh, skeleton, animation, and `right_hand_bnd`. Assert that the manifest keeps the weapon as a child attachment of the skin graph, not as an independent loose GLB.

- [ ] **Step 2: Implement graph generation**

Join definition links, instance string evidence, schema clusters, resource indexes, and existing GLB manifest. Output nodes with `kind`, `resourcePath`, `sourceDefinition`, `modelLabel`, `bindToken`, `visibilityHints`, and `evidence`.

- [ ] **Step 3: Verify coverage**

Run the graph builder and compare counts against `skin_model_summary.tsv`. The graph should cover the same base skins plus additional attachment/effect nodes where CFF0 evidence exists.

### Task 4: Viewer Runtime Graph Consumption

**Files:**
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/viewer/index.html`
- Modify: `extracted/tests/viewer_lighting.test.js`
- Consume: `extracted/viewer/runtime-skin-graph.json`

- [ ] **Step 1: Add tests for manifest consumption**

Assert that the viewer loads `runtime-skin-graph.json`, prefers graph attachments over heuristic attachment lookup, and keeps old heuristic behavior as a fallback only when graph data is absent.

- [ ] **Step 2: Implement runtime graph loader**

Load graph nodes for the active model, attach weapon/prop/effect nodes to the named bind token when present, and expose evidence in the debug panel.

- [ ] **Step 3: Remove per-model special cases as they become covered**

Delete only viewer rules proven redundant by runtime graph evidence. Keep current safeguards until the graph covers the affected model family.

### Task 5: Visibility And Animation Event Recovery

**Files:**
- Create: `extracted/tools/animation_event_report.js`
- Create: `extracted/tests/animation_event_report.test.js`
- Modify: `extracted/tools/runtime_skin_graph.js`
- Generate: `extracted/reports/animation_visibility_events.tsv`

- [ ] **Step 1: Detect event-like tracks and tokens**

Scan `.anim` payloads and `.def` records for named nodes, effect labels, bind tokens, and repeated action windows.

- [ ] **Step 2: Implement conservative visibility hints**

Only hide/show attachments when evidence links a node to an action token or event token. Do not hard-code specific heroes.

- [ ] **Step 3: Verify with known cases**

Use Lance Poseidon throne, Kinetic weapon, and Blackfeather sword cases as checks. The report must explain which evidence produced each visibility decision.

### Task 6: Automated Deformation QA

**Files:**
- Create: `extracted/tools/viewer_pose_quality_report.js`
- Create: `extracted/tests/viewer_pose_quality_report.test.js`
- Generate: `extracted/reports/viewer_pose_quality.tsv`

- [ ] **Step 1: Write tests for geometry outlier metrics**

Use synthetic skinned mesh samples to assert that detached attachments and stretched vertices produce high edge-distance or bind-token drift scores.

- [ ] **Step 2: Implement batch QA metrics**

For each skin/action sample, compute mesh bounds, high edge ratio, attachment drift from bind token, duplicate/ghost node candidates, and missing material/texture status.

- [ ] **Step 3: Use QA as regression gate**

Run the report across all viewer skins and sort by worst score. Future fixes should reduce classes of failures, not just one visible model.

