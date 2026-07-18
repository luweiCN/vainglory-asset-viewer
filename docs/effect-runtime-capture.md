# Effect Runtime Capture Targets

These capture targets are diagnostics for unresolved native effect-channel, selector, and ambiguous resource-candidate mapping. They must not be used as render permission by themselves.

Material sampler diagnostics now distinguish missing external texture paths from runtime-resolved inline/scene samplers. Do not request an effect/channel capture solely because an inline TCH0 lookup or built-in scene texture lacks a texture-file path; captures are still needed for unresolved source/program ownership, effect-channel mapping, PFX lifecycle, callback output, and runtime light/probe values.

Runtime light/probe capture is stricter than the profile selector capture. A closed selector sequence must include the active profile evidence, the same-sequence sample position, and the six sampled `Probe.Samples` vec4 outputs from the lightfield sampler leave event before it is ready for manual light/probe review. Profile-only or position-only captures are diagnostics, not renderer permission.

Local rebuild entry points:

```bash
npm run effect:capture:targets --silent
npm run effect:capture:summary --silent
npm run effect:capture:refresh --silent
```

`effect:capture:refresh` regenerates PFX native callback targets/summary, effect native channel targets/summary, layout B `object+0xac` runtime capture targets/summary, and the `object+0xac` producer gate. With no imported live JSONL files, the expected state is still `capture-missing`; this is a blocker report, not render permission.

## Native Effect Channel / Selector Targets

- Target list: `extracted/reports/effect_native_channel_capture_targets.json`
- Viewer mirror: `extracted/viewer/effect-native-channel-capture-targets.json`
- Frida script: `extracted/reports/frida_capture_effect_native_channel_targets.js`

Current generated scope:

- 90 candidate gap rows.
- 40 hookable iOS contexts.
- 34 iOS function hook targets.
- Covered reasons: `native-effect-channel-resource-unresolved`, `selector-output-paired-resource-missing`, `kindred-slot-candidate-unresolved`, `global-resource-candidate-unresolved`, and `weak-resource-candidate`.

Run the generated Frida script against a running iOS `GameKindred` process when exercising the relevant skill/action:

```bash
frida -H <device-or-host> -n GameKindred \
  -l extracted/reports/frida_capture_effect_native_channel_targets.js \
  | tee extracted/reports/effect_native_channel_capture.jsonl
```

The script records bounded enter/leave samples, the source effect tokens, selector output roles, raw arguments, return value, 16/64-byte before/after pointer-memory prefixes, and short UTF-8 string previews when an argument points at readable string data.

Summarize the capture before attempting any resource/channel mapping:

```bash
node extracted/tools/effect_native_channel_capture_summary.js \
  --input extracted/reports/effect_native_channel_capture.jsonl
```

The summary writes:

- `extracted/reports/effect_native_channel_capture_summary.json`
- `extracted/reports/effect_native_channel_capture_summary.tsv`
- `extracted/viewer/effect-native-channel-capture-summary.json`

`readyForFullMappingReview` only becomes true when every generated hook target has complete enter/leave coverage, a same-sample argument snapshot, and a return value. Partial captures can still be useful for manual reverse engineering, but they must not promote effect rendering by themselves. A capture that only proves enter/leave coverage now stops at `argument-snapshots-missing` or `return-values-missing` until the raw runtime values needed for resource/channel mapping are present. The viewer also keeps generic effect-channel fallback PFX hidden until this full mapping gate is true; classified native primitives are handled separately and do not grant PFX resource/channel ownership.

## Static Resource Audit

Before importing live capture data, the local static evidence can be summarized with:

```bash
node extracted/tools/effect_channel_static_resource_audit.js
```

The audit writes:

- `extracted/reports/effect_channel_static_resource_audit.json`
- `extracted/reports/effect_channel_static_resource_audit.tsv`
- `extracted/viewer/effect-channel-static-resource-audit.json`

This report cross-checks unresolved effect-channel/selector rows against recovered PFX tokens, hook resources, Kindred effect resource slots, and CFF0 effect-token graphs. It is diagnostic-only. A unique or repeated static candidate still does not prove which resource object the original runtime selected for that callsite.

Rows classified as `selector-output-pair-only-no-resource` are especially strict: the decompiled selector writes paired projectile/impact effect tokens into the output array, but no PFX resource path or resource object is present at that callsite.

Rows classified as `native-vcall-token-only-no-resource`, `native-spawn-token-only-no-resource`, or `selector-output-token-only-no-resource` are also strict. The recovered native path only supplies an effect token through a vcall, spawn helper, or selector output; it does not carry a concrete resource path. These rows require deeper original-code ownership recovery or live capture before any viewer rendering can use them.

The token-only builder path also has a deeper static resource owner in `KindredEffects.def`. Rebuild that hash table with:

```bash
node extracted/tools/kindred_effect_hash_slots.js
```

The export writes:

- `extracted/reports/kindred_effect_hash_slots.json`
- `extracted/reports/kindred_effect_hash_slots.tsv`
- `extracted/viewer/kindred-effect-hash-slots.json`

This parser reads the decoded CFF0 instance payload and records the runtime effect hash stored immediately before each patched PFX pointer. It covers both current definition layouts: format 4 uses a 32-bit pointer field, and format 5 uses a 64-bit pointer field.

The token-only callsite shape can be rebuilt with:

```bash
node extracted/tools/native_effect_token_only_callsite_audit.js
```

The audit writes:

- `extracted/reports/native_effect_token_only_callsite_audit.json`
- `extracted/reports/native_effect_token_only_callsite_audit.tsv`
- `extracted/viewer/native-effect-token-only-callsite-audit.json`

Current local evidence finds all 33 token-only source functions and 0 resource literals at those callsites. The split is 20 effect hook builder rows, 8 selector-output rows, and 5 spawn-helper rows. This confirms the next original-runtime target is the created runtime effect object/resource-channel owner or live capture, not a static filename match.

After the Kindred hash-slot report is present, the token-only audit computes the original token hash and joins it against `KindredEffects.def`. Current local evidence resolves 27/33 token-only rows to concrete PFX resources; the remaining 6 rows are three duplicated `HeroPLU` token aliases that still need alias/substitution recovery.

This is still diagnostic-only. A hash-backed PFX path proves resource ownership, but rendering still requires lifecycle, channel mapping, PFX callback/runtime overlay data, and the original effect renderer behavior.

For the remaining hash misses, rebuild the non-PFX owner audit with:

```bash
node extracted/tools/native_effect_hash_missing_owner_audit.js
```

The audit writes:

- `extracted/reports/native_effect_hash_missing_owner_audit.json`
- `extracted/reports/native_effect_hash_missing_owner_audit.tsv`
- `extracted/viewer/native-effect-hash-missing-owner-audit.json`

Current local evidence splits the six hash misses into two classes. `Effect_HeroPLU_SmokeCloudSput` on Android/iOS is backed by the spawned definition `Characters/HeroPLU/HeroPLUSmokeCloud.def`, which owns the `Hero010Goop` mesh/skeleton and `Spawn` animation. `Effect_HeroPLU_OVERHEATING` and `Effect_HeroPLU_SmokeCloud` remain state/BUFF-owner unresolved.

This audit prevents a false PFX-missing conclusion. A spawned definition owner still requires its own renderer/lifecycle path before it can be promoted into the viewer.

For the hash-backed PFX rows, rebuild the runtime gate with:

```bash
node extracted/tools/kindred_hash_pfx_runtime_gate_audit.js
```

The audit writes:

- `extracted/reports/kindred_hash_pfx_runtime_gate_audit.json`
- `extracted/reports/kindred_hash_pfx_runtime_gate_audit.tsv`
- `extracted/viewer/kindred-hash-pfx-runtime-gate-audit.json`

This gate checks whether each hash-backed row has a PFX manifest entry and whether the original create bridge is already recovered. Current local evidence has 27 PFX rows, 14 builder create-chain rows, 13 unresolved selector/spawn create-chain rows, and 0 render promotion rows. A positive PFX path here is still resource ownership only.

To trace the builder create rows into the original component/object/render-queue boundary, rebuild:

```bash
node extracted/tools/kindred_effect_component_runtime_chain_audit.js
```

The audit writes:

- `extracted/reports/kindred_effect_component_runtime_chain_audit.json`
- `extracted/reports/kindred_effect_component_runtime_chain_audit.tsv`
- `extracted/viewer/kindred-effect-component-runtime-chain-audit.json`

Current local evidence closes the component object path on both Android and iOS: hash/string create, PFX factory create, parameter update, transform sync, object payload `+0x40`, render queue submit, queue dispatch wrapper, and lifecycle wrappers are all found. This is still diagnostic-only. The render queue vtable target, draw policy, selector/spawn create chain, runtime overlays, callbacks, and channel mapping must be recovered before effect preview promotion.

To compare that cross-build component shape with the current Android particle/scene-entry chain, rebuild:

```bash
node extracted/tools/kindred_current_particle_bridge_audit.js
```

The audit writes:

- `extracted/reports/kindred_current_particle_bridge_audit.json`
- `extracted/reports/kindred_current_particle_bridge_audit.tsv`
- `extracted/viewer/kindred-current-particle-bridge-audit.json`

Current local evidence aligns original Kindred component fields with current layout B / particle-manager fields, including `0x118`, `+0x50`, `+0x10c/+0x110`, `+0xf8..+0x108`, `+0x58`, `+0x30`, and `+0xb0`. It also records the current entry `+0x40` helper dispatch and render-owner builder link.

