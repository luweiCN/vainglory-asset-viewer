# Runtime Key Selector Capture

This diagnostic pipeline captures the original GameKindred runtime selector that static analysis cannot recover from the extracted packages alone.

It is intentionally non-rendering. Do not use this output to change the viewer until the captured events prove the active preview path all the way through:

1. `0x8befac` receives a concrete cached key from `0xbebf54/0xbec044`.
   Or the object-builder B path observes `0x03f3` payload parsing followed by the `0xc04b98` Level setup helper.
2. The same runtime sequence invokes the `Level` setup callback path (`0xc79ad4`, descriptor slot `0x2ae61c8`, hash `0x858E20D4`).
3. The `Level -> LevelVisualsRef -> LevelVisuals -> LevelVisuals +0x50` loader chain fires for the preview payload.

## Capture

Run the script against the original Android `libGameKindred.so` process and save stdout as JSONL:

```bash
frida -U -n GameKindred \
  -l extracted/reports/frida_dump_runtime_key_selector.js \
  | tee extracted/reports/runtime_key_selector_capture.jsonl
```

If the package name is different on the device, attach by process id instead:

```bash
frida -U -p <pid> \
  -l extracted/reports/frida_dump_runtime_key_selector.js \
  | tee extracted/reports/runtime_key_selector_capture.jsonl
```

Expected startup record:

```json
{"type":"runtime_key_selector_begin","moduleName":"libGameKindred.so"}
```

Important event names:

- `global-key-setter` / `global-key-setter-leave`: a runtime key is written to the global selected-key string slot. The leave event includes `globalsAfter` so the in-place string object at `0x3051220` can be checked directly.
- `global-key-setter` / `global-key-resolver` / `post-accessor-return` include `callerClassification` when the hook return address matches an opcode-audited current-binary caller. Known classifications are `typed-object-runtime-key-selection-0x046f`, `typed-object-inline-key-writer-0x03e9`, `character-lobby-key-switch`, `level-definition-manifest-cache-refresh`, `typed-object-vgr-manifest-input-setup`, `settings-preferred-build-path`, and `runtime-request-resolved-key-level-setup-query`.
- `global-key-resolver`: the global selected key is resolved/cached.
- `typed-object-046f-payload-helper-enter` / `typed-object-046f-payload-helper-leave`: the decoded `0x046f` payload helper records payload `+0x0` key, `+0x40` float/time, `+0x44` flag, and before/after global key state.
- `typed-object-046f-key-selection-enter` / `typed-object-046f-key-selection-leave`: the stream/timed runtime-key switch enters and leaves `0x8bf530`. The leave event includes `globalsAfter`, so it can be compared against a later `active-helper-8befac` event.
- `typed-object-03e9-inline-key-writer` / `typed-object-03e9-inline-key-writer-leave`: the inline key writer records payload `+0x20` and before/after global key state.
- `typed-object-03f3-object-builder-b-parser`: object-builder B input parsing records payload word0/word1 and raw bytes before the Level setup helper.
- `object-builder-b-helper-c04b98`: object-builder B reaches the Level setup helper with a concrete key argument and payload count.
- `active-helper-8befac`: the remaining active preview candidate dispatches the cached key.
- `level-setup-registered-callback`: the `Level` setup callback fired.
- `level-visuals-loader`: the loader walked `Level +0x10 -> LevelVisualsRef`. The event now records the Level pointer and a bounded list of `LevelVisualsRef +0` string keys.
- `level-visuals-apply-processor`: the processor received a concrete `LevelVisuals*`. The event records the LevelVisuals pointer, a raw prefix, and the `LevelVisuals +0x50` profile payload pointer as a C-string candidate.
- `lightfield-profile-loader-candidate`: the profile/lightfield loader candidate fired. The event records the request key/string from arg0, a bounded raw prefix of arg1, and the arg2 status value.

## String Evidence

The capture script uses the current Android binary's string layout, not a guessed decoder:

- `0x7fc97c` constructs a libc++ string from a C string. Short strings store `tag = length * 2` at byte `0`, then bytes at `object + 1`; long strings store `capacity | 1` at `object + 0`, length at `object + 8`, and the heap pointer at `object + 0x10`.
- `0x7ff290` copies that same libc++ string layout.
- `0xbebf7c` receives a libc++ string object and copies it into the global string object at `0x3051220`.
- `0xbebf9c` resolves the global string object and stores the resolved object pointer at `0x3051218`.
- `0xc72dc8` is the current-package resource-table resolver bridge used by `0xbebf9c`: it reads the global resource registry root, forwards the input string through `0x188cc88`, and stores the `0x188f8f8` matched-node payload return value from node `+0x28`.
- The resource-table root itself is a shared global at `0x30afbe8`. Current-package constructors/destructor publish and clear that slot and initialize root fields `+0x28`, `+0x30`, `+0x38`, and `+0x40`. This proves resolver ownership, not the active preview selector.
- Resource-table lookup is now bounded further: owner `+0x30` is the hash array, `+0x38` is the entry count, and `+0x40` is the entry vector. The by-id payload bridge reads selected entry `+0` as the key before resolver dispatch, while the typed lookup uses the resolver descriptor output and compares descriptor `+0x4` against the expected descriptor `+0x4`.
- `0xbe3a4c` reads the same resolved object through `0xbebf54` and copies resolved object `+0x8` as the pre-owner request key string.
- `0xbec044` returns the runtime dispatch key pointer from resolved object `+0x20`.
- `0x8bef18` proves the dispatch helper key argument can be tagged: short strings are passed as `stringObjectPointer | 1`; long strings are passed as a plain C string pointer.

