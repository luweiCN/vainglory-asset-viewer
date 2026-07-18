# Resource Index And Definition Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover a browsable `build://` resource index so definition, animation, effect, and sound resources can be found by original virtual path instead of MD5 filename.

**Architecture:** Add a focused resource-index module that hashes concrete `build://` paths, checks whether the matching iOS `Data/<HH>/<MD5>` file exists, writes JSON/TSV reports, and creates a hard-linked output tree under `extracted/build_resources_by_path/`. This phase does not decode every CFF0/DEF0 object yet; it creates the file map needed for later manifest, animation, and VFX decoding.

**Tech Stack:** Node.js CommonJS, `node:test`, filesystem hard links, existing `extracted/reports/build_paths_all.txt` and iOS `Data/` directory.

---

### Task 1: Resource Path Index

**Files:**
- Create: `extracted/tools/resource_index.js`
- Test: `extracted/tests/resource_index.test.js`

- [x] **Step 1: Write failing tests**

Tests cover stripping `build://`, rejecting format placeholders, computing MD5 resource paths, reading magic bytes, and generating matched/missing/skipped entries.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test extracted/tests/resource_index.test.js`
Expected: FAIL because `resource_index.js` does not exist yet.

- [x] **Step 3: Implement resource-index helpers**

Export `normalizeBuildPath`, `hasPrintfPlaceholder`, `md5Upper`, `dataFileForHash`, `readMagic4`, and `buildResourceIndex`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test extracted/tests/resource_index.test.js`
Expected: PASS.

### Task 2: Index Export CLI

**Files:**
- Create: `extracted/tools/export_resource_index.js`
- Modify: `extracted/reports/README.md`

- [x] **Step 1: Add CLI**

CLI inputs:
`--paths extracted/reports/build_paths_all.txt`
`--data extracted/ios_raw/Payload/GameKindred.app/Data`
`--out extracted/reports`
`--tree extracted/build_resources_by_path`

- [x] **Step 2: Export reports and hard-linked tree**

Outputs:
`build_resource_index.json`
`build_resource_index.tsv`
`build_resource_missing.tsv`
`build_resource_skipped_placeholders.tsv`

- [x] **Step 3: Run CLI**

Run: `node extracted/tools/export_resource_index.js`
Expected: reports are written and concrete matched resources are linked by original path.

### Task 3: High-Value Resource Reports

**Files:**
- Modify: `extracted/tools/export_resource_index.js`
- Generate: `extracted/reports/definition_resource_index.tsv`
- Generate: `extracted/reports/animation_resource_index.tsv`
- Generate: `extracted/reports/effect_resource_index.tsv`

- [x] **Step 1: Add categorized reports**

Categorize matched paths by extension `.def`, `.anim`, `.pfx`, `.assetbundle`, `.mesh`, `.skeleton`, audio, and image.

- [x] **Step 2: Verify counts**

Run: `wc -l extracted/reports/*resource_index.tsv`
Expected: categorized reports have concrete matched resources.

### Task 4: CFF0 Definition Reports

**Files:**
- Create: `extracted/tools/cff0_tools.js`
- Create: `extracted/tools/export_cff0_reports.js`
- Test: `extracted/tests/cff0_tools.test.js`
- Generate: `extracted/reports/cff0_definition_summary.tsv`
- Generate: `extracted/reports/cff0_definition_chunks.tsv`
- Generate: `extracted/reports/cff0_definition_symbols.tsv`

- [x] **Step 1: Add CFF0 chunk parser tests**

Run: `node --test extracted/tests/cff0_tools.test.js`
Expected: FAIL until the parser module exists.

- [x] **Step 2: Implement CFF0 chunk parser**

The parser reads the CFF0 header, walks contiguous `DEF0`, `INST`, `PTCH`, and `SYMB` chunks, and extracts clean starred SYMB markers.

- [x] **Step 3: Export CFF0 definition reports**

Run: `node extracted/tools/export_cff0_reports.js`
Expected: 12 definition files, 96 chunks, 24 symbols.

### Task 5: Animation Candidate Scan