This remains diagnostic-only. The two current blockers are the missing exact layout B `+0xac` producer for particle mask `0x200` and the unresolved concrete PFX/emitter manager-entry owner.

To classify every current Android layout B `0x118` type-index owner/create/query path, rebuild:

```bash
node extracted/tools/current_native_layout_b_type_owner_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_type_owner_audit.json`
- `extracted/reports/current_native_layout_b_type_owner_audit.tsv`
- `extracted/viewer/current-native-layout-b-type-owner-audit.json`

Current local evidence finds all 12 `.text` reads of the layout B type-index global `0x2d44ea8`. Five reads feed `0x188b8b8` create/resolve helpers, six feed `0x188e2ac` query/allocate helpers, and one uses `0x188b830` as a stack query with `w2=0x100` and the type index in `w3` before calling layout B parameter reader `0x8d4f5c`.

This closes the type owner entry-point scan, but it is still diagnostic-only. It does not prove the `object+0xac` producer for particle mask `0x200`, the concrete PFX/emitter owner behind manager record `+0x8`, or the lifecycle/timeline condition that makes a queried object visible.

To classify the current Android layout B manager-entry owner shape, rebuild:

```bash
node extracted/tools/current_native_layout_b_entry_owner_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_entry_owner_audit.json`
- `extracted/reports/current_native_layout_b_entry_owner_audit.tsv`
- `extracted/viewer/current-native-layout-b-entry-owner-audit.json`

Current local evidence shows that layout B does not store a PFX/emitter pointer into `object+0x30`. Instead, `object+0x30` is an inline scene/entity entry subobject. The constructor stores the entry owner pointer at `object+0x38` / entry `+0x8`; that owner is returned by `0xe3cdfc`, which reads global owner slot `0x311a298`. The register path passes `x3 = object+0x30` into `0x188eee0`, so manager record `+0x8` receives the inline entry subobject.

This closes the immediate manager-entry shape but remains diagnostic-only. It proves render-owner infrastructure, not a concrete PFX/emitter instance or particle visibility.

To bound global same-offset false positives for current Android `object+0xac`, rebuild:

```bash
node extracted/tools/current_native_object_ac_width_overlap_audit.js
```

The audit writes:

- `extracted/reports/current_native_object_ac_width_overlap_audit.json`
- `extracted/reports/current_native_object_ac_width_overlap_audit.tsv`
- `extracted/viewer/current-native-object-ac-width-overlap-audit.json`

Current local evidence finds 425 store instructions whose encoded offset window overlaps `+0xac`: 64 exact `str-w +0xac` rows and 361 byte/halfword/64-bit width-overlap rows. Only one row is inside the recovered layout B family, the constructor seed at `0x8d2dbc`; there are 0 layout B non-constructor overlap rows and 0 render-promotion rows.

This is deliberately diagnostic-only. The 424 out-of-family rows are mostly unrelated object layouts or unproven owners; 159 nonzero wide/narrow rows still need owner/dataflow proof before any of them can be considered a layout B producer.

To trace direct-call ownership for those 159 out-of-family nonzero width-overlap rows, rebuild:

```bash
node extracted/tools/current_native_object_ac_owner_trace_audit.js
```

The audit writes:

- `extracted/reports/current_native_object_ac_owner_trace_audit.json`
- `extracted/reports/current_native_object_ac_owner_trace_audit.tsv`
- `extracted/viewer/current-native-object-ac-owner-trace-audit.json`

Current local evidence finds 140 rows with a nearby direct-branch target and 0 rows with direct callers from the recovered layout B family. One notable row is `0xd7f7e8`: its nearest direct-branch target is `0xd7f7b8`, a render-owner/helper initializer reached by four nearby `0x8d27xx` setup callers, but those callers are outside the recovered layout B object family and the helper writes a helper return at its own `+0xa8`.

This report is also diagnostic-only. Direct-call absence does not prove there is no indirect callback path, but it rules out the easy direct-call route for these 159 same-offset candidates.

To check direct branch exits from the recovered layout B slot callbacks and refresh/register body, rebuild:

```bash
node extracted/tools/current_native_layout_b_callback_boundary_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_callback_boundary_audit.json`
- `extracted/reports/current_native_layout_b_callback_boundary_audit.tsv`
- `extracted/viewer/current-native-layout-b-callback-boundary-audit.json`

Current local evidence finds 11 direct exits across slot0/slot1/slot4, the register body, and the refresh gate. These exits reach known local/manager boundaries (`0x8d398c`, `0x188e7e0`, `0x188ef88`, `0x188b81c`, `0x8d3a80`, `0x8d3c24`, `0x188eee0`, `0x8d50b0`, `0x188f020`) and 0 exits target the out-of-family `object+0xac` owner-trace candidates.

This closes only the direct branch route from recovered layout B callbacks. Indirect slot dispatch still requires separate evidence.

To recover the runtime-installed layout B slot route, rebuild:

```bash
node extracted/tools/current_native_layout_b_indirect_slot_audit.js
```

## StaticMesh ShaderParams Capture Targets

The current-package `LevelVisuals -> StaticMesh -> ShaderParams` route has a separate diagnostic capture generator:

```bash
npm run native:staticmesh-shaderparams:refresh --silent
```

It writes:

- `extracted/reports/current_native_static_mesh_shaderparams_capture_targets.json`
- `extracted/reports/current_native_static_mesh_shaderparams_capture_targets.tsv`
- `extracted/viewer/current-native-static-mesh-shaderparams-capture-targets.json`
- `extracted/reports/current_native_static_mesh_shaderparams_capture_summary.json`
- `extracted/reports/current_native_static_mesh_shaderparams_capture_summary.tsv`
- `extracted/viewer/current-native-static-mesh-shaderparams-capture-summary.json`
- `extracted/reports/frida_capture_current_static_mesh_shaderparams.js`

The generated Frida script hooks the current Android `LevelVisuals` apply processor, the three `StaticMesh**` route callsites, and the proven `StaticMesh` field reads for `+0x30`, `+0x68`, and `+0x40`.

Run it only as live diagnostic capture:

```bash
frida -H <device-or-host> -n GameKindred \
  -l extracted/reports/frida_capture_current_static_mesh_shaderparams.js \
  | tee extracted/reports/static_mesh_shaderparams_capture.jsonl
```

Re-run `npm run native:staticmesh-shaderparams:refresh --silent` after importing the JSONL. This capture does not permit renderer takeover. It only records bounded runtime prefixes so the active resource choice, `ShaderParam` value meanings, and shader/texture formula can be decoded from original runtime data instead of guessed. With no JSONL present, the summary remains `captureStatus=capture-missing`.

The audit writes:

- `extracted/reports/current_native_layout_b_indirect_slot_audit.json`
- `extracted/reports/current_native_layout_b_indirect_slot_audit.tsv`
- `extracted/viewer/current-native-layout-b-indirect-slot-audit.json`

Current local evidence proves 4 layout B callback registrations. Three primary callbacks (`0x8d310c`, `0x8d311c`, `0x8d3140`) are materialized by ADRP+ADD and installed through shared slot installer `0x188c2f4`; the slot-4 tail callback (`0x8d319c`) is installed through `0x188c328`. The shared dispatcher path is opcode-bounded too: primary/tail slot loads, active-record `blr x11`, and tail `br x3` all match the current Android binary. The frame dispatcher has 5 slot dispatch rows and includes one layout B-relevant slot-4 dispatch.

Static data-pointer scanning finds 0 rows for those layout B callback addresses, so `.data.rel.ro`/vtable pointer scans alone cannot recover this route. This remains diagnostic-only: it closes the slot install/dispatch mechanics, not the concrete active object identity, the `object+0xac` `0x200` producer, or the PFX/emitter owner behind `object+0x30`.

To connect the slot-dispatched layout B object to the scene/entity record pool, rebuild:

```bash
node extracted/tools/current_native_layout_b_slot_record_bridge_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_slot_record_bridge_audit.json`
- `extracted/reports/current_native_layout_b_slot_record_bridge_audit.tsv`
- `extracted/viewer/current-native-layout-b-slot-record-bridge-audit.json`

Current local evidence separates the two runtime managers involved in this path. Frame slot dispatch uses module/type slot manager global `0x311a958`; layout B register/refresh uses scene/entity manager global `0x311a960`. The shared slot dispatcher materializes an active object pointer from the slot manager, passes it as `x0` into the selected slot callback, and layout B register then stores `x0+0x30` into the scene/entity manager record pool through `0x188eee0`.

This closes the slot-manager-to-scene-record bridge (`slot4ToSceneRecordBridgeRecovered=true`) with 26 exact opcode rows and 0 mismatches. It remains diagnostic-only: the concrete PFX/emitter owner behind `x0+0x30`, the lifecycle/timeline activator, and the `object+0xac` `0x200` producer are still unresolved.

To connect the layout B callback object to its parameter target and final payload pointer, rebuild:

```bash
node extracted/tools/current_native_layout_b_target_payload_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_target_payload_audit.json`
- `extracted/reports/current_native_layout_b_target_payload_audit.tsv`
- `extracted/viewer/current-native-layout-b-target-payload-audit.json`

Current local evidence proves 6 direct layout B parameter update sites and 2 dynamic helper sites load callback `object+0x50` before entering writer `0xe39830`. That writer walks the target object's `+0x80` parameter list and tails into typed writer `0xe3ec44`.

The final layout B dispatch loads the same `object+0x50` target, calls `0xe3a510`, and `0xe3a510` returns `target+0x40`. This closes the target-payload bridge with 17 exact opcode rows and 0 mismatches. It remains diagnostic-only: the creator/lifecycle of `object+0x50`, the concrete PFX/emitter owner represented by `target+0x40`, and the `object+0xac` `0x200` producer are still unresolved.

