# Vainglory Binding Chain Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover the real runtime chain that binds character meshes, weapons, props, effects, bones, sockets, local transforms, and animation visibility before using it to drive the viewer.

**Architecture:** Treat `.def/CFF0` strings as evidence, not authority. Join Android/iOS native code references, decoded definition instance blocks, mesh/skeleton data, and animation event candidates into a provenance-rich binding graph. The viewer may only use graph rows that carry enough evidence to prove `resource -> bind token -> runtime binder -> skeleton/socket/local transform`.

**Tech Stack:** Node.js CommonJS tools, `node:test`, existing CFF0 reports, existing HackedGlory Ghidra decompile output, Three.js viewer.

---

### Task 1: Disable Unsafe Runtime Takeover By Default

**Files:**
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/tests/viewer_lighting.test.js`

- [ ] **Step 1: Write the failing viewer regression test**

Add a test that keeps `runtime-skin-graph.json` loaded for diagnostics but asserts it cannot force native translation control unless a future complete binding graph is present.

Expected assertions:

```js
assert.match(appJs, /const ENABLE_RUNTIME_NATIVE_TRANSLATION_TAKEOVER = false;/);
assert.match(appJs, /function hasCompleteRuntimeBindingEvidence\(item = activeManifestItem\)/);
assert.match(appJs, /return ENABLE_RUNTIME_NATIVE_TRANSLATION_TAKEOVER && hasCompleteRuntimeBindingEvidence\(\) &&/);
assert.doesNotMatch(appJs, /if \(hasRuntimeNativeTranslationControl\(mapping\)\) return "safe";/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test extracted/tests/viewer_lighting.test.js
```

Expected: FAIL because the viewer currently lets incomplete runtime slots affect translation mode.

- [ ] **Step 3: Add the evidence gate**

Add `ENABLE_RUNTIME_NATIVE_TRANSLATION_TAKEOVER = false` and `hasCompleteRuntimeBindingEvidence`. Make `hasRuntimeNativeTranslationControl` return false until the complete graph exists. Keep debug access to runtime bind slots.

- [ ] **Step 4: Verify**

Run:

```bash
node --test extracted/tests/viewer_lighting.test.js
node --test extracted/tests/*.test.js
```

Expected: all tests pass. The viewer still shows runtime bind slot counts, but no longer changes animation behavior from incomplete slot strings.

### Task 2: Native Bind Function Evidence Report

**Files:**
- Create: `extracted/tools/native_bind_xrefs.js`
- Create: `extracted/tests/native_bind_xrefs.test.js`
- Generate: `extracted/reports/native_bind_xrefs.tsv`
- Generate: `extracted/reports/native_bind_function_context.json`

- [ ] **Step 1: Write tests for native bind constructor extraction**

Use a synthetic decompiled C snippet:

```c
void FUN_009c0e40(undefined8 *param_1) {
  FUN_009df040();
  *param_1 = &PTR_thunk_FUN_009df4b8_027c29c0;
  FUN_009df57c(param_1,"sword_bnd");
}
void FUN_009c0ea4(long param_1) {
  FUN_01986780(param_1,3,FUN_009df500,0);
}
```

Assert that the tool extracts:

- `functionName = FUN_009c0e40`
- `bindToken = sword_bnd`
- `setterFunction = FUN_009df57c`
- `initializerFunction = FUN_009df040`
- `vtableSymbol = PTR_thunk_FUN_009df4b8_027c29c0`
- nearby registration call `FUN_01986780(... FUN_009df500 ...)`

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test extracted/tests/native_bind_xrefs.test.js
```

Expected: FAIL because the tool does not exist.

- [ ] **Step 3: Implement native bind xref extraction**

Read all `.c` files under:

```text
external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions
external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/libGameKindred.c
```

Find functions containing calls that match:

```js
/FUN_009df57c\([^,]+,\s*"([^"]+_bnd|<no_bone>|[^"]+)"\)/
```

Keep function name, file path, line number, bind token, initializer calls, vtable assignment, sibling functions in the same file, and a 12-line source context.

- [ ] **Step 4: Export reports**

Write TSV columns:

```text
sourceFile functionName line bindToken setterFunction initializerFunction vtableSymbol registrationFunction contextHash
```

Write JSON entries with full source context for manual review.

- [ ] **Step 5: Verify on known tokens**

Run:

```bash
node extracted/tools/native_bind_xrefs.js
node --test extracted/tests/native_bind_xrefs.test.js
```

Expected report includes `sword_bnd`, `m_forkGlow_bnd`, and `Horns_bnd` from HackedGlory Android decompile.

### Task 3: Definition Block Field Neighborhood Report

**Files:**
- Create: `extracted/tools/definition_bind_field_report.js`
- Create: `extracted/tests/definition_bind_field_report.test.js`
- Generate: `extracted/reports/definition_bind_field_report.tsv`

- [ ] **Step 1: Write tests**

Use synthetic `definition_instance_strings.tsv` rows where `Bone_Weapon`, `sword_bnd`, and `build://Characters/Hero028/Art/hero028.mesh` appear in the same block. Assert the report returns an ordered window with byte offsets, string indexes, resource paths, and nearest labels.

- [ ] **Step 2: Implement report**

For each bind token row, collect previous 8 and next 12 string records from the same `relativePath + blockIndex`. Classify nearby records as `slotLabel`, `bindToken`, `mesh`, `skeleton`, `animation`, `effect`, `material`, or `label`.

- [ ] **Step 3: Verify**

Run:

```bash
node --test extracted/tests/definition_bind_field_report.test.js
node extracted/tools/definition_bind_field_report.js
```

Expected report explains known rows such as `Characters/Hero028/Lance.def -> Bone_Weapon -> sword_bnd`.

### Task 4: Bind Token To Skeleton/Bone Candidate Report

**Files:**
- Create: `extracted/tools/bind_token_bone_candidates.js`
- Create: `extracted/tests/bind_token_bone_candidates.test.js`
- Generate: `extracted/reports/bind_token_bone_candidates.tsv`

- [ ] **Step 1: Write tests**

Use synthetic skeleton bones with hashes and names plus bind tokens. Assert candidates are scored only as evidence, not final truth, and include method names such as `native-string`, `hash-probe`, `skeleton-name`, and `mesh-weighted-root-child`.

- [ ] **Step 2: Implement candidate generation**

Join runtime graph slots, skeleton JSON, mesh skin summary, and native bind xrefs. Probe known hash functions already in `cff0_tools.js` and record misses as evidence too. Do not silently map bind tokens to bone indexes.

- [ ] **Step 3: Verify**

Run:

```bash
node --test extracted/tests/bind_token_bone_candidates.test.js
node extracted/tools/bind_token_bone_candidates.js
```

Expected report shows whether `sword_bnd`, `gunA_bnd`, `shield_bnd`, and `staff_bnd` have any direct skeleton-space evidence.

### Task 5: Complete Runtime Binding Graph

**Files:**
- Create: `extracted/tools/runtime_binding_graph.js`
- Create: `extracted/tests/runtime_binding_graph.test.js`
- Generate: `extracted/viewer/runtime-binding-graph.json`
- Generate: `extracted/reports/runtime_binding_graph.tsv`

- [ ] **Step 1: Write tests**

Create fixtures where one binding has all required evidence and one only has a `.def` string. Assert only the complete binding is marked `viewerEligible = true`.

- [ ] **Step 2: Implement graph join**

Join native bind xrefs, definition field neighborhoods, runtime skin graph, bind token bone candidates, and resource manifests. Each graph edge must carry `evidenceSources`, `confidence`, and `missingEvidence`.

- [ ] **Step 3: Verify**

Run:

```bash
node --test extracted/tests/runtime_binding_graph.test.js
node extracted/tools/runtime_binding_graph.js
```

Expected: rows without proven token-to-bone/local-transform evidence are not eligible for viewer control.

### Task 6: Viewer Uses Only Complete Binding Graph

**Files:**
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/tests/viewer_lighting.test.js`

- [ ] **Step 1: Write failing viewer tests**

Assert the viewer loads `runtime-binding-graph.json` and only enables runtime takeover for graph edges where `viewerEligible === true`.

- [ ] **Step 2: Implement conservative viewer consumption**

Load the complete graph next to the current diagnostic runtime skin graph. Replace the current incomplete slot-based takeover with graph-backed eligibility.

- [ ] **Step 3: Verify**

Run:

```bash
node --test extracted/tests/viewer_lighting.test.js
node --test extracted/tests/*.test.js
```

Expected: all tests pass, and future runtime takeover can be traced to exact reports instead of guessed slot strings.
