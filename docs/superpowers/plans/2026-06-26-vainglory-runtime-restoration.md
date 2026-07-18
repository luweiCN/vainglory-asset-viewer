# Vainglory Runtime Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the viewer around reverse-engineered game runtime evidence instead of per-model guesses.

**Architecture:** Build small manifest generators that turn native/decompiled evidence into stable viewer inputs, then consume those inputs conservatively in the renderer. Every visual behavior should be gated by a reportable evidence field.

**Tech Stack:** Node.js CommonJS tools, Node test runner, Three.js viewer, TSV/JSON manifests.

---

### Task 1: Runtime Timeline Manifest

**Files:**
- Create: `extracted/tools/native_runtime_timeline_manifest.js`
- Create: `extracted/tests/native_runtime_timeline_manifest.test.js`
- Generate: `extracted/viewer/native-runtime-timeline-manifest.json`
- Generate: `extracted/reports/native_runtime_timeline_manifest.tsv`
- Generate: `extracted/reports/native_runtime_timeline_manifest_summary.json`

- [ ] Extract action, delay, effect spawn, projectile spawn, and attachment candidate rows into one hero/action timeline.
- [ ] Preserve native file, function, line, source kind, evidence, effect token, projectile id, emitter, locator, and delay seconds.
- [ ] Sort events by platform, hero, action key, function, and line.
- [ ] Add tests for action delay preceding effect/projectile events.

### Task 2: Viewer Timeline Diagnostics

**Files:**
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/tests/viewer_lighting.test.js`

- [ ] Load `native-runtime-timeline-manifest.json`.
- [ ] Expose per-model timeline diagnostics in the current model health/status text.
- [ ] Do not change visual behavior yet.

### Task 3: Attachment Visibility Timeline

**Files:**
- Create: `extracted/tools/runtime_attachment_visibility_manifest.js`
- Create: `extracted/tests/runtime_attachment_visibility_manifest.test.js`
- Modify: `extracted/viewer/app.js`
- Generate: `extracted/viewer/runtime-attachment-visibility-manifest.json`

- [ ] Convert attachment candidates and native animation scale/visibility evidence into action-gated visibility windows.
- [ ] Gate embedded props such as throne/platform/temporary weapons by action and time.
- [ ] Keep model-specific overrides only when backed by manifest evidence.

### Task 4: Projectile Callback Semantics

**Files:**
- Create: `extracted/tools/native_projectile_callback_semantics.js`
- Create: `extracted/tests/native_projectile_callback_semantics.test.js`
- Modify: `extracted/tools/effect_projectile_binding_coverage_report.js`
- Modify: `extracted/viewer/app.js`

- [ ] Classify callback functions as constant, multiplier, target-distance, attribute-derived, or unresolved.
- [ ] Apply only constant/multiplier callbacks to viewer trajectories.
- [ ] Keep target-distance and attribute-derived callbacks as diagnostics until target runtime exists.

### Task 5: Shader Runtime Material Semantics

**Files:**
- Modify: `extracted/tools/effect_shadergraph_material_manifest.js`
- Modify: `extracted/tests/effect_shadergraph_material_manifest.test.js`
- Modify: `extracted/viewer/app.js`

- [ ] Classify blend, alpha, mask, emissive, rim, and UV animation roles.
- [ ] Stop rendering mask/base textures as visible cards.
- [ ] Apply conservative material previews only when shadergraph roles are classified.

### Task 6: Resource Completeness Audit

**Files:**
- Create: `extracted/tools/runtime_resource_completeness_report.js`
- Create: `extracted/tests/runtime_resource_completeness_report.test.js`
- Generate: `extracted/reports/runtime_resource_completeness.tsv`
- Generate: `extracted/reports/runtime_resource_completeness_summary.json`

- [ ] Compare skin catalog, runtime skin graph, GLB manifests, texture manifests, PFX manifests, and localized skin names.
- [ ] Report missing model, missing texture, missing material, missing effect, and package-gap cases separately.
- [ ] Feed missing but discoverable resources back into existing extract/index tools.

### Task 7: Runtime State Conditions

**Files:**
- Create: `extracted/tools/native_runtime_state_conditions.js`
- Create: `extracted/tests/native_runtime_state_conditions.test.js`
- Modify: `extracted/viewer/app.js`

- [ ] Extract buff/talent/ability state predicates from native blocks.
- [ ] Gate timeline events by action first, then state predicate.
- [ ] Surface unresolved predicates in diagnostics instead of guessing.