To connect `object+0x50` to the current-package target factory, rebuild:

```bash
node extracted/tools/current_native_layout_b_pfx_target_factory_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_pfx_target_factory_audit.json`
- `extracted/reports/current_native_layout_b_pfx_target_factory_audit.tsv`
- `extracted/viewer/current-native-layout-b-pfx-target-factory-audit.json`

Current local evidence proves that layout B initializes six target parameter ids (`Ally_Enemy`, `Color`, `Radius`, `Alpha`, `SizeXY`, and `Duration`) from `object+0x50`. Both the name route and id/hash route resolve through `*KindredEffects*`, call target factory `0x8d4378`, and store the returned target into `object+0x50`.

The factory `0x8d4378` decodes resource strings, obtains owner slot A through `0xe3ce08` / global `0x311a290`, and calls `0xe3b5e8` to build or fetch the target. The audit also separates target-local `+0x64` status bits from layout B `object+0xac`: `0xe3cde4` ORs target `+0x64` with `0x200`, but this is not the particle draw mask field tested on backing record flags. This remains diagnostic-only until the concrete draw/queue path from `target+0x40` is recovered.

To classify the current Android layout B `+0xac` producer candidates, rebuild:

```bash
node extracted/tools/current_native_layout_b_flag_producer_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_flag_producer_audit.json`
- `extracted/reports/current_native_layout_b_flag_producer_audit.tsv`
- `extracted/viewer/current-native-layout-b-flag-producer-audit.json`

Current local evidence classifies all 64 current-package `+0xac` stores. It separates stack false positives, non-particle bit mutations, zero resets, unrelated config writes, two packed bit7..14 `0x200` candidates that are not tied to layout B, eight `Effect_*` resource-neighborhood scalar constants that are not layout B flags, and three active-child selector state writes.

The same report now scans width-overlap writes in the recovered layout B function family `0x8d2d00..0x8d5100`. The only `strb/strh/strw/strx` write that overlaps `object+0xac` is the constructor seed at `0x8d2dbc`, so `layoutBFamilyFlagOverlapWriteRows=1`, `layoutBFamilyFlagOverlapNonConstructorRows=0`, and `layoutBFamilyWideParticleMaskProducerRows=0`.

This remains diagnostic-only. The report still has `exactLayoutBParticleFlagProducerRows=0`, so it narrows the next owner trace but does not authorize particle/effect rendering.

To disqualify the two remaining broad `object+0xac` bit7..14 candidates, rebuild:

```bash
node extracted/tools/current_native_layout_b_object_ac_candidate_disqualification_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_object_ac_candidate_disqualification_audit.json`
- `extracted/reports/current_native_layout_b_object_ac_candidate_disqualification_audit.tsv`
- `extracted/viewer/current-native-layout-b-object-ac-candidate-disqualification-audit.json`

Current local evidence has 22 exact opcode rows, 3 vtable pointer rows, 6 direct caller rows, 0 opcode mismatches, and 0 pointer mismatches. It disqualifies both broad `0x200`-looking candidates from the layout B producer search: `0x8cb3c0` is tied to the `0x210` LevelVisuals static lens-flare family, while `0x8cffb4` is tied to `HUD_Minimap` current-owner attach.

This remains diagnostic-only. It proves two false positives are not the `0x118` layout B particle draw producer; it does not find the exact producer. Keep `exactLayoutBParticleFlagProducerRows=0` and `renderPromotionAllowedRows=0` until an actual layout B owner/write chain is recovered.

To close the missed-store-encoding hypothesis for layout B `object+0xac`, rebuild:

```bash
node extracted/tools/current_native_layout_b_object_ac_store_coverage_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_object_ac_store_coverage_audit.json`
- `extracted/reports/current_native_layout_b_object_ac_store_coverage_audit.tsv`
- `extracted/viewer/current-native-layout-b-object-ac-store-coverage-audit.json`

Current local evidence has 410 store rows covering unsigned, unscaled, store-pair, and SIMD store forms across `0x8d2d00..0x8d5100`. Only 4 rows overlap `object+0xac`: the known constructor seed at `0x8d2dbc` and three stack temporaries. There are 0 hidden non-constructor object `+0xac` producers and 0 render-promotion rows.

This is diagnostic-only. It rules out a hidden local immediate-store producer inside the recovered layout B family; the remaining trace must follow indirect callbacks, table-dispatched owners, runtime lifecycle state, or captured original runtime writes.

To generate the non-mutating runtime capture targets for that remaining layout B `object+0xac` gap, rebuild:

```bash
node extracted/tools/current_native_layout_b_object_ac_runtime_capture_targets.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_object_ac_runtime_capture_targets.json`
- `extracted/reports/current_native_layout_b_object_ac_runtime_capture_targets.tsv`
- `extracted/viewer/current-native-layout-b-object-ac-runtime-capture-targets.json`
- `extracted/reports/frida_capture_layout_b_object_ac_runtime_targets.js`

Current local evidence has 10 hook targets, 9 opcode rows, 0 opcode mismatches, 1 runtime-capture-required gap, and 0 render-promotion rows. The generated Frida script hooks slot0 registration, layout B manager add-record, backing flag stores, visibility refresh, final payload-only refresh, and the particle entry-array builder.

Run the generated Frida script only against the original runtime when exercising effect-heavy hero actions:

```bash
frida -H <device-or-host> -n GameKindred \
  -l extracted/reports/frida_capture_layout_b_object_ac_runtime_targets.js \
  | tee extracted/reports/layout_b_object_ac_runtime_capture.jsonl
```

The script records registers, `object+0xac`, nearby layout B state fields, backing record flag writes, and draw masks. It does not write memory, patch code, or grant viewer render permission by itself. A later capture summary must prove the live value sequence before any renderer behavior changes.

Summarize the capture before using it as evidence:

```bash
node extracted/tools/current_native_layout_b_object_ac_runtime_capture_summary.js \
  --input extracted/reports/layout_b_object_ac_runtime_capture.jsonl
```

The summary writes:

- `extracted/reports/current_native_layout_b_object_ac_runtime_capture_summary.json`
- `extracted/reports/current_native_layout_b_object_ac_runtime_capture_summary.tsv`
- `extracted/viewer/current-native-layout-b-object-ac-runtime-capture-summary.json`

The summary intentionally distinguishes draw-mask observations from live producer evidence. A particle entry-array event with mask `0x200` only proves the draw filter ran. Manual producer review requires a live `object+0xac`, manager add-record flag, backing flag-store, or refreshed flag value carrying bit `0x200` in the same capture. `renderPromotionAllowedRows` stays `0` until a later renderer rule is separately recovered from the original runtime.

To classify the current Android layout B visibility/state gate that decides whether refresh forwards `object+0xac` or zeroes backing flags, rebuild:

```bash
node extracted/tools/current_native_layout_b_visibility_gate_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_visibility_gate_audit.json`
- `extracted/reports/current_native_layout_b_visibility_gate_audit.tsv`
- `extracted/viewer/current-native-layout-b-visibility-gate-audit.json`

Current local evidence has 21 exact opcode rows and 0 mismatches. It proves constructor default state byte setup, packed `+0x10c` parameter rows, `+0x110` state-bit writers, and the manager refresh gate at `0x8d5048..0x8d50c4`. The gate can either pass `object+0xac` at `0x8d5094` or zero the stack flag slot at `0x8d50ac` before calling `0x188f020`.

This is still diagnostic-only. It explains suppression/visibility behavior for the backing record, but it does not prove where `object+0xac` receives bit `0x200`.

To keep target-local lifecycle/status bits separate from backing draw flags, rebuild:

```bash
node extracted/tools/current_native_layout_b_target_status_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_target_status_audit.json`
- `extracted/reports/current_native_layout_b_target_status_audit.tsv`
- `extracted/viewer/current-native-layout-b-target-status-audit.json`

Current local evidence has 18 exact opcode rows and 0 mismatches. It proves target `+0x64` low-state helpers, target-local `+0x64` bit `0x200`, layout B target-status gates, object `+0x110` to target `+0x64` bit-11 mirroring, and target low-state predicates.

This is diagnostic-only. Target `+0x64` status bits are not layout B `object+0xac` draw flags, and they must not be promoted into the backing-record `+0x18 & 0x200` particle filter without the missing `object+0xac` producer evidence.

To rebuild the current Android particle registration/source chain, including the separated layout A explicit-refresh entry, run:

```bash
node extracted/tools/current_native_particle_registration_chain_audit.js
```

The audit writes:

- `extracted/reports/current_native_particle_registration_chain_audit.json`
- `extracted/reports/current_native_particle_registration_chain_audit.tsv`
- `extracted/reports/current_native_particle_registration_chain_audit.layout_a_explicit_refresh_callsites.tsv`
- `extracted/reports/current_native_particle_registration_chain_audit.layout_a_refresh_callsites.tsv`
- `extracted/reports/current_native_particle_registration_chain_audit.layout_a_refresh_type_globals.tsv`
- `extracted/viewer/current-native-particle-registration-chain-audit.json`

Current local evidence separates the true explicit refresh entry `0xd7ffdc` from its internal body at `0xd80000`. The only direct caller is `0x8abf54`; it passes `w1=0x5` on the normal branch and `w1=0x1` on the fallback branch. This path is explained, but it is negative evidence for the particle mask `0x200` and remains diagnostic-only.

