# Vainglory Animation Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Vainglory hero models play native animation data in the viewer without obvious stretching or broken skinning.

**Architecture:** Stop treating `.anim` files as a guessed flat layout. Parse the native `animData` package first, then decode the family 3 payload using offsets that match HackedGlory's loader, and only enable mesh playback for clips that pass validation.

**Tech Stack:** Node.js test runner, existing extraction tools under `extracted/tools`, browser viewer under `extracted/viewer`, HackedGlory decompiled C references under `external/HackedGlory`.

---

### Task 1: Native AnimData Package Parser

**Files:**
- Modify: `extracted/tools/animation_tools.js`
- Modify: `extracted/tests/animation_tools.test.js`

- [ ] **Step 1: Write the failing test**

Add a test named `parseAnimationPackage reads native animData package entries` that builds a synthetic one-entry `.anim` buffer:

```js
const buffer = Buffer.alloc(80);
buffer.writeUInt32LE(1, 0);
buffer.writeFloatLE(1.5, 4);
buffer.writeUInt32LE(3, 8);
buffer.writeUInt32LE(64, 12);
buffer.writeFloatLE(20, 16);
buffer.writeUInt32LE(30, 20);
buffer.writeUInt32LE(2, 24);
buffer.writeUInt32LE(8, 28);
buffer.writeUInt32LE(0, 32);
```

Assert that `parseAnimationPackage(buffer)` returns `entryCount: 1`, one entry with `payloadOffset: 16`, `payloadSize: 64`, `samplerFamily: 3`, `clipDuration: 1.5`, `payloadHeader.fps: 20`, `payloadHeader.frameCount: 30`, `payloadHeader.trackCount: 2`, and `payloadHeader.descriptorTableLength: 8`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test extracted/tests/animation_tools.test.js`

Expected: FAIL because `parseAnimationPackage` is not exported.

- [ ] **Step 3: Write minimal implementation**

Implement `parseAnimationPackage(buffer)` and `parseAnimationPayloadHeader(buffer, offset)` in `extracted/tools/animation_tools.js`. Keep existing exported APIs stable.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test extracted/tests/animation_tools.test.js`

Expected: PASS.

### Task 2: Report Real Native Offsets

**Files:**
- Modify: `extracted/tools/animation_structure_report.js`
- Modify: `extracted/tests/animation_structure_report.test.js`
- Regenerate: `extracted/reports/animation_structure_report.json`
- Regenerate: `extracted/reports/animation_structure_report.tsv`
- Regenerate: `extracted/viewer/animation-structure-manifest.json`

- [ ] **Step 1: Write the failing test**

Add assertions that the report includes `animDataEntryCount`, `samplerFamily`, `payloadOffset`, `payloadSize`, `clipDuration`, `payloadFps`, `payloadFrameCount`, and `payloadTrackCount` for a fixture animation.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test extracted/tests/animation_structure_report.test.js`

Expected: FAIL because the report does not expose the new semantic fields.

- [ ] **Step 3: Write minimal implementation**

Use `parseAnimationPackage(buffer)` in `animation_structure_report.js`, then continue using the first entry payload for the existing transform-run diagnostics.

- [ ] **Step 4: Run test and regenerate reports**

Run:

```bash
node --test extracted/tests/animation_structure_report.test.js
node extracted/tools/animation_structure_report.js
```

Expected: test PASS and regenerated manifests contain native package fields.

### Task 3: Family 3 Payload Decoder

**Files:**
- Modify: `extracted/tools/animation_tools.js`
- Modify: `extracted/tests/animation_tools.test.js`
- Reference: `external/HackedGlory/.../01991.c`
- Reference: `external/HackedGlory/.../01993.c`
- Reference: `external/HackedGlory/.../01994.c`

- [ ] **Step 1: Map the native sampler anchors**

Record the HackedGlory functions used by sampler family 3: loader, sampler, blend/apply, and count function.

- [ ] **Step 2: Write a decoder test around a real file**

Use `Characters/Ringo/Art/ringo.idle.anim` and assert that the decoder finds 76 track headers, the descriptor table starts at the aligned pose-run end, and packed curve data starts at `4250`.

- [ ] **Step 3: Implement only enough decoding to pass**

Decode family 3 track metadata and descriptor spans without producing animation frames yet.

- [ ] **Step 4: Run tests**

Run: `node --test extracted/tests/*.test.js`

Expected: all tests PASS.

### Task 4: Validated Frame Sampling

**Files:**
- Modify: `extracted/tools/animation_tools.js`
- Modify: `extracted/tests/animation_tools.test.js`
- Modify: `extracted/tools/animation_bone_mapping_report.js`

- [ ] **Step 1: Write a frame sampling test**

Assert that sampling Ringo idle at frame 0 reproduces the aligned base pose and sampling frame 1 produces finite transforms for all mapped bones.

- [ ] **Step 2: Implement family 3 sampling**

Read packed curve data by descriptor type, produce per-track translation, rotation, and scale, and reject frames with non-finite values or unsafe scale.

- [ ] **Step 3: Run tests**

Run: `node --test extracted/tests/*.test.js`

Expected: all tests PASS.

### Task 5: Viewer Playback Without Stretching

**Files:**
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/tests/viewer_lighting.test.js`
- Regenerate: `extracted/viewer/animation-bone-mapping-manifest.json`

- [ ] **Step 1: Add validation gates**

Only expose an animation as playable when all mapped bones have finite sampled transforms and bone palette matrices stay within expected bounds.

- [ ] **Step 2: Wire real sampled frames into viewer playback**

Replace pose-loop fallback playback with decoded frame sampling for validated family 3 clips.

- [ ] **Step 3: Verify in browser**

Open `http://127.0.0.1:8765/viewer/index.html`, choose Ringo idle, and confirm the mesh follows the skeleton without visible limb stretching.

- [ ] **Step 4: Run automated tests**

Run: `node --test extracted/tests/*.test.js`

Expected: all tests PASS.
