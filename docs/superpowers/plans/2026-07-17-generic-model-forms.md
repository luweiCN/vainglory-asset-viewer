# Generic Multi-Form Model Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not use subagents for this workspace task.

**Goal:** Replace the Tank SAW-only form selector with a verified, data-driven form system for Tank SAW, Baron Heli, and Skye Bike.

**Architecture:** A small pure module owns verified skin profiles and triangle classification. `app.js` prepares per-form index buffers, drives the generic selector, selects exact inspection animations, and leaves the existing native animation visibility path untouched in “follow animation” mode.

**Tech Stack:** Browser ES modules, Three.js `BufferAttribute`/`SkinnedMesh`, existing native animation and runtime-form visibility data.

## Global Constraints

- Do not run the project test suite, bulk resource scans, or CPU-heavy generation commands.
- Verification is limited to `node --check`, one-file structure checks for the three target GLBs, and user inspection after `View → Reload`.
- Do not create inferred forms for unverified skins, weapons, thrones, summons, or effects.
- Do not invent a Tank SAW animation or finished texture.
- The workspace is not a Git repository, so there are no commit steps.
- Do not use subagents.

---

### Task 1: Add verified form profiles and pure triangle classification

**Files:**
- Create: `extracted/viewer/model-form-profiles.js`

**Interfaces:**
- Produces: `MODEL_FORM_MODE`, `modelFormProfileForSkinId(skinId)`, and `splitModelFormIndexArrays(input)`.
- Consumes: only plain values and Three.js-compatible buffer attributes passed by `app.js`; the module itself has no DOM or Three.js dependency.

- [ ] **Step 1: Create the verified profile table**

Implement profiles keyed by the existing skin IDs:

```js
export const MODEL_FORM_MODE = Object.freeze({
  FOLLOW: "follow",
  PRIMARY: "primary",
  ALTERNATE: "alternate",
  BOTH: "both",
});

const MODEL_FORM_PROFILES = new Map([
  [
    "SAW_Skin_Tank",
    {
      skinId: "SAW_Skin_Tank",
      strategy: "geometry",
      defaultMode: MODEL_FORM_MODE.PRIMARY,
      supportsFollowAnimation: false,
      primaryLabel: "人形",
      alternateLabel: "坦克形态",
      alternateBoneHashes: ["4A59660D"],
      primaryAnimationPath: "Characters/SAW/Art/saw.idle.anim",
      alternateAnimationPath: "",
    },
  ],
  [
    "Baron_Skin_Heli",
    {
      skinId: "Baron_Skin_Heli",
      strategy: "animation",
      defaultMode: MODEL_FORM_MODE.FOLLOW,
      supportsFollowAnimation: true,
      primaryLabel: "人形",
      alternateLabel: "直升机形态",
      primaryAnimationPath: "Characters/Hero019/Art/hero019.idle.anim",
      alternateAnimationPath: "Characters/Hero019/Art/hero019.heli_ability02_idle.anim",
    },
  ],
  [
    "Skye_Skin_Bike",
    {
      skinId: "Skye_Skin_Bike",
      strategy: "animation",
      defaultMode: MODEL_FORM_MODE.FOLLOW,
      supportsFollowAnimation: true,
      primaryLabel: "机甲形态",
      alternateLabel: "摩托车形态",
      primaryAnimationPath: "Characters/Skye/Art/skye.bike_idle.anim",
      alternateAnimationPath: "Characters/Skye/Art/skye.bike_sprint.anim",
    },
  ],
]);

export function modelFormProfileForSkinId(skinId) {
  return MODEL_FORM_PROFILES.get(String(skinId || "")) || null;
}
```

- [ ] **Step 2: Add pure triangle classification**

Implement exact dominant-joint classification. Non-contiguous triangles are supported by creating filtered typed arrays; a triangle influenced by both sides invalidates manual form separation.

```js
function attributeComponent(attribute, index, component) {
  if (component === 0) return attribute.getX(index);
  if (component === 1) return attribute.getY(index);
  if (component === 2) return attribute.getZ(index);
  if (component === 3) return attribute.getW(index);
  return 0;
}

function dominantJointIndex(skinIndex, skinWeight, vertexIndex) {
  const components = Math.min(4, skinIndex.itemSize, skinWeight.itemSize);
  let jointIndex = null;
  let jointWeight = 0;
  for (let component = 0; component < components; component += 1) {
    const weight = Number(attributeComponent(skinWeight, vertexIndex, component)) || 0;
    if (weight <= jointWeight) continue;
    jointIndex = Math.round(attributeComponent(skinIndex, vertexIndex, component));
    jointWeight = weight;
  }
  return jointIndex;
}

export function splitModelFormIndexArrays({ index, skinIndex, skinWeight, alternateBoneIndices }) {
  if (!index || !skinIndex || !skinWeight || !(alternateBoneIndices instanceof Set)) return null;
  const primary = [];
  const alternate = [];
  for (let cursor = 0; cursor + 2 < index.count; cursor += 3) {
    const triangle = [index.getX(cursor), index.getX(cursor + 1), index.getX(cursor + 2)];
    const alternateVertices = triangle.filter((vertexIndex) =>
      alternateBoneIndices.has(dominantJointIndex(skinIndex, skinWeight, vertexIndex)),
    ).length;
    if (alternateVertices > 0 && alternateVertices < 3) return null;
    (alternateVertices === 3 ? alternate : primary).push(...triangle);
  }
  const IndexArray = index.array.constructor;
  return {
    original: index.array.slice(),
    primary: IndexArray.from(primary),
    alternate: IndexArray.from(alternate),
  };
}
```