To scan all current Android layout A owner/type global reads rather than the older hand-listed subset, rebuild:

```bash
node extracted/tools/current_native_layout_a_owner_global_usage_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_a_owner_global_usage_audit.json`
- `extracted/reports/current_native_layout_a_owner_global_usage_audit.tsv`
- `extracted/viewer/current-native-layout-a-owner-global-usage-audit.json`

Current local evidence finds 12 `.text` reads across the five recovered layout A owner/type globals. Nine reads feed `0x188b8b8` create/resolve paths, three reads are owner `+0x18` list type comparisons, and zero rows allow renderer promotion. The two reads missing from the older hand list are `0x914ea0` and `0x916fc0`, both reading `0x30369a8`; both are owner-list comparisons, not particle flag producers.

This remains diagnostic-only. It closes a read-site coverage gap for layout A owner paths, but it still does not name the resource/action semantics behind those owner objects or prove the keep-vs-clear refresh state source.

To isolate the current Android layout A state sources that select keep versus clear refresh, rebuild:

```bash
node extracted/tools/current_native_layout_a_refresh_state_source_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_a_refresh_state_source_audit.json`
- `extracted/reports/current_native_layout_a_refresh_state_source_audit.tsv`
- `extracted/viewer/current-native-layout-a-refresh-state-source-audit.json`

Current local evidence has 30 exact opcode rows and 0 mismatches. It proves three state predicate groups. `0x8b8420` reads a caller-provided state byte and has three direct callers, two of which pass owner/state `+0x2fc`. `0x8af3bc` derives a local keep/clear byte from caller flags and owner packed fields. `0x8dacdc..0x8dad1c` keeps only when object bytes `+0x59` and `+0x58` are both present. The report tracks three keep calls, three clear calls, and zero render-promotion rows.

This remains diagnostic-only. It explains the immediate refresh state source, but it still does not name the higher-level resource/action that toggles those bytes or prove that the refreshed child later enters the particle draw manager.

To bound the current Android layout A state-byte writers, rebuild:

```bash
node extracted/tools/current_native_layout_a_state_writer_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_a_state_writer_audit.json`
- `extracted/reports/current_native_layout_a_state_writer_audit.tsv`
- `extracted/viewer/current-native-layout-a-state-writer-audit.json`

Current local evidence scans all direct unsigned-immediate accesses to `+0x2fc` in `.text`: 24 accesses, 4 stores, and 4 known writers. One reset path clears a halfword at `0xb3949c`; dispatcher `0xc81338` is called once from `0xc80cac` and selects three byte writer variants that store at `0xc5f37c`, `0xc5f470`, and `0xc5f55c`. The same report tracks object-byte state writers for `+0x58` and `+0x59`, plus shared update entry `0x8dacd0` with 4 direct/tail callers.

This remains diagnostic-only. It bounds state provenance one layer upstream, but still does not name the resource/action semantics or prove that any updated layout A child enters the particle/emitter manager.

To recover how the current Android layout A state callback is registered, rebuild:

```bash
node extracted/tools/current_native_layout_a_state_registration_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_a_state_registration_audit.json`
- `extracted/reports/current_native_layout_a_state_registration_audit.tsv`
- `extracted/viewer/current-native-layout-a-state-registration-audit.json`

Current local evidence has 39 exact opcode rows and 0 mismatches. The module registration hub calls `0xc80900` once. That function materializes four callback pointers (`0xc809d0`, `0xc80ae4`, `0xc80b6c`, `0xc80c9c`) with ADRP+ADD and installs them through three shared `0x188c2f4` slot-installer branches. The alternate final callback `0xc80c9c` calls the `+0x2fc` dispatcher at `0xc80cac`.

The same function assigns type literal `0xc8`, stores the current type index to global `0x3034b10`, and stores local type-record callbacks `0xc8191c/0xc81968`. The global has 26 current `.text` read sites. One read at `0xc5a034` feeds shared create/resolve helper `0x188b8b8`, one read at `0xc80f2c` is in the current state-callback neighborhood, and the rest are type-index lookup/comparison evidence.

The `0xc80ef0` neighborhood is now bounded by exact current opcodes: it calls `0xca2aac` with type literal `0xc8`, iterates returned entries, compares linked child type descriptor `+0xa4` against global `0x3034b10`, and writes six local state bytes. The same audit scans 27 direct branch/call rows in the state-registration family and finds 0 direct calls to the known particle queue, composite task, entry-array builder, manager add-record, or manager refresh boundaries.

This remains diagnostic-only. It explains why direct caller scans do not find ordinary `BL` callers for the registered callbacks and shows this neighborhood is state propagation, not renderer submission. It still does not name the installed slot/action semantics or prove any particle draw submission.

To isolate the separate current Android `0x210` candidate owner chain, rebuild:

```bash
node extracted/tools/current_native_particle_mask_candidate_owner_audit.js
```

The audit writes:

- `extracted/reports/current_native_particle_mask_candidate_owner_audit.json`
- `extracted/reports/current_native_particle_mask_candidate_owner_audit.tsv`
- `extracted/viewer/current-native-particle-mask-candidate-owner-audit.json`

Current local evidence has 33 rows, 30 opcode rows, 3 pointer rows, and 0 mismatches. It proves `0x8cb0a8` registers type literal `0x210`, global `0x3035098` stores that type index, `0x8cc3f4` iterates owner `+0x58`, and the owner path resolves/creates a `0x210` object through `0x188b8b8`. It also proves `0x8cb108` only patches bit 2 while `0x8cb1ec` writes packed bits `7..14`; those packed writes can include bit `0x200`, but they are tied to the separate `0x210` type, not the `0x118` layout B registration object.

The same report also checks the local render boundary. Global `0x3035098` has exactly one current `.text` read at `0x8cc414`; `0x8cc3f4` has 0 direct callers; `0x8cb418` is installed as a local render/update callback and calls local primitive builder `0x8cb7fc`. The `0x210` family has 28 internal direct branch/call rows but 0 direct calls to the known particle render queue, composite task, entry-array builder, manager add-record, or manager refresh targets.

This remains diagnostic-only. The report has `tiedToLayoutBRows=0`, `exactLayoutBParticleFlagProducerRows=0`, `type210FamilyDirectRenderBoundaryCallRows=0`, and `renderPromotionAllowedRows=0`, so it narrows the next owner/draw trace but does not authorize effect rendering.

To recover the current Android layout B target cache and resource-schema bind layer, rebuild:

```bash
node extracted/tools/current_native_layout_b_target_cache_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_target_cache_audit.json`
- `extracted/reports/current_native_layout_b_target_cache_audit.tsv`
- `extracted/viewer/current-native-layout-b-target-cache-audit.json`

Current local evidence has 53 exact opcode rows and 0 mismatches. It proves `0xe3b5e8` hashes the decoded KindredEffects resource, looks up the owner slot A cache at `+0x1c60d8`, creates/inserts cache nodes on miss, calls `0xe3ab7c` to acquire the target object, and calls `0xe3b740` to bind the resource schema. `0xe3b740` then expands primary and child records through `0xe3b060` and `0xe3b16c`, stores decoded resource pointers, appends eligible child pointers through `0xe3d808`, and marks target-local `+0x64` status.

The same report bounds the submit side: `0xe3b2a8` copies caller transforms, then chooses either serial target-record processing at `0xe3b440` or global fanout at `0xe3c9c8`. This is still diagnostic-only. It proves target cache/acquire/bind/schema expansion and fanout scheduling, but not the concrete record-to-draw-queue bridge or final PFX/emitter primitive.

To recover the current Android layout B manager/draw-filter bridge, rebuild:

```bash
node extracted/tools/current_native_layout_b_manager_draw_bridge_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_manager_draw_bridge_audit.json`
- `extracted/reports/current_native_layout_b_manager_draw_bridge_audit.tsv`
- `extracted/viewer/current-native-layout-b-manager-draw-bridge-audit.json`

Current local evidence has 44 exact opcode rows and 0 mismatches. It proves slot0 loads `object+0xac`, registration forwards those flags through `0x188eee0`, the backing add-record vtable stores them at backing record `+0x18`, and `Draw all particle effects` filters the same field with mask `0x200` before materializing manager entries into the particle draw batch.

The same report proves the final refresh path forwards `target+0x40` through manager refresh `0x188f020`; backing vtable slot `+0x20` then copies optional `x2` payload data separately from optional `x3` flag refresh data. The filtered particle batch reaches composite task construction and render-queue append. This closes the manager/filter/update bridge but remains diagnostic-only. It does not prove the semantic producer of the layout B `object+0xac` value, the exact semantic meaning of the copied `target+0x40` payload fields, or the concrete PFX/emitter material, primitive, and lifecycle formulas.

To keep the two layout B manager-refresh modes separate, rebuild:

```bash
node extracted/tools/current_native_layout_b_refresh_mode_split_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_refresh_mode_split_audit.json`
- `extracted/reports/current_native_layout_b_refresh_mode_split_audit.tsv`
- `extracted/viewer/current-native-layout-b-refresh-mode-split-audit.json`

Current local evidence has 10 exact opcode rows and 0 mismatches. It proves final dispatch calls `0xe3a510`, forwards `target+0x40` as `x2`, and passes `x3 = null`; the visibility gate passes `x2 = null` and `x3 = stack flag slot`.

This is diagnostic-only. The backing implementation has separate null gates for payload copy and flag refresh, so final dispatch is payload-only while visibility refresh is flags-only. This prevents treating final dispatch as evidence that draw flags were refreshed.

