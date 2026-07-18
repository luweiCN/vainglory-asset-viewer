# Material Source/Program Runtime Capture

This pipeline is for the remaining ordinary material sampler/source-program ownership gap. It is diagnostic-only until the imported capture closes the full same-sequence chain.

## Current Scope

- Target report: `extracted/reports/current_native_material_source_program_capture_targets.json`
- Viewer mirror: `extracted/viewer/current-native-material-source-program-capture-targets.json`
- Frida script: `extracted/reports/frida_capture_current_material_source_program.js`
- Capture input: `extracted/reports/material_source_program_capture.jsonl`
- Summary report: `extracted/reports/current_native_material_source_program_capture_summary.json`
- Sampler gate: `extracted/reports/current_native_material_sampler_ownership_gate_audit.json`

The generated capture script is non-mutating. It logs source/program resource-list snapshots, source table entries, mount rows, external texture registration, texture lookup, inline texture object builders, and runtime type4 texture patch rows.

## Rebuild Capture Targets

```bash
npm run material:capture:targets --silent
```

This regenerates the target report and `frida_capture_current_material_source_program.js`.

## Capture The Original Runtime

Run the generated Frida script against a running Android `GameKindred` process while exercising the relevant hero, skin, or effect:

```bash
frida -U -n GameKindred \
  -l extracted/reports/frida_capture_current_material_source_program.js \
  | tee extracted/reports/material_source_program_capture.jsonl
```

If the process name is different, attach by pid:

```bash
frida -U -p <pid> \
  -l extracted/reports/frida_capture_current_material_source_program.js \
  | tee extracted/reports/material_source_program_capture.jsonl
```

## Summarize And Refresh The Gate

```bash
npm run material:capture:summary --silent
```

Or rebuild targets and summary together:

```bash
npm run material:capture:refresh --silent
```

The summary writes:

- `extracted/reports/current_native_material_source_program_capture_summary.json`
- `extracted/reports/current_native_material_source_program_capture_summary.tsv`
- `extracted/viewer/current-native-material-source-program-capture-summary.json`

The sampler gate writes:

- `extracted/reports/current_native_material_sampler_ownership_gate_audit.json`
- `extracted/reports/current_native_material_sampler_ownership_gate_audit.tsv`
- `extracted/viewer/current-native-material-sampler-ownership-gate-audit.json`

Refreshing Electron should then update `source/program 捕获结果` and `sampler 归属总门槛`.

## Review Gates

A capture is not ready just because hooks fired. It remains diagnostic-only unless all of these gates close:

- target events include `eventId` and `threadId`
- event ids are unique and strictly increasing in log order
- no hook emits `material-source-program-capture-limit`
- resource-list snapshots are present and not truncated
- decoded source table snapshots are present and not truncated
- mounted type4 table evidence is present
- texture registration, lookup, and type4 patch rows close on the same runtime object
- patch sampler unit and source-key hash match the static shadergraph sampler identity table

Even a review-ready capture does not automatically promote renderer takeover. Material rendering still requires explicit recovered ownership and shader/texture formula gates.