- [ ] **Step 3: Run a syntax check for the new module**

Run:

```bash
node --check extracted/viewer/model-form-profiles.js
```

Expected: exit code `0` and no output.

### Task 2: Replace the SAW-only runtime with the generic form controller

**Files:**
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/viewer/index.html`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: generic `syncModelFormControls()`, `syncModelFormGeometry()`, and `selectModelFormMode()` behavior used during model load and selector changes.

- [ ] **Step 1: Import the generic form module**

Add to `app.js` imports:

```js
import {
  MODEL_FORM_MODE,
  modelFormProfileForSkinId,
  splitModelFormIndexArrays,
} from "./model-form-profiles.js";
```

Remove `SAW_TANK_BONE_NAME`, `SAW_TANK_MODEL_LABEL`, `isSawTankModel`, `dominantSkinJointAtVertex`, `sawTankFormRanges`, `syncSawTankFormControls`, `syncSawTankPreviewForm`, and the Tank-only effect gate. Keep the independent SAW knife fix.

- [ ] **Step 2: Prepare cached form index buffers for the active model**

Add these responsibilities to focused helpers in `app.js`:

```js
function activeModelFormProfile(item = activeManifestItem) {
  return modelFormProfileForSkinId(modelSkinId(item));
}

function prepareActiveModelFormRuntime(item = activeManifestItem) {
  const profile = activeModelFormProfile(item);
  if (!activeObject || !profile) return null;
  if (profile.strategy === "animation") return { profile, entries: [], mode: profile.defaultMode };
  if (profile.strategy !== "geometry") return null;
  const bones = firstActiveSkinnedSkeletonBones();
  const alternateHashes = new Set(profile.alternateBoneHashes);
  const boneIndexByBone = new Map();
  const alternateRootBoneIndices = new Set();
  bones.forEach((bone, boneIndex) => {
    boneIndexByBone.set(bone, boneIndex);
    if (alternateHashes.has(String(bone?.name || "").toUpperCase())) alternateRootBoneIndices.add(boneIndex);
  });
  if (alternateRootBoneIndices.size !== alternateHashes.size) return null;
  const alternateBoneIndices = new Set();
  bones.forEach((bone, boneIndex) => {
    let ancestor = bone;
    while (ancestor) {
      const ancestorIndex = boneIndexByBone.get(ancestor);
      if (alternateRootBoneIndices.has(ancestorIndex)) {
        alternateBoneIndices.add(boneIndex);
        break;
      }
      ancestor = ancestor.parent;
    }
  });

  const entries = [];
  let primaryIndexCount = 0;
  let alternateIndexCount = 0;
  activeObject.traverse((mesh) => {
    if (!mesh.isSkinnedMesh || !mesh.geometry?.index) return;
    const split = splitModelFormIndexArrays({
      index: mesh.geometry.index,
      skinIndex: mesh.geometry.getAttribute("skinIndex"),
      skinWeight: mesh.geometry.getAttribute("skinWeight"),
      alternateBoneIndices,
    });
    if (!split) {
      entries.length = 0;
      entries.invalid = true;
      return;
    }
    primaryIndexCount += split.primary.length;
    alternateIndexCount += split.alternate.length;
    entries.push({ mesh, split });
  });
  if (entries.invalid || !primaryIndexCount || !alternateIndexCount) return null;

  for (const entry of entries) {
    entry.mesh.geometry = entry.mesh.geometry.clone();
    entry.indices = {
      original: new THREE.BufferAttribute(entry.split.original, 1),
      primary: new THREE.BufferAttribute(entry.split.primary, 1),
      alternate: new THREE.BufferAttribute(entry.split.alternate, 1),
    };
  }
  return { profile, entries, mode: profile.defaultMode };
}
```

When implementing, use a local `invalid` boolean instead of attaching an ad-hoc property to the array if that reads more clearly; behavior must remain identical.

- [ ] **Step 3: Generate selector options from the profile**

Replace static SAW options with dynamic options:

```js
function syncModelFormControls(item = activeManifestItem) {
  const runtime = activeObject?.userData?.modelFormRuntime || null;
  modelFormControls.hidden = !runtime;
  modelFormSelect.disabled = !runtime;
  modelFormSelect.replaceChildren();
  if (!runtime) return;
  const { profile } = runtime;
  if (profile.supportsFollowAnimation) modelFormSelect.appendChild(new Option("跟随动作", MODEL_FORM_MODE.FOLLOW));
  modelFormSelect.appendChild(new Option(profile.primaryLabel, MODEL_FORM_MODE.PRIMARY));
  modelFormSelect.appendChild(new Option(profile.alternateLabel, MODEL_FORM_MODE.ALTERNATE));
  if (profile.strategy === "geometry") {
    modelFormSelect.appendChild(new Option("同时显示（原始资源）", MODEL_FORM_MODE.BOTH));
  }
  modelFormSelect.value = profile.defaultMode;
}
```

Update the HTML help text to explain that released skins follow original actions by default while incomplete resources use manual inspection. Start the `<select>` with one disabled placeholder option because JavaScript now owns the actual options.

- [ ] **Step 4: Apply form indices and exact inspection animations**

Implement mode application:

```js
function syncModelFormGeometry() {
  const runtime = activeObject?.userData?.modelFormRuntime;
  if (!runtime) return;
  const key = runtime.mode === MODEL_FORM_MODE.PRIMARY
    ? "primary"
    : runtime.mode === MODEL_FORM_MODE.ALTERNATE
      ? "alternate"
      : "original";
  for (const entry of runtime.entries) entry.mesh.geometry.setIndex(entry.indices[key]);
  activeObject.updateMatrixWorld(true);
}