To classify the upper layout B query/create wrappers that feed setup and visibility-state inputs, rebuild:

```bash
node extracted/tools/current_native_layout_b_query_apply_path_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_query_apply_path_audit.json`
- `extracted/reports/current_native_layout_b_query_apply_path_audit.tsv`
- `extracted/viewer/current-native-layout-b-query-apply-path-audit.json`

Current local evidence has 4 wrapper rows, 33 exact opcode rows, and 0 mismatches. It proves two query wrappers, one conditional create/query wrapper, and one shared create branch. Their visibility gate state pointers come from caller-owned state fields: `x20+0x2fc`, linked-owner `+0x2fc`, or `x21+0x2fc`.

This is diagnostic-only. These wrappers explain visibility gate inputs and caller-state ownership, but they do not write layout B `object+0xac` and do not prove the missing `0x200` particle flag producer.

To map the shared caller-struct fields that feed layout B specialized and common apply helpers, rebuild:

```bash
node extracted/tools/current_native_layout_b_shared_struct_apply_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_shared_struct_apply_audit.json`
- `extracted/reports/current_native_layout_b_shared_struct_apply_audit.tsv`
- `extracted/viewer/current-native-layout-b-shared-struct-apply-audit.json`

Current local evidence has 4 block rows, 60 exact opcode rows, and 0 mismatches. Three wrapper blocks load the same caller struct fields, call core create/query helper `0x8adfe4`, invoke one specialized apply function (`0x8d4754`, `0x8d483c`, or `0x8d4940`), and tail into common apply block `0x8ade48`.

This is diagnostic-only. The audit maps setup inputs from caller fields such as `+0x65/+0x66/+0x67/+0x68` and vector/scalar ranges, but it does not write layout B `object+0xac` and does not prove the `0x200` particle flag producer.

To bound the default initializer for that caller struct before chasing runtime writers, rebuild:

```bash
node extracted/tools/current_native_layout_b_caller_struct_initializer_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_caller_struct_initializer_audit.json`
- `extracted/reports/current_native_layout_b_caller_struct_initializer_audit.tsv`
- `extracted/viewer/current-native-layout-b-caller-struct-initializer-audit.json`

Current local evidence has 3 block rows, 27 exact opcode rows, and 0 mismatches. It proves `0xbab568` seeds the root defaults, `0xbdc28c` writes primary defaults, and `0x990ba0` writes secondary defaults. The default/fallback stores cover the lower caller struct range up to `+0x3c`.

This is diagnostic-only. The initializer does not write caller visibility/control bytes `+0x64..+0x68`, does not write layout B `object+0xac`, and does not prove the missing `0x200` particle flag producer. The next valid target is the runtime writer path for those high caller fields.

To separate table-driven full caller-struct entries from compact stack/hash entries, rebuild:

```bash
node extracted/tools/current_native_layout_b_component_table_entry_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_component_table_entry_audit.json`
- `extracted/reports/current_native_layout_b_component_table_entry_audit.tsv`
- `extracted/viewer/current-native-layout-b-component-table-entry-audit.json`

Current local evidence has 4 relevant `.data.rel.ro` table rows and 0 mismatches. Three entries target full caller-struct wrappers: `0x26c7980 -> 0x8adf58`, `0x26c7988 -> 0x8ae14c`, and `0x26c7990 -> 0x8ae1e8`. One entry targets compact stack/hash wrapper `0x26c79d8 -> 0x8ae9a8`.

The compact wrapper has 15 exact opcode rows and 0 mismatches. It hashes an input token into a stack mini-struct, forwards constants into `0x8adfe4`, and calls `0x8d4754` with a constant flag. This is diagnostic-only: it explains a separate route that bypasses caller fields `+0x64..+0x68`; it does not write those fields, does not write layout B `object+0xac`, and does not prove the missing `0x200` particle flag producer.

To separate the upper component method table from the concrete layout B object table, rebuild:

```bash
node extracted/tools/current_native_layout_b_component_table_owner_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_component_table_owner_audit.json`
- `extracted/reports/current_native_layout_b_component_table_owner_audit.tsv`
- `extracted/viewer/current-native-layout-b-component-table-owner-audit.json`

Current local evidence has 3 block rows, 23 exact opcode rows, and 0 mismatches. It proves `0x8aa8f0` installs the upper component method-table root around `0x26c78d0/0x26c7aa0/0x26c7c40`, while `0x8d2d34` installs the concrete layout B object tables around `0x26c8e38/0x26c8ed8`. The type-registration block `0x8d2f44` registers type literal `0x118` and stores the layout B type-index global at `0x2d44ea8`.

This is diagnostic-only. It prevents mixing table-wrapper evidence with concrete layout B object-method evidence, but it does not write full caller-struct fields `+0x64..+0x68`, does not write layout B `object+0xac`, and does not prove the missing `0x200` particle flag producer.

To recover the original direct caller-struct stack builders that do write caller high fields, rebuild:

```bash
node extracted/tools/current_native_layout_b_direct_caller_struct_builder_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_direct_caller_struct_builder_audit.json`
- `extracted/reports/current_native_layout_b_direct_caller_struct_builder_audit.tsv`
- `extracted/viewer/current-native-layout-b-direct-caller-struct-builder-audit.json`

Current local evidence has 4 builder rows, 35 exact opcode rows, and 0 mismatches. It proves four direct stack-builder paths: `0x8b3250 -> 0x8b3350 -> 0xbab250`, `0x8b3a34 -> 0x8b3b8c -> 0xbab514`, `0x983760 -> 0x983884/0x983920`, and `0x984940 -> 0x984a6c/0x984b08`.

The two resource-builder helpers `0x983a9c` and `0x984c84` read native config byte `x21+0xb2`, write caller `+0x67`, and dispatch optional callback slots under `x21+0x40/+0x48/+0x50/+0x58`. This closes direct stack writer evidence for some paths, but it is still diagnostic-only: the table-driven entries `0x8adf58/0x8ae14c/0x8ae1e8`, the concrete callback resource/action records, and layout B `object+0xac` producer are still unresolved.

To recover the exact backing record layout used when `target+0x40` is copied, rebuild:

```bash
node extracted/tools/current_native_layout_b_payload_record_layout_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_payload_record_layout_audit.json`
- `extracted/reports/current_native_layout_b_payload_record_layout_audit.tsv`
- `extracted/viewer/current-native-layout-b-payload-record-layout-audit.json`

Current local evidence has 14 exact opcode rows and 0 mismatches. It proves layout B forwards `target+0x40` as x2, and backing vtable `+0x20` treats that pointer as a 24-byte payload: a 16-byte vector at source `+0`, an 8-byte qword at source `+0x10`, copied into `backing+0x10+index*0x30` at destination `+0/+0x10`. Optional refreshed flags are separate and written as 16 bits at destination `+0x18`.

This narrows the unknown from "payload is unknown" to "payload field semantics are unknown." The copy layout and flag separation are proven, but the vector/qword meanings and downstream draw consumer are not. The report keeps `renderPromotionAllowedRows=0`.

To rule out the nearby current Android layout A add-record path as the missing particle flag source, rebuild:

```bash
node extracted/tools/current_native_layout_a_add_record_flag_source_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_a_add_record_flag_source_audit.json`
- `extracted/reports/current_native_layout_a_add_record_flag_source_audit.tsv`
- `extracted/viewer/current-native-layout-a-add-record-flag-source-audit.json`

Current local evidence has 20 exact opcode rows and 0 mismatches. It proves type registration stores callback pair `0xd80124/0xd80148`, callback `0xd80124` calls setup `0xd7f968`, the setup path defaults to `w2=1`, and forwarding body `0xd7fa14` passes the caller flags into manager add-record `0x188eee0` through `0xd7fab0`.

This is negative evidence for effect rendering. The report has `registeredFlagParticleMaskRows=0`, `externalUnknownD7FA14CallerRows=0`, and `renderPromotionAllowedRows=0`, so layout A is not the source of the missing `0x200` particle draw flag.

To recover the local primitive packet written by the separate current Android `0x210` path, rebuild:

```bash
node extracted/tools/current_native_type210_primitive_builder_audit.js
```

The audit writes:

- `extracted/reports/current_native_type210_primitive_builder_audit.json`
- `extracted/reports/current_native_type210_primitive_builder_audit.tsv`
- `extracted/viewer/current-native-type210-primitive-builder-audit.json`

Current local evidence has 20 exact opcode rows and 0 mismatches. It proves callback `0x8cb418` calls primitive builder `0x8cb7fc`; the builder checks for 18 free output slots, then writes 18 records with 0x18-byte stride. The recovered packet shape has 18 pointer advances, 18 pointer stores, 18 count increments, 72 color-byte stores, 36 float-pair stores, 18 scalar-float stores, and 18 complete color-bearing records.

This also remains diagnostic-only. It proves a local primitive builder layout, not the material/shader state, timing/activation owner, or final draw consumer. The report therefore keeps `renderPromotionAllowedRows=0`.

To connect the separate `0x210` path to the current LevelVisuals owner evidence, rebuild:

```bash
node extracted/tools/current_native_type210_levelvisuals_bridge_audit.js
```

The audit writes:

- `extracted/reports/current_native_type210_levelvisuals_bridge_audit.json`
- `extracted/reports/current_native_type210_levelvisuals_bridge_audit.tsv`
- `extracted/viewer/current-native-type210-levelvisuals-bridge-audit.json`