**Files:**
- Create: `extracted/tools/animation_tools.js`
- Create: `extracted/tools/export_animation_candidates.js`
- Test: `extracted/tests/animation_tools.test.js`
- Generate: `extracted/reports/animation_candidate_files.tsv`
- Generate: `extracted/reports/animation_candidate_files.json`

- [x] **Step 1: Add animation-header tests**

Run: `node --test extracted/tests/animation_tools.test.js`
Expected: FAIL until the animation module exists.

- [x] **Step 2: Implement animation header detection**

The detector verifies version, duration, payload size, FPS, frame count, track count, and name-table value.

- [x] **Step 3: Export animation candidates**

Run: `node extracted/tools/export_animation_candidates.js`
Expected: 3097 likely animation files linked under `extracted/animation_candidates_by_hash/`.

### Task 6: Documentation And Backup

**Files:**
- Modify: `extracted/reports/README.md`
- Modify: `extracted/hero_assets/README.md`

- [x] **Step 1: Document resource index usage**

Explain how to open `extracted/build_resources_by_path/Levels/HeroManifest.def` and related resources.

- [x] **Step 2: Verify all tests**

Run: `node --test extracted/tests/*.test.js`
Expected: all tests pass.

- [x] **Step 3: Backup**

Run: `tar -czf backups/vainglory_resource_index_v1_<timestamp>.tar.gz ...`
Expected: gzip test passes.

### Task 7: CFF0 PTCH And Animation Follow-up

**Files:**
- Modify: `extracted/tools/cff0_tools.js`
- Modify: `extracted/tools/export_cff0_reports.js`
- Modify: `extracted/tools/animation_tools.js`
- Modify: `extracted/tools/export_animation_candidates.js`
- Create: `extracted/tools/animation_path_recovery.js`
- Create: `extracted/tools/export_animation_path_recovery.js`
- Test: `extracted/tests/animation_path_recovery.test.js`
- Generate: `extracted/reports/cff0_patch_tables.tsv`
- Generate: `extracted/reports/animation_path_matches.tsv`
- Generate: `extracted/reports/animation_unresolved_candidates.tsv`

- [x] **Step 1: Decode PTCH table shape**

PTCH chunks are parsed as an entry count, source/target offset pairs, and trailing integer values. Reports show 24 PTCH rows across the recovered definition manifests.

- [x] **Step 2: Investigate INST compression**

Standard zlib, gzip, brotli, and direct LZ4 block attempts did not decode INST payloads. Entropy is high on the large manifests, so the next step is locating the native manifest loader/decompressor rather than guessing formats.

- [x] **Step 3: Recover known animation paths**

Known build paths and skipped printf-style placeholder patterns are matched against animation candidate hashes. Current output resolves 3 known `moveCursor` clips and leaves 3094 candidates unresolved.

- [x] **Step 4: Parse first-level animation track tables**

Animation reports now include first track data offset, track format codes, and per-track key offsets. Curve payload decoding and skeleton playback remain future work.

### Task 8: Native CFF0 Decode And Expanded Asset Links

**Files:**
- Create: `extracted/tools/native_xrefs.js`
- Create: `extracted/tools/export_native_xrefs.js`
- Create: `extracted/tools/decoded_build_paths.js`
- Create: `extracted/tools/definition_links.js`
- Create: `extracted/tools/skin_model_summary.js`
- Test: `extracted/tests/native_xrefs.test.js`
- Test: `extracted/tests/decoded_build_paths.test.js`
- Test: `extracted/tests/definition_links.test.js`
- Test: `extracted/tests/export_resource_index.test.js`
- Test: `extracted/tests/skin_model_summary.test.js`
- Generate: `extracted/reports/android_native_string_xrefs.tsv`
- Generate: `extracted/reports/cff0_decoded_instances.tsv`
- Generate: `extracted/reports/decoded_build_paths.txt`
- Generate: `extracted/reports/build_paths_combined.txt`
- Generate: `extracted/reports/definition_build_links.tsv`
- Generate: `extracted/reports/character_asset_links.tsv`
- Generate: `extracted/reports/skin_model_summary.tsv`

- [x] **Step 1: Locate native manifest loaders**