Because of this, `0x3051220` must be read as an in-place string object, while `0x3051218` must be read as a resolved object with at least two key fields: pre-owner request key at `+0x8`, and Level setup dispatch key at `+0x20`.

## LevelVisuals Evidence

The capture script records the LevelVisuals fields only where the current Android binary proves them:

- `0x8cbf40` stores `x1` as the active `Level*`, reads `Level +0x10`, walks the LevelVisualsRef pointer array, and reads each ref key from `ref +0`.
- `0x8cc27c` stores `x1` as the active `LevelVisuals*`, then later reads `LevelVisuals +0x50` before calling the profile/lightfield loader candidate.
- `0xe36f38` receives the selected profile request as arg0, forwards arg1 as the secondary payload, and forwards arg2 as a status/int value.

These fields are capture evidence only. They should be compared against the active-helper sequence before any Electron renderer or light-profile change.

## Summarize

```bash
node extracted/tools/runtime_key_selector_capture_summary.js \
  --input extracted/reports/runtime_key_selector_capture.jsonl
```

If no capture JSONL has been produced yet, run the same command without `--input`:

```bash
node extracted/tools/runtime_key_selector_capture_summary.js
```

That still writes a stable missing-capture summary with `captureImported: false` and
`captureStatus: "runtime-selector-capture-missing"`, so downstream reports and the
viewer can show the real blocker instead of treating the capture as imported.

This writes:

- `extracted/reports/runtime_key_selector_capture_summary.json`
- `extracted/reports/runtime_key_selector_capture_summary.tsv`
- `extracted/viewer/runtime-key-selector-capture-summary.json`

The summary field `rendererProfileTakeoverAllowedByThisCapture` is deliberately false. A capture can mark `runtimeCaptureReadyForManualReview: true`, but that only means the sequence is complete enough to inspect against the static Level/LevelVisuals schema. It is not an automatic viewer switch.

The summary also writes `callerCountsByEvent` and adds `callerClass`, `callerKind`, `callerOffset`, `callerClassified`, `payloadPointer`, `payloadWord0NativeHex`, and `payloadWord0BigEndianHex` columns to the TSV. These fields are source attribution only. A key from a classified setter/resolver is not active preview evidence unless it also appears in a ready `active-helper-8befac -> Level setup -> LevelVisuals -> profile` sequence or a ready `0x03f3 object-builder B -> 0xc04b98 -> Level setup -> LevelVisuals -> profile` sequence.

Each `activeHelperSequences[]` row also contains `upstreamKeyEvents`, `upstreamKeySourceRecovered`, and `upstreamCallerClasses`. These are built only from earlier events in the same active-helper window whose recovered key exactly matches the active helper key. `readySequenceWithUpstreamSourceCount` is useful review context, but it does not replace manual verification that the ready sequence selected the preview payload.

The review gate is sequence-based. `runtimeCaptureReadyForManualReview` becomes true when either sequence is complete.

For the active-helper route, one `active-helper-8befac` event must have a recovered key and be followed, before the next `active-helper-8befac`, by:

1. `level-setup-registered-callback`
2. `level-visuals-loader`
3. `lightfield-profile-loader-candidate`

For the object-builder B route, one `typed-object-03f3-object-builder-b-parser` event must be followed, before the next parser event, by:

1. `object-builder-b-helper-c04b98`
2. `level-setup-registered-callback`
3. `level-visuals-loader`
4. `lightfield-profile-loader-candidate`

Events that appear before the current sequence, or after a different sequence boundary, are reported but do not open the review gate.

## Safety Rules

- Do not replace the active profile with `MapViewer_5v5` or any static profile unless the runtime capture proves it is the selected preview payload.
- Do not use `.vgr` / replay stream events as active preview evidence by themselves.
- Do not apply captured keys to the Electron viewer until the Level setup and LevelVisuals loader events are present in the same capture.
- If only `global-key-setter` or `global-key-resolver` fires, the capture is useful for tracing, but renderer takeover remains closed.