Current local evidence has 14 exact opcode rows and 0 mismatches. It proves the LevelVisuals apply processor reads `LevelVisuals +0x58` as a static lens-flare list, loads type global `0x3035098`, resolves resources through `0xc72dbc/0xc72dc8`, routes entries through `0x8cb108/0x8cb180`, and reaches the same `0x8cb418 -> 0x8cb7fc` local primitive builder family.

This reclassifies the path. The `0x210` primitive builder is LevelVisuals static lens-flare primitive evidence, not hero skill PFX render permission. The report has `classifiedAsLevelVisualsLensFlareRows=1`, `heroPfxRenderPermissionRows=0`, and `renderPromotionAllowedRows=0`.

To close the current Android particle composite dispatch shape without promoting rendering, rebuild:

```bash
node extracted/tools/current_native_layout_b_particle_entry_dispatch_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_particle_entry_dispatch_audit.json`
- `extracted/reports/current_native_layout_b_particle_entry_dispatch_audit.tsv`
- `extracted/viewer/current-native-layout-b-particle-entry-dispatch-audit.json`

Current local evidence has 31 exact opcode rows and 0 mismatches. It proves `Draw all particle effects` filters backing records with mask `0x200`, maps passing manager indices back to `manager record +0x8`, stores those concrete entries in the batch task entry array, and constructs composite task `0x18a11e4`.

The dispatch side is now opcode-bounded too: batch constructor stores the external entry array at task `+0x50` and runtime-parameter object at task `+0x58`; dispatch `0x18a13fc` loads each current entry, loads owner from `entry +0x8`, and calls owner vtable `+0x10` with `x2 = task +0x58` and `x4 = current entry`. The same report ties layout B registration into this by proving `object+0x30 -> manager record+0x8`.

This remains diagnostic-only. The entry dispatch shape is closed, but the semantic producer of layout B `object+0xac` bit `0x200` and the concrete PFX/emitter material, shader, primitive, lifetime, and timeline formulas after owner vtable `+0x10` are still unresolved.

To close the current Android ownerB vtable dispatch shape after `entry+0x8`, rebuild:

```bash
node extracted/tools/current_native_layout_b_owner_b_vtable_dispatch_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_owner_b_vtable_dispatch_audit.json`
- `extracted/reports/current_native_layout_b_owner_b_vtable_dispatch_audit.tsv`
- `extracted/viewer/current-native-layout-b-owner-b-vtable-dispatch-audit.json`

Current local evidence has 93 exact opcode rows, 5 vtable pointer rows, 0 opcode mismatches, and 0 pointer mismatches. It proves runtime setup allocates ownerB and stores it at global `0x311a298`; ownerB constructor writes vptr `0x272f2a8`; vtable slot `+0x10` points to `0xe3d400`; and that callback decodes the current entry provider, target payload count, payload-record allocator, payload-node loop, and active/fallback submit split.

This is still diagnostic-only. It closes ownerB dispatch and submit branch shape, but the primitive-mode builders under `0xe39c90` and the material/shader/texture formulas for payload nodes are not yet recovered.

To close the current Android primitive mode dispatch matrix below `0xe39c90`, rebuild:

```bash
node extracted/tools/current_native_layout_b_primitive_mode_dispatch_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_primitive_mode_dispatch_audit.json`
- `extracted/reports/current_native_layout_b_primitive_mode_dispatch_audit.tsv`
- `extracted/viewer/current-native-layout-b-primitive-mode-dispatch-audit.json`

Current local evidence has 57 exact opcode rows, 27 mode-table rows, 0 opcode mismatches, and 0 table mismatches. It proves payload node `+0x200` supplies primitive count and `+0x220` supplies mode/flags. The low mode nibble selects the 9-entry outer table at `0x1afcfb8`; modes 0/1 route through nested table `0x1afd00c`, mode 7 through `0x1afcff4`, and mode 8 through `0x1afcfdc`.

The builder call matrix is bounded to 16 concrete targets and the output record shapes are only partially recovered. This is diagnostic-only: it proves mode dispatch and builder spans, but not the material/shader/texture formulas or final draw semantics.

To bridge the recovered primitive dispatch with material/draw evidence without promoting rendering, rebuild:

```bash
node extracted/tools/current_native_layout_b_material_draw_bridge_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_material_draw_bridge_audit.json`
- `extracted/reports/current_native_layout_b_material_draw_bridge_audit.tsv`
- `extracted/viewer/current-native-layout-b-material-draw-bridge-audit.json`

Current local evidence has 18 current payload-field opcode rows, 5 cross-build draw-state rows, 9 cross-build dynamic-parameter rows, 3 cross-build draw-mode rows, 5 current queue program-binding rows, 2 current queue sort rows, and 0 current opcode mismatches. It combines current Android field evidence, old Android draw/material semantics from HackedGlory `00f34.c`, and current queue program/sort evidence from `current_native_position_sampler_owner_audit`.

This remains diagnostic-only. The exact current final primitive consumer and shader/texture/sampler formula are not recovered, so the report keeps `currentFinalPrimitiveConsumerRecovered=false`, `shaderTextureFormulaRecovered=false`, and `renderPromotionAllowedRows=0`.

To close the current Android final primitive consumer after the material bridge, rebuild:

```bash
node extracted/tools/current_native_layout_b_final_primitive_consumer_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_final_primitive_consumer_audit.json`
- `extracted/reports/current_native_layout_b_final_primitive_consumer_audit.tsv`
- `extracted/viewer/current-native-layout-b-final-primitive-consumer-audit.json`

Current local evidence has 76 exact opcode rows, 4 vtable pointer rows, 0 opcode mismatches, and 0 pointer mismatches. It proves command vptr `0x272f2f0` slot `+0x8 -> 0xe3ce74`, command segment list/count fields, segment start/count records, current draw-state application, material/source object selection, `glUseProgram`, parameter apply, attribute binding, GL draw-mode mapping, `glDrawArrays`, and buffer map/unmap lifecycle.

This closes the draw command consumer only. It still does not recover the shader texture formula, sampler state, atlas frame, UV scroll, emissive/reflection parameters, or safe viewer render-promotion rule. The report therefore keeps `shaderTextureFormulaRecovered=false`, `textureSamplerFormulaRecovered=false`, and `renderPromotionAllowedRows=0`.

To bridge the current final primitive consumer into the shared shader parameter uploader and texture-object binder without promoting rendering, rebuild:

```bash
node extracted/tools/current_native_layout_b_shader_parameter_bridge_audit.js
```

The audit writes:

- `extracted/reports/current_native_layout_b_shader_parameter_bridge_audit.json`
- `extracted/reports/current_native_layout_b_shader_parameter_bridge_audit.tsv`
- `extracted/viewer/current-native-layout-b-shader-parameter-bridge-audit.json`

Current local evidence has 44 opcode rows and 0 opcode mismatches. It proves the layout B final consumer reaches shared parameter uploader `0x189ca94`; that uploader handles default and override parameter entries, numeric GL uniforms, and object-backed parameter uploads; and one object-backed texture wrapper derives the texture record as `object+0x30`, updates sampler state through helper calls, and reaches `0xe07df8 -> glActiveTexture/glBindTexture`.

This is still diagnostic-only. It proves upload/bind mechanics, not the exact shader formula, every sampler resource object, active light/probe/profile value, atlas/UV animation, or safe viewer render-promotion rule. The report therefore keeps `shaderTextureFormulaRecovered=false`, `textureSamplerFormulaRecovered=false`, and `renderPromotionAllowedRows=0`.

To isolate the next upstream dynamic source/program table selector boundary without promoting rendering, rebuild:

```bash
node extracted/tools/current_native_dynamic_source_table_semantics_audit.js
```

The audit writes:

- `extracted/reports/current_native_dynamic_source_table_semantics_audit.json`
- `extracted/reports/current_native_dynamic_source_table_semantics_audit.tsv`
- `extracted/viewer/current-native-dynamic-source-table-semantics-audit.json`

Current local evidence has 73 opcode rows and 0 opcode mismatches. It proves the upstream loader reads `Level +0x170` and `Level +0x10`, resolves `LevelVisualsRef` keys, filters candidates by batch type index `0x30350a8`, and calls the batch dispatcher. It also proves the selector path uses three runtime type-index globals (`0x30350c8`, `0x30349e4`, `0x30349f0`), matches selector-child candidates through payload `+0xa4`, tail-calls the dynamic source-table producer `0xbac9d4`, and initializes the post child with config/resource pointer `x19+0x38` plus transform/config block `x19+0x40`.

This pass cross-checks the Level field names with `current_native_levelvisuals_schema_audit` and confirms the `LevelVisuals` apply-processor field routing through `current_native_level_runtime_owner_audit`: `levelConfigFieldNamesRecovered=true` and `levelVisualsApplyProcessorFieldRoutingRecovered=true`.

The next local selector-entry shape is captured by:

```bash
node extracted/tools/current_native_static_mesh_selector_entry_audit.js
```

This writes:

- `extracted/reports/current_native_static_mesh_selector_entry_audit.json`
- `extracted/reports/current_native_static_mesh_selector_entry_audit.tsv`
- `extracted/viewer/current-native-static-mesh-selector-entry-audit.json`

Current local evidence has 20 opcode rows and 0 opcode mismatches. It proves `LevelVisuals +0x8/+0x10/+0x18` are `StaticMesh**` lists and that `0x8cca64` receives a `StaticMesh` entry as `x19`: `+0x30` is a `char*` selector-child attach payload, `+0x38` is a `char*` post-child config/resource pointer, `+0x40` is a `NamedAnimation` transform/config block, and `+0x68` is a `ShaderParams**` resource/list argument.

