# Vainglory Model Viewer

Run from the `extracted` directory:

```bash
python3 -m http.server 8765 -d extracted
```

Open:

```text
http://127.0.0.1:8765/viewer/
```

The viewer reads `viewer/skinned-glb-pbr-manifest.json`,
`viewer/textured-glb-pbr-manifest.json`, `viewer/textured-glb-mtl-manifest.json`,
`viewer/glb-manifest.json`, `viewer/obj-manifest.json`,
`viewer/runtime-binding-config.json`, `viewer/runtime-attachment-bones.json`,
`viewer/effect-hook-runtime-manifest.json`, and
`viewer/effect-pfx-resource-manifest.json`, and
`viewer/effect-shadergraph-material-manifest.json`.
It loads skinned PBR GLB files from `hero_assets_glb_skinned_pbr/` by
default, with static PBR-enhanced GLB files from `hero_assets_glb_textured_pbr/`,
older textured GLB files from `hero_assets_glb_textured_mtl/`, neutral GLB
files from `hero_assets_glb/`, and OBJ files from `hero_assets_obj/` available
from the Static source selector after choosing the Static model category.

Notes:

- Select one skin or model part at a time. Do not load all skins for a hero at once.
- Use the Dynamic model category for skinned GLB playback and the Static model category for material, legacy GLB, raw GLB, or OBJ inspection.
- The hero/search field uses `viewer/hero-catalog.json`, generated from decoded CFF0 definition evidence, so internal folders such as `Hero010` are shown as their recovered hero names where the package data exposes them.
- PBR GLB files contain recovered geometry, UVs, material primitives, base color textures, recovered normal maps when shadergraph roles are identifiable, roughness maps derived from the original specular mask channel, and emissive/alpha settings for explicit glow-like materials.
- This is still a preview reconstruction. It does not yet restore exact original shader equations, skeletons, animation, or VFX.
- Some materials may still look too flat or too glossy because Vainglory's reflection/ramp lighting shader is only approximated in standard glTF PBR.
- Lighting defaults to `Neutral`, with lower exposure and Bloom disabled, so texture placement and material color can be inspected without exaggerated highlights.
- Use `Game` lighting plus the Bloom toggle when checking glow-like skins against a more dramatic in-game style. Use `Flat` lighting when inspecting texture alignment with minimal specular/reflection influence.
- The Bloom toggle adds a lightweight preview-only glow pass. It does not modify exported GLB files.
- The Effects toggle is disabled by default and hides preview-only `swipe`, `trail`, `slash`, and `guob` material ranges so idle hero poses are framed around the character mesh instead of attack trails or ground/base helpers. Enable it when inspecting those recovered effect surfaces.
- The viewer import map uses jsDelivr for Three.js modules; unpkg was unreliable in headless QA due closed TLS/QUIC connections.
- The Bones toggle overlays recovered skeleton JSON on top of matching models. For skins without an exact skeleton, the viewer falls back to the base hero skeleton when available.
- `Skinned GLB` files contain standard glTF `JOINTS_0`, `WEIGHTS_0`, `skins`, skeleton nodes, and inverse bind matrices decoded directly from the original `.mesh` and `.skeleton` files. RSC0 mesh joint attributes are little-endian `uint16` local draw-range palette indices, remapped through each recovered palette before GLB export.
- The animation selector now defaults to the `Idle` clip when a compatible idle animation exists, instead of the first action clip in the recovered binding list.
- `Native Loop` is enabled by default for skinned previews. When enabled, it plays decoded native family-3 `.anim` frames through the recovered skinned GLB skeleton. The safe native-translation set is seeded from recovered runtime bind slots and `viewer/runtime-attachment-bones.json`, so detached weapon, shield, wing, and armor root bones keep their animation translations instead of staying at bind-pose offsets. The viewer samples each loaded clip at multiple points and automatically chooses all-bone, safe-bone, or no native translations based on whether translation expands the skinned bounds beyond the bind pose tolerance. Clips where all-bone and safe-bone translations trade off across sampled frames use a dynamic per-frame choice. Disable Native Loop to inspect the bind pose. Scale channels remain disabled in live playback until unsafe near-zero scale tracks are fully classified.
- Skeleton-compatible `.anim` files can now use track-order pose mapping. Track-order bones with large bind-translation drift, unsafe scale values, or high-rotation leaf/helper drift are marked ambiguous and skipped by the live mesh drive to avoid stretching attachment/special bones.
- For example, Ringo Idle has 76 matched transform records and 59 reliable pose bones for the 76-bone skeleton. Ringo `AchillesCut` / `ability01` has 57 reliable pose bones, which still meets the viewer's skinned-pose coverage threshold.
- Sparse pose recoveries still keep `Skinned GLB` models in bind pose to avoid partial-bone distortion where vertices appear to move around the wrong points.
- UVs are exported in the original mesh orientation. Do not flip V when building GLB previews from these OBJ files.
- Use the wireframe toggle to inspect whether geometry is sane.

Generated data:

- `hero_assets_glb_skinned_pbr/`: GLB files with PBR materials plus standard glTF skin joints, weights, skeleton nodes, and inverse bind matrices.
- `hero_assets_glb_textured_pbr/`: GLB files with material-split base color, normal, roughness, emissive, and alpha-blend material settings.
- `hero_assets_skeletons_json/`: decoded skeleton hierarchy and local bind transforms.
- `hero_assets_glb_textured_mtl/`: GLB files with material-split preview base color textures.
- `hero_assets_obj_mtl/`: OBJ files with `usemtl` groups recovered from mesh draw ranges.
- `hero_assets_material_textures_preview/`: decoded per-shadergraph preview PNG textures.
- `hero_assets_textures_preview/`: decoded per-mesh fallback preview PNG textures.
- `reports/preview_texture_map.tsv`: mesh to shadergraph and texture hash mapping.
- `reports/material_texture_map.tsv`: shadergraph to texture hash mapping.
- `reports/material_texture_roles.tsv`: shadergraph sampler role mapping for base color, normal, reflection, roughness, and emissive outputs.
- `reports/skeleton_summary.tsv`: skeleton bone counts, root counts, and JSON paths.
- `reports/mesh_skin_summary.tsv`: mesh skin channel coverage, max joint index, and weight validity.
- `viewer/skinned-glb-pbr-manifest.json`: viewer-ready manifest for skinned GLB previews.
- `viewer/skeleton-manifest.json`: skeleton JSON manifest used by the viewer.
- `viewer/runtime-attachment-bones.json`: runtime attachment/root-prop bone indices used by the viewer's safe native-translation path.
- `viewer/effect-hook-runtime-manifest.json`: recovered native runtime effect-hook evidence, including `boneToken -> effectToken`, `.pfx` resource candidates, visibility/callback flags, and resolved ability-slot context where available.
- `viewer/effect-pfx-resource-manifest.json`: decoded `.pfx` internal resource references, including virtual `Surface[n].shadergraph` refs used to audit recovered VFX material surfaces.
- `viewer/effect-shadergraph-material-manifest.json`: decoded VFX `Surface[n].shadergraph` sampler, texture-hash, material-role, and `materialStatus` links, joined back to `.pfx` resources and runtime effect hooks.
- `tools/material_roles.js`: shadergraph sampler/hash role parser.
- `tools/skeleton_tools.js`: skeleton and mesh skin parser.
- `tools/export_skeleton_reports.js`: skeleton JSON and skin report exporter.
- `tools/extract_preview_textures.js`: PVRTC texture extraction and material role output.