Android arm64 references show `HeroManifest` and `KindredSkinManifest` are loaded by symbol first, then by concrete `build://...Manifest.def` path if missing. The CFF0 loader checks `DEF0`, scans `SYMB`, `PTCH`, and `INST`, and applies pointer relocations from PTCH tables.

- [x] **Step 2: Decode INST payloads**

`INST` is not compressed with zlib/gzip/brotli/LZ4. The native path uses a 16-entry obfuscation key table, Bob Jenkins lookup hash, and a rolling encrypted-word XOR step. Decoded instances now expose readable manifest strings for 931 CFF0 `.def` files.

- [x] **Step 3: Feed decoded paths back into the resource index**

Decoded definitions produced 22926 concrete `build://` paths. Rebuilding the index with the combined path list resolves 23371 resources, including 5010 animations, 939 meshes, 116 skeletons, 2887 effects, and 13364 audio files.

- [x] **Step 4: Export character and skin relationship reports**

`definition_build_links.tsv` and `character_asset_links.tsv` link decoded `.def` labels to referenced resources. `skin_model_summary.tsv` summarizes 420 model/skin rows and marks whether a skin has a direct skeleton or falls back to the default skin skeleton.

### Task 9: Skin-Aware GLB Preview Refresh

**Files:**
- Modify: `extracted/tools/rsc0_mesh_to_obj.js`
- Create: `extracted/tools/skin_preview_manifest.js`
- Modify: `extracted/viewer/app.js`
- Test: `extracted/tests/rsc0_mesh_to_obj.test.js`
- Test: `extracted/tests/skin_preview_manifest.test.js`
- Modify: `extracted/tests/viewer_lighting.test.js`
- Generate: `extracted/viewer/skin-glb-pbr-manifest.json`
- Generate: `extracted/viewer/textured-glb-pbr-manifest.json`
- Generate: `extracted/reports/screenshots/viewer_skin_manifest_desktop.png`

- [x] **Step 1: Support compact mesh indices**

RSC0 mesh parsing now accepts both 16-bit index buffers and compact 8-bit index buffers. Re-running conversion on `extracted/hero_assets/meshes` converts all 453 character mesh files, leaving `mesh_to_obj_failures.tsv` and `mesh_to_obj_mtl_failures.tsv` empty.

- [x] **Step 2: Rebuild PBR GLB previews**

The PBR GLB batch was rebuilt from `hero_assets_obj_mtl` so material draw ranges and PBR texture assignments are preserved. `textured-glb-pbr-manifest.json` now contains 453 GLB previews.

- [x] **Step 3: Generate skin-aware viewer manifest**

`skin-glb-pbr-manifest.json` joins the PBR GLB manifest with `skin_model_summary.tsv`, producing 526 viewer entries: 420 decoded skin/model relationship entries and 106 passthrough GLB entries.

- [x] **Step 4: Update and verify viewer**

The viewer now prefers `skin-glb-pbr-manifest.json`, displays decoded skin labels, shows direct/default skeleton usage, and uses explicit skeleton paths for the bone overlay. Playwright screenshots and pixel checks confirm the refreshed viewer renders a nonblank model on desktop and mobile.

### Task 10: Skin Animation Binding Index And Viewer Control