This is still diagnostic-only. It proves the `StaticMesh` entry shape, not the original definition field labels, active resource values, or final shader/texture/effect semantics.

The schema directly behind `StaticMesh +0x68` is captured by:

```bash
node extracted/tools/current_native_shaderparams_schema_audit.js
```

This writes:

- `extracted/reports/current_native_shaderparams_schema_audit.json`
- `extracted/reports/current_native_shaderparams_schema_audit.tsv`
- `extracted/viewer/current-native-shaderparams-schema-audit.json`

Current local evidence has 17 opcode rows and 0 opcode mismatches. It proves current Android registers `ShaderParam/ShaderParams`, recovers `ShaderParams` as `+0x0 char*` plus `+0x8 ShaderParam**`, and verifies that `StaticMesh +0x68` uses `ShaderParams**` before the selector helper passes it to the dynamic source-table path. The HackedGlory iOS schema agrees with the same field shape.

This is still diagnostic-only. It proves schema shape and cross-build agreement, not original source field labels, active resource values, sampler ownership, or final shader/texture formulas.

The value-packing layer behind that schema is captured by:

```bash
node extracted/tools/current_native_shaderparams_value_semantics_audit.js
```

This writes:

- `extracted/reports/current_native_shaderparams_value_semantics_audit.json`
- `extracted/reports/current_native_shaderparams_value_semantics_audit.tsv`
- `extracted/viewer/current-native-shaderparams-value-semantics-audit.json`

Current local evidence has 47 opcode rows and 0 opcode mismatches, plus 4 component-count jump-table rows and 0 jump-table mismatches. It proves `0xbac9d4` walks `ShaderParams**`, reads `ShaderParams +0x0` as the source key, reads `ShaderParams +0x8` as the `ShaderParam**` id list, extracts each `ShaderParam +0x0` id, maps 1..4 ids to component count, hashes the source key with seed `0x12345678`, and packs source-table entries through `0x189bcf8`.

The recovered source-table entry is 8 bytes: entry `+0x0` packs list index, value-table offset, component count/type, and direct-value flag; entry `+0x4` stores the source key hash. The value table stores 32-bit `ShaderParam +0x0` ids.

This is still diagnostic-only. It recovers value packing, not active source key values, concrete sampler/resource ownership, or final shader/texture formulas.

The current uploader override-merge layer that consumes those tables is included in:

```bash
node extracted/tools/current_native_layout_b_shader_parameter_bridge_audit.js
```

Current local evidence now has 64 opcode rows and 0 opcode mismatches. It proves `0x189ca94` uploads the base shader/program parameter table first, then merges an override payload by matching override entry `+0x4` hash/id against base entry `+0x4`. The matched base entry keeps the GL uniform location, while the override entry/value table supplies value offset, direct/indirect flag, upload type bits, and values to `0x189ca10`.

The same evidence proves the `StaticMesh ShaderParams` path is numeric-uniform only. `0xbac9d4 -> 0x189bcf8` maps 1..4 ids to uploader types 0..3 and does not produce type 4 texture-object entries. Texture object ownership therefore still needs a separate trace through the base shader/program parameter table and type-4 value source.

The current built-in semantic type-4 value source is tracked by:

```bash
node extracted/tools/current_native_shaderdata_type4_value_source_audit.js
```

This writes:

- `extracted/reports/current_native_shaderdata_type4_value_source_audit.json`
- `extracted/reports/current_native_shaderdata_type4_value_source_audit.tsv`
- `extracted/viewer/current-native-shaderdata-type4-value-source-audit.json`

Current local evidence has 22 opcode rows and 0 opcode mismatches. It proves the shaderData parser checks the built-in semantic table at `0x2af8828`, recognizes kind-4 semantic texture keys, resolves their object pointer/value slot, and writes type-4 source/parameter entries through `0x189bc8c -> 0x189bacc`. The recovered built-in type4 names are `CloudShadows.Texture`, `FogOfWar.Texture`, and `Shadowing.mMap`.

This is still diagnostic-only. It recovers built-in semantic texture-object value sources, not arbitrary character-material sampler texture ownership.

The current `texData` texture-object chain is tracked by:

```bash
node extracted/tools/current_native_texdata_texture_object_audit.js
```

This writes:

- `extracted/reports/current_native_texdata_texture_object_audit.json`
- `extracted/reports/current_native_texdata_texture_object_audit.tsv`
- `extracted/viewer/current-native-texdata-texture-object-audit.json`

Current local evidence has 34 opcode rows, 7 vtable pointer rows, and 0 mismatches. It proves `texData` process `0xe02438` calls `0x189e9e8`, builds a 0x38 texture wrapper, decodes `texData` payload records, creates/uploads GL texture records through `glGenTextures`, `glTexImage2D`, and `glCompressedTexImage2D`, and later binds the texture record through `glActiveTexture/glBindTexture`.

This is still diagnostic-only. It closes resource-to-GL-texture-object mechanics, not shadergraph sampler-to-texData ownership or the final shader formula.

The current `shaderData` texture/sampler table layout is tracked by:

```bash
node extracted/tools/current_native_shaderdata_texture_sampler_table_audit.js
```

This writes:

- `extracted/reports/current_native_shaderdata_texture_sampler_table_audit.json`
- `extracted/reports/current_native_shaderdata_texture_sampler_table_audit.tsv`
- `extracted/viewer/current-native-shaderdata-texture-sampler-table-audit.json`

Current local evidence has 61 opcode rows and 0 mismatches. It proves the pass header section counts, 0x28 external texture record parser, 0x303 inline texture record parser, shaderData texture binding record writes, type4 placeholder entry writes, and compiled sampler unit table assignment through `glGetUniformLocation` and `glUniform1i`.

This is still diagnostic-only. It proves static sampler-unit layout and parse-time placeholder entries, not the runtime patch from texture metadata/key to a concrete `texData` wrapper object.

The current `shaderData` external texture runtime binding path is tracked by:

```bash
node extracted/tools/current_native_shaderdata_external_texture_binding_audit.js
```

This writes:

- `extracted/reports/current_native_shaderdata_external_texture_binding_audit.json`
- `extracted/reports/current_native_shaderdata_external_texture_binding_audit.tsv`
- `extracted/viewer/current-native-shaderdata-external-texture-binding-audit.json`

Current local evidence has 55 opcode rows and 0 mismatches. It proves texture runtime setup installs callback slot `+0x30050`, `shaderData` registers 0x41-byte external resource-key records through `0x189dd40`, the texture runtime hashes keys with seed `0x12345678`, resolves runtime nodes through lookup tree `+0x30060`, stores texture object pointers at node `+0x28`, applies sampler state during `0x189df90`, and patches the returned object pointer into matching type4 sampler value-table slots through `0x189cf2c`.

This is still diagnostic-only. It closes the external shaderData texture-key runtime binding path, not ordinary material sampler ownership or the final shader/texture formula.

The runtime capture targets for the current material source/program table are generated by:

```bash
node extracted/tools/current_native_material_source_program_capture_targets.js
```

This writes:

- `extracted/reports/current_native_material_source_program_capture_targets.json`
- `extracted/reports/current_native_material_source_program_capture_targets.tsv`
- `extracted/viewer/current-native-material-source-program-capture-targets.json`
- `extracted/reports/frida_capture_current_material_source_program.js`

Current local evidence has 10 hook targets, 26 opcode rows, and 0 opcode mismatches. The targets cover the dynamic source/program producer `0xbac9d4`, entry writer/finalizer/mount callsites `0xbacac0/0xbacad8/0xbacae8`, upstream selector/callsite rows `0x8abe6c/0x8abfcc/0x8d5550`, entry builder/packer `0x189bde4/0x189bcf8`, and mount wrapper `0xd8003c`.

This is still diagnostic-only. It proves the resource-list shape and source/program table mount path are ready for live original-runtime capture, not that ordinary material sampler ownership has been recovered. The generated capture script now also decodes the opcode-verified source-table struct (`+0` entry array, `+0x8` value-word array, `+0x10` packed counts) at entry-builder, clone-finalize, and mount points. The report therefore keeps `resourceListSemanticNamesRecovered=false`, `shadergraphSamplerToTexDataBindingRecovered=false`, `materialSamplerTextureObjectOwnershipRecovered=false`, `shaderTextureFormulaRecovered=false`, and `renderPromotionAllowedRows=0`.

The imported runtime capture summary for those material source/program targets is generated by:

```bash
node extracted/tools/current_native_material_source_program_capture_summary.js
```

This reads `extracted/reports/material_source_program_capture.jsonl` by default and writes:

- `extracted/reports/current_native_material_source_program_capture_summary.json`
- `extracted/reports/current_native_material_source_program_capture_summary.tsv`
- `extracted/viewer/current-native-material-source-program-capture-summary.json`

Current local state has no imported live original-runtime capture, so the report is intentionally negative: `captureStatus=capture-missing`, 10 targets, 0 observed hooks, 0 target events, 0 resource-list snapshots, 0 nested resource ids, 0 entry build events, 0 table mount events, 0 decoded source-table entries, and `renderPromotionAllowedRows=0`.

The summary is ready for manual source/program review only after the same capture contains resource-list snapshots with nested ids, entry build events, table mount events, and decoded source-table entries/value words. That review gate still does not recover resource semantic names, ordinary material sampler texture ownership, or final shader/texture formulas.

The inline shaderData texture placeholder audit is generated by:

```bash
node extracted/tools/current_native_shaderdata_inline_texture_placeholder_audit.js
```

This writes:

