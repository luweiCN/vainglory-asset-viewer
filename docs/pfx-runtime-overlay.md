# PFX Runtime Overlay Pipeline

This pipeline is for the remaining encrypted iOS PFX shape callbacks. It must not be used to guess sizes from Android fallback values.

## Current Scope

- Target list: `extracted/reports/pfx_encrypted_runtime_targets.json`
- Frida capture script: `extracted/reports/frida_dump_pfx_encrypted_runtime_targets.js`
- Current target count: 39 runtime addresses, covering 16 `pattern16` tables and 23 curve tables.

The separate native-callback blocker list is:

- Target list: `extracted/reports/pfx_native_callback_runtime_targets.json`
- Frida capture script: `extracted/reports/frida_capture_pfx_native_callback_runtime_targets.js`
- Current scope: PFX shape callbacks whose output depends on live native inputs such as `time-input,random`.

These native callback targets are not memory overlay targets. They should be hooked in a running process to record callback arguments, return values, and small before/after memory samples. Do not convert their `0..360` random ranges into card sizes.

## Capture Native Callback Samples

Run the generated callback script against the same iOS `GameKindred` process while exercising the matching effect:

```bash
frida -H <device-or-host> -n GameKindred \
  -l extracted/reports/frida_capture_pfx_native_callback_runtime_targets.js \
  | tee extracted/reports/pfx_native_callback_capture.jsonl
```

Then summarize the capture before using it for reverse engineering:

```bash
node extracted/tools/pfx_native_callback_capture_summary.js \
  --input extracted/reports/pfx_native_callback_capture.jsonl
```

The summary writes:

- `extracted/reports/pfx_native_callback_capture_summary.json`
- `extracted/reports/pfx_native_callback_capture_summary.tsv`
- `extracted/viewer/pfx-native-callback-capture-summary.json`

The viewer only displays this as diagnostic status. It does not make `requires-native-callback-runtime` surfaces renderable until complete enter/leave samples are reviewed and the callback output layout is recovered.

## Capture Runtime Bytes

Run the generated Frida script against a running iOS `GameKindred` process and save stdout as JSONL:

```bash
frida -H <device-or-host> -n GameKindred \
  -l extracted/reports/frida_dump_pfx_encrypted_runtime_targets.js \
  | tee extracted/reports/pfx_runtime_dump.jsonl
```

The script prints `pfx_runtime_data` records with `virtualAddress`, `byteLength`, and `bytesHex`.

## Validate And Import

Import the capture. The command fails unless every target address is present with enough bytes.

```bash
node extracted/tools/pfx_runtime_overlay_rebuild.js \
  --input extracted/reports/pfx_runtime_dump.jsonl \
  --validate-only \
  --run
```

Successful validation writes:

- `extracted/reports/pfx_runtime_memory_overlays.jsonl`
- `extracted/reports/pfx_runtime_memory_overlay_summary.json`
- `extracted/reports/pfx_runtime_memory_overlay_coverage.tsv`

The summary must show `readyForSemantics: true`.

## Rebuild Runtime Reports

After validation passes, run the full rebuild:

```bash
node extracted/tools/pfx_runtime_overlay_rebuild.js \
  --input extracted/reports/pfx_runtime_dump.jsonl \
  --run
```

This runs, in order:

1. `pfx_runtime_overlay_import.js`
2. `native_particle_callback_semantics.js --virtual-memory-overlays extracted/reports/pfx_runtime_memory_overlays.jsonl`
3. `pfx_resource_manifest.js`
4. `effect_runtime_gap_report.js`
5. `pfx_encrypted_runtime_targets.js`

## Safety Rules

- Do not run the full rebuild with partial capture data.
- Do not use Android fallback constants to replace current iOS `encrypted-range` values.
- Newly decoded PFX shape data is renderable only after the regenerated reports no longer classify it as encrypted or unresolved.
- Do not render `requires-native-callback-runtime` rows until the generated native callback capture identifies the original callback output layout.