**Files:**
- Create: `extracted/tools/skin_animation_bindings.js`
- Create: `extracted/tests/skin_animation_bindings.test.js`
- Modify: `extracted/viewer/index.html`
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/viewer/styles.css`
- Modify: `extracted/tests/viewer_lighting.test.js`
- Generate: `extracted/viewer/skin-animation-bindings.json`
- Generate: `extracted/reports/skin_animation_bindings.tsv`
- Generate: `extracted/reports/screenshots/viewer_animation_bindings_desktop.png`
- Generate: `extracted/reports/screenshots/viewer_animation_bindings_mobile.png`

- [x] **Step 1: Join skins to recovered animation paths**

`skin_animation_bindings.js` joins `skin-glb-pbr-manifest.json`, `skin_model_summary.tsv`, `character_asset_links.tsv`, `animation_resource_index.tsv`, and `skeleton_resource_index.tsv`. The generated binding manifest covers 420 decoded skin/model rows and 13310 animation rows.

- [x] **Step 2: Verify track-to-skeleton compatibility**

Animation track counts match the active skeleton bone count for 13279 rows. The 31 mismatches are Ringo Pirate rows where base Ringo animations have 76 tracks but the Pirate skeleton has 115 bones; Pirate-specific animations match and remain available.

- [x] **Step 3: Add viewer animation metadata control**

The viewer now loads `skin-animation-bindings.json` and adds an Animation selector. It lists only animations where `trackMatchesSkeleton` is true, so currently incompatible base clips are hidden instead of being presented as usable.

- [x] **Step 4: Re-verify desktop and mobile viewer**

Viewer tests now cover the animation manifest and mobile control scrolling. Playwright desktop/mobile screenshots confirm the expanded controls render without clipping, and a browser canvas pixel check confirms the model still renders nonblank.

### Task 11: Animation Payload Structure Report

**Files:**
- Modify: `extracted/tools/animation_tools.js`
- Create: `extracted/tools/animation_structure_report.js`
- Create: `extracted/tools/export_animation_structure_report.js`
- Modify: `extracted/tests/animation_tools.test.js`
- Create: `extracted/tests/animation_structure_report.test.js`
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/tests/viewer_lighting.test.js`
- Generate: `extracted/reports/animation_structure_report.tsv`
- Generate: `extracted/reports/animation_structure_report.json`
- Generate: `extracted/reports/animation_structure_failures.tsv`
- Generate: `extracted/viewer/animation-structure-manifest.json`
- Generate: `extracted/reports/screenshots/viewer_animation_structure_desktop.png`

- [x] **Step 1: Correct descriptor table boundaries**

`nameTableValue` is now treated as the descriptor-table byte length. Track descriptor spans are bounded by `dataOffset + nameTableValue`, rather than accidentally treating the last track as owning the rest of the file.

- [x] **Step 2: Scan likely packed transform records**

The animation payload scanner identifies packed 12-float records with layout `quat4 + translation3 + flag + scale3 + extra`. This is a conservative structure hint, not full playback. Ringo `ability01` and Ringo `idle` now report 77 likely transform records each, including a 76-record contiguous track-order run.

- [x] **Step 3: Export full animation structure reports**

`export_animation_structure_report.js` processed all 5010 recovered `.anim` files with 0 failures and found 205920 likely transform records across the set. Reports are written to `animation_structure_report.tsv/json` and `animation-structure-manifest.json`.

- [x] **Step 4: Surface structure hints in the viewer**

The viewer now loads `animation-structure-manifest.json` and shows transform-record counts beside the selected animation. This confirms the dropdown is connected to decoded payload structure, while exact keyframe-to-bone playback remains the next reverse-engineering target.

### Task 12: Candidate Transform-To-Bone Mapping

**Files:**
- Modify: `extracted/tools/animation_tools.js`
- Create: `extracted/tools/animation_bone_mapping_report.js`
- Create: `extracted/tools/export_animation_bone_mapping_report.js`
- Modify: `extracted/tests/animation_tools.test.js`
- Create: `extracted/tests/animation_bone_mapping_report.test.js`
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/tests/viewer_lighting.test.js`
- Generate: `extracted/reports/animation_bone_mapping_report.tsv`
- Generate: `extracted/reports/animation_bone_mapping_report.json`
- Generate: `extracted/reports/animation_bone_mapping_failures.tsv`
- Generate: `extracted/viewer/animation-bone-mapping-manifest.json`
- Generate: `extracted/reports/screenshots/viewer_animation_bone_mapping_desktop.png`

- [x] **Step 1: Add packet-adjacent record metadata**

`scanLikelyTransformRecords` now records each transform's preceding byte, packet offset, and delta from the previous detected transform. Across samples, 48-byte and 96-byte deltas dominate, which supports the packed-record interpretation.

- [x] **Step 2: Map animation records to skeleton bones**

Correctly aligned 12-float transform records already store translation in skeleton-local `[X, Y, Z]` order. For skeleton-compatible animations where `trackCount === boneCount`, a contiguous 48-byte transform run maps directly by track order to bone indices.

- [x] **Step 3: Export compatible animation/skeleton mapping report**

`export_animation_bone_mapping_report.js` de-duplicates compatible `skin_animation_bindings.tsv` rows into 4857 unique animation/skeleton pairs. It processed all pairs with 0 failures and mapped 135945 of 203861 likely transform records to skeleton bones.

- [x] **Step 4: Surface mapped-bone counts in the viewer**

The viewer now loads `animation-bone-mapping-manifest.json` and shows mapped-bone counts beside the selected animation. For default Ringo `AchillesCut`, the status line reports `77 transform records`, `76/77 mapped bones`, `76 unique bones`, and 57 reliable pose bones after coverage-aware drift filtering.

### Task 13: Representative Animation Pose Preview

**Files:**
- Modify: `extracted/tools/animation_tools.js`
- Modify: `extracted/tools/animation_bone_mapping_report.js`
- Modify: `extracted/tests/animation_tools.test.js`
- Modify: `extracted/tests/animation_bone_mapping_report.test.js`
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/tests/viewer_lighting.test.js`
- Regenerate: `extracted/reports/animation_bone_mapping_report.tsv`
- Regenerate: `extracted/reports/animation_bone_mapping_report.json`
- Regenerate: `extracted/viewer/animation-bone-mapping-manifest.json`
- Generate: `extracted/reports/screenshots/viewer_animation_pose_preview_desktop.png`