- `extracted/reports/current_native_shaderdata_inline_texture_placeholder_audit.json`
- `extracted/reports/current_native_shaderdata_inline_texture_placeholder_audit.tsv`
- `extracted/viewer/current-native-shaderdata-inline-texture-placeholder-audit.json`

Current local evidence has 38 opcode rows and 0 opcode mismatches. It proves inline texture binding is two-phase. The inline texture record consumer first calls `0x189bbdc` with null value/key arguments, and the shared type4 writer stores that null direct value into the type4 value table. During pass build, `0x189c6a0` walks the inline records from `shaderData +0x550/+0x558`, calls `0x189e4ec` to construct/upload a runtime texture object from the inline payload, reloads the sampler unit, and patches the returned object into the matching type4 value-table slot through `0x189cf2c`.

This closes the inline mechanical texture object-binding path: `inlineType4PlaceholderObjectInitiallyNull=true`, `inlinePassLookupRecovered=true`, `inlineTextureObjectRuntimeConstructionRecovered=true`, `inlineTextureObjectUploadRecovered=true`, `inlineType4RuntimePatchRecovered=true`, `inlineTextureObjectBindingRecovered=true`, and `inlineTextureRuntimePatchRequired=false`. The report still keeps `materialSamplerTextureObjectOwnershipRecovered=false`, `shaderTextureFormulaRecovered=false`, and `renderPromotionAllowedRows=0`.

The consolidated ordinary material sampler ownership gate is generated by:

```bash
node extracted/tools/current_native_material_sampler_ownership_gate_audit.js
```

This writes:

- `extracted/reports/current_native_material_sampler_ownership_gate_audit.json`
- `extracted/reports/current_native_material_sampler_ownership_gate_audit.tsv`
- `extracted/viewer/current-native-material-sampler-ownership-gate-audit.json`

Current local evidence has 1038 material rows, 504 rows with runtime sampler records, 0 unresolved sampler rows, 525 texture-path-missing/runtime-resolved sampler rows, 525 unhashed sampler rows, and 339 rows still blocked on runtime light/probe values. It also records the important negative/positive split: the external mechanical texture upload/bind path is recovered, inline texture object binding is recovered, shaderData external texture runtime binding is recovered, and StaticMesh `ShaderParams` is disqualified as a texture source because it only produces numeric overrides. The regenerated gate therefore reports `externalMechanicalTexturePathRecovered=true`, `inlineMechanicalTexturePathRecovered=true`, and `allMechanicalTexturePathsRecovered=true`.

This is still diagnostic-only. The gate remains closed because the source/program capture is not imported, decoded source-table entries are absent, shadergraph sampler-to-texData ownership is not recovered, ordinary material sampler ownership is not recovered, shader/texture formulas are not recovered, and `renderPromotionAllowedRows=0`.

This is still diagnostic-only. It proves selector mechanics, not original resource field names, active model/profile semantics, or concrete sampler/resource ownership. The report therefore keeps `resourceFieldNamesRecovered=false`, `activeResourceSemanticsRecovered=false`, `shaderTextureFormulaRecovered=false`, and `renderPromotionAllowedRows=0`.

## Safety Rules

- Do not map an effect token to a PFX resource from name similarity alone.
- Do not treat a `KindredEffects.def` hash hit as effect-render permission. It closes resource ownership only.
- Do not treat Kindred component-chain closure as effect-render permission. It proves object creation, parameter update, transform sync, and queue submission, but not the queue draw target or final render policy.
- Do not treat the current particle bridge as effect-render permission. It aligns the component/manager field shape, but the exact current particle flag producer and PFX/emitter manager-entry owner are still unresolved.
- Do not treat the recovered layout B `target+0x40` payload copy as draw permission. It proves a 24-byte record and separate flags, but not the semantic formula or final draw consumer.
- Do not treat the separate `0x210` owner chain as effect-render permission. It has packed coverage writes that can include `0x200`, but no current evidence ties those writes to the `0x118` layout B object or the particle draw queue.
- Do not treat the separate `0x210` primitive-builder packet as effect-render permission. Its 18 local records are recovered, but their material/shader, lifetime, and final consumer are not yet closed.
- Do not route the separate `0x210` primitive builder into hero skill PFX preview. Current evidence classifies it as LevelVisuals static lens-flare primitive routing.
- Do not treat `texData` texture-object closure as ordinary material sampler ownership. It proves resource-to-GL texture object mechanics, not shadergraph sampler-to-texData binding or the final shader formula.
- Do not treat `shaderData` sampler-unit table closure as ordinary material sampler ownership. It proves static sampler names/units and parse-time placeholders, not the runtime `texData` object assigned to each submitted material.
- Do not treat `shaderData` external texture runtime binding closure as ordinary material sampler ownership. It proves external texture-key lookup, sampler-state application, and type4 value patching for shaderData records, not full shadergraph sampler-to-texData ownership or final shader formulas.
- Do not treat inline texture record parsing alone as texture-object binding. Current Android evidence proves inline records initially create null type4 placeholders; the pass-build runtime patch path must also be present before considering the inline mechanical path closed.
- Do not treat material source/program capture-target closure as ordinary material sampler ownership. It proves where to capture live resource-list rows and mounted source/program entries, not the resource semantic names or sampler-to-texData object mapping.
- Do not treat a material source/program capture summary as renderer permission. Even a review-ready capture only proves original runtime values are available for analysis; shader/texture formulas and sampler ownership still need separate evidence.
- Do not treat the material sampler ownership gate as renderer permission. Its purpose is to keep the combined gate closed until source/program runtime values, shadergraph sampler-to-texData ownership, ordinary sampler ownership, and shader formulas are all recovered together.
- Do not treat particle composite dispatch closure as effect-render permission. It proves entries reach owner vtable `+0x10`, but not the `object+0xac` particle flag producer or final PFX/emitter material/primitive formulas.
- Do not treat ownerB vtable dispatch closure as effect-render permission. It proves `entry+0x8 -> ownerB -> vtable+0x10 -> 0xe3d400` and the active/fallback submit split, but not the primitive-mode builders or material/shader formulas below `0xe39c90`.
- Do not treat primitive mode dispatch closure as effect-render permission. It proves the mode table and builder-call matrix below `0xe39c90`, but not the material/shader/texture formulas or final draw semantics.
- Do not treat material draw bridge closure by itself as effect-render permission. It connects current payload fields, old Android draw semantics, and current queue program/sort evidence, but that report does not prove the current final primitive consumer or shader/texture/sampler formula.
- Do not treat final primitive consumer closure as effect-render permission. It proves current command vtable, segment records, draw state, program binding, attributes, draw mode, `glDrawArrays`, and buffer lifecycle, but not shader texture formulas, sampler state, atlas/UV animation, emissive/reflection/alpha/depth material parameters, or safe viewer promotion.
- Do not treat shader parameter bridge closure as effect-render permission. It proves parameter upload and texture-object bind mechanics, but not concrete sampler resource/value ownership or the final shader formula.
- Do not treat the ShaderParams-to-uploader override bridge as texture ownership. It proves numeric uniform override merging by hash/id, and explicitly proves this StaticMesh `ShaderParams` path does not produce texture-object type 4.
- Do not treat shaderData built-in type4 semantic closure as character material texture ownership. It proves `CloudShadows.Texture`, `FogOfWar.Texture`, and `Shadowing.mMap` object-backed values only.
- Do not treat dynamic source-table selector closure as effect-render permission. It proves runtime type-index and selector mechanics, but not original resource field names, active model/profile semantics, concrete sampler/resource ownership, or the final shader formula.
- Do not treat StaticMesh selector-entry shape closure as effect-render permission. It proves current Android list-item offsets and field types feeding `0x8cca64`, but not original definition field labels, active resource key values, or final shader/texture/effect semantics.
- Do not treat ShaderParams schema closure as effect-render permission. It proves `ShaderParams = char* + ShaderParam**` and the `StaticMesh +0x68` bridge, but not the live source/program table values, sampler ownership, or shader/texture formula.
- Do not treat ShaderParams value-packing closure as effect-render permission. It proves source key hashing, id copying, and source-table entry layout, but not active source key values, sampler/resource ownership, or the shader/texture formula.
- Do not treat layout A add-record forwarding as the missing particle source. Current evidence shows that registered path defaults to `flags=1` and has no `0x200` producer.
- Do not treat `+0xac` packed bit7..14 writes as layout B particle producers until the store is tied to the `0x118` layout B registration object. Current evidence marks them as candidates only.
- Do not treat `Effect_*` strings near a full-field `+0xac` replacement as a resource owner by themselves. The current eight hits are scalar fields in effect resource constructors, not selected renderable PFX owners.
- Do not treat the `0x9a2720/0x9a2744/0x9a2750` stores as particle producers. They are active-child selector state writes that toggle child records through vtable `+0x158`.
- Do not treat the layout B visibility gate as a particle producer. It forwards or suppresses an already-existing `object+0xac` value during manager refresh.
- Do not force hash misses into the PFX renderer. Check whether the original owner is a spawned definition, state channel, buff channel, or another runtime object first.
- Do not promote selector projectile/impact pairs or ambiguous Kindred/global candidates until the capture or static binary path identifies the concrete resource object.
- Do not promote generic effect-channel fallback PFX while `effect-native-channel-capture-summary` is `capture-missing`, `capture-empty`, `no-target-events`, or `partial-target-coverage`. Without full mapping review, the viewer must not root those PFX cards on the model as a substitute for the original channel/binding.
- Treat these captures as evidence for reverse engineering the missing resource/channel mapping, not as a viewer rendering fallback.