function selectModelFormInspectionAnimation(path) {
  if (!path) return false;
  const animationIndex = activeAnimations.findIndex((animation) => animation.targetRelativePath === path);
  if (animationIndex < 0) return false;
  animationSelect.value = String(animationIndex);
  manualAnimationTime = 0;
  poseClock.start();
  syncAnimationStats();
  return true;
}

function selectModelFormMode(mode) {
  const runtime = activeObject?.userData?.modelFormRuntime;
  if (!runtime) return;
  runtime.mode = mode;
  if (mode === MODEL_FORM_MODE.PRIMARY) {
    selectModelFormInspectionAnimation(runtime.profile.primaryAnimationPath);
  } else if (mode === MODEL_FORM_MODE.ALTERNATE) {
    selectModelFormInspectionAnimation(runtime.profile.alternateAnimationPath);
  } else if (mode === MODEL_FORM_MODE.BOTH) {
    poseLoopToggle.checked = false;
    applyAnimationPose(0);
  }
  syncModelFormGeometry();
  syncPreviewEffectVisibility();
  syncBaseStats();
  frameObject(activeObject, { resetCamera: true });
}
```

For `FOLLOW`, restore original indices and leave the currently selected animation untouched. In the ordinary animation selector change handler, set the runtime mode and selector value to `FOLLOW` only when the profile supports it, then restore original indices before applying the selected action.

- [ ] **Step 5: Wire model loading and remove double implementation**

In `setActiveObject`, after `prepareSkinnedMeshBones(activeObject)` and after the object becomes active:

```js
activeObject.userData.modelFormRuntime = prepareActiveModelFormRuntime(manifestItem);
syncModelFormControls(manifestItem);
syncModelFormGeometry();
```

Keep Tank SAW defaulting to primary. Baron and Skye default to follow-animation. Ensure `resetViewerControlsForModel()` clears and hides the generic selector.

Change the selector listener to:

```js
modelFormSelect.addEventListener("change", () => {
  selectModelFormMode(modelFormSelect.value);
});
```

- [ ] **Step 6: Bump the app module cache key and check syntax**

Change the `app.js` query value in `index.html` to a new `20260717-generic-model-forms` key.

Run:

```bash
node --check extracted/viewer/model-form-profiles.js
node --check extracted/viewer/app.js
```

Expected: both commands exit `0` with no output.

### Task 3: Lightweight target verification and user handoff

**Files:**
- Inspect only: the three target GLBs and the two modified JavaScript modules.

**Interfaces:**
- Consumes: the completed generic controller.
- Produces: fresh verification evidence and exact manual inspection instructions.

- [ ] **Step 1: Verify the target resource evidence**

Run a read-only Node command against Tank SAW:

```text
Characters/SAW/Art/saw_tank.glb
```

Expected:

- at least one primary triangle;
- at least one alternate triangle;
- zero mixed triangles.

Then query `extracted/viewer/skin-animation-bindings.json` and confirm these exact paths are present with `trackMatchesSkeleton=true`:

```text
Characters/Hero019/Art/hero019.idle.anim
Characters/Hero019/Art/hero019.heli_ability02_idle.anim
Characters/Skye/Art/skye.bike_idle.anim
Characters/Skye/Art/skye.bike_sprint.anim
```

- [ ] **Step 2: Confirm the client remains running without launching another instance**

Run:

```bash
ps -axo pid,pcpu,command | rg '[E]lectron|[e]lectron:start'
```

Expected: the existing `npm run electron:start` and Electron processes remain present. Do not restart or duplicate them.

- [ ] **Step 3: Hand off manual visual verification**

Ask the user to choose `View → Reload`, then check:

1. Tank SAW: defaults to human; tank and raw-both options work.
2. Baron Heli: defaults to follow-animation; human and helicopter inspection modes select the exact idle actions.
3. Skye Bike: defaults to follow-animation; human and motorcycle inspection modes select the exact idle actions.
4. Selecting an ordinary animation on Baron or Skye returns the form selector to follow-animation.

Do not claim the visual result is verified until the user reports what is visible in the running client.