- [x] **Step 1: Export reliable pose bones**

The mapping report now emits viewer-ready skeleton-space transform records only when the transform-to-bone match is unambiguous. This keeps ambiguous repeated local translations out of the live pose overlay while preserving the broader mapped-bone counts.

- [x] **Step 2: Apply pose bones to the skeleton overlay**

The viewer skeleton overlay now keeps real bone nodes, line pairs, and joint markers in sync. When the selected animation changes, the overlay resets to the bind pose, applies reliable pose bones from `animation-bone-mapping-manifest.json`, and recomputes the line and marker positions.

- [x] **Step 3: Verify Ringo pose preview**

Default Ringo `AchillesCut` now reports 57 reliable pose bones in addition to `77 transform records` and `76/77 mapped bones`. Switching to `Ability02_AltAttack` with Bones enabled keeps the 76-bone overlay visible and updates the selected animation stats.

- [x] **Step 4: Keep the boundary explicit**

This is a representative pose preview, not full curve playback. The next target is decoding the animation timing/index streams well enough to create real Three.js `AnimationClip` data, then exporting mesh joints/weights so the GLB mesh itself can animate.

### Task 14: Pose Loop Skeleton Preview

**Files:**
- Modify: `extracted/viewer/index.html`
- Modify: `extracted/viewer/styles.css`
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/tests/viewer_lighting.test.js`
- Modify: `extracted/tools/animation_tools.js`
- Modify: `extracted/tests/animation_tools.test.js`
- Generate: `extracted/reports/screenshots/viewer_pose_loop_frame1.png`
- Generate: `extracted/reports/screenshots/viewer_pose_loop_frame2.png`
- Generate: `extracted/reports/android_animation_string_xrefs.tsv`

- [x] **Step 1: Preserve 48-byte transform-record metadata**

`scanLikelyTransformRecords` now records a `recordByteLength` and the two extra float fields when a full 12-float transform record is available. This matches the observed 48-byte records and keeps the trailing fields available for later curve/pointer analysis.

- [x] **Step 2: Investigate native keyframe-adjacent strings**

Android arm64 xrefs were generated for animation-related strings. The `Incorrect keyframe parameters` branch led to a byte-array resampling routine rather than the skeletal `.anim` sampler, so that native branch is not currently used for curve decoding.

- [x] **Step 3: Add an explicit pose loop preview**

The viewer now has a `Pose Loop` toggle. With Bones enabled, it blends the skeleton overlay between bind pose and the selected animation's recovered rotation-only representative pose over the animation duration. This produces visible movement from decoded pose data without claiming full `.anim` curve playback.

- [x] **Step 4: Browser-verify movement**

Playwright captured two canvas frames with `Pose Loop` enabled. Their hashes differ, and the status line reports `pose preview loop`, confirming that the skeleton overlay changes over time.

### Task 15: Skinned GLB Mesh Pose Preview

**Files:**
- Modify: `extracted/tools/obj_to_glb.js`
- Modify: `extracted/tools/rsc0_mesh_to_obj.js`
- Modify: `extracted/tests/material_roles.test.js`
- Modify: `extracted/tests/rsc0_mesh_to_obj.test.js`
- Modify: `extracted/viewer/index.html`
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/tests/viewer_lighting.test.js`
- Generate: `extracted/hero_assets_glb_skinned_pbr/`
- Generate: `extracted/viewer/skinned-glb-pbr-manifest.json`
- Generate: `extracted/reports/screenshots/viewer_skinned_bind_pose_loop_reset.png`
- Generate: `extracted/reports/screenshots/viewer_skinned_pose_loop_track_order_filtered_plain_idle_frame1.png`
- Generate: `extracted/reports/screenshots/viewer_skinned_pose_loop_track_order_filtered_plain_idle_frame2.png`
- Generate: `extracted/reports/screenshots/viewer_skinned_pose_loop_track_order_idle_frame1.png`
- Generate: `extracted/reports/screenshots/viewer_skinned_pose_loop_track_order_idle_frame2.png`
- Generate: `extracted/reports/screenshots/viewer_skinned_pose_loop_track_order_idle_bones_frame1.png`
- Generate: `extracted/reports/screenshots/viewer_skinned_pose_loop_track_order_idle_bones_frame2.png`
- Generate: `extracted/reports/screenshots/viewer_skinned_pose_loop_rotation_guard_idle_framed.png`
- Generate: `extracted/reports/screenshots/viewer_skinned_pose_loop_rotation_guard_ability01_framed.png`

- [x] **Step 1: Export glTF skin data**

`createGlb` now writes `JOINTS_0`, `WEIGHTS_0`, `skins`, skeleton nodes, and inverse bind matrices. `readMeshForGlb` reads the original RSC0 `.mesh` vertex buffer directly so positions, UVs, normals, joints, and weights stay aligned.

- [x] **Step 2: Batch-generate skinned PBR GLBs**

`obj_to_glb.js --batch-skinned` uses the skin-aware PBR manifest, original `.mesh` files, original `.skeleton` files, and material texture roles to generate `hero_assets_glb_skinned_pbr/`. It converted 391 viewer entries backed by 339 unique GLB files, skipped 135 missing mesh/skeleton rows, and produced 0 failures.

- [x] **Step 3: Add viewer format and mesh pose drive**

The viewer now exposes `Skinned GLB` in the Format selector and loads `skinned-glb-pbr-manifest.json`. `Pose Loop` resets to bind pose when disabled and previews recovered rotation-only pose data when enabled. Bind translations/scales are preserved because the full transform-record timing/index streams are not fully decoded.

- [x] **Step 4: Remap local mesh joint palettes**

RSC0 mesh joint bytes are local per-draw palette indices, not global skeleton bone indices. `readMeshForGlb` now recovers the draw-range joint palettes, expands vertices per draw range, and writes GLB `JOINTS_0` after palette remapping. Ringo now remaps beyond joint 31, with the default mesh reaching skeleton joint 70.

- [x] **Step 5: Drive mesh from track-order pose data**

Correcting the transform-record layout and applying track-order mapping gives Ringo Idle 76 matched transform records. Drift filtering marks attachment/special tracks with large bind-translation mismatches, unsafe scale, or high-rotation leaf/helper drift as ambiguous. The coverage-aware guard leaves Ringo Idle with 59 reliable pose bones and Ringo `ability01` with 57 for the 76-bone skeleton. The viewer now drives `SkinnedMesh` models when recovered pose coverage reaches the safety threshold, while sparse or drift-marked pose recoveries remain in bind pose.

- [x] **Step 6: Browser-verify mesh and skeleton motion**

Chrome DevTools Protocol captured filtered `Skinned GLB` screenshots with `Pose Loop` enabled and Bones disabled for Ringo Idle, `ability01`, and `Ability02_Idle`. The rotation guard screenshots show the model still moves while high-risk hand/attachment/helper tracks stay in bind pose instead of stretching the mesh into spikes. Earlier Bones-enabled hashes also differ, confirming that the skeleton diagnostic changes with the model.
