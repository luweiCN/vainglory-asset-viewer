# Fortress 狼群召唤物原生材质与标签 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从真实 shadergraph 证据恢复 Fortress T3 狼群召唤物的无光照动态能量材质，并在查看器列表中明确标注友方/敌方召唤物。

**Architecture:** 材质清单生成器先把现有 `viewDotRamp` 与已解析的 `floorFractAtlasOffset` 证据连接成一个严格校验的 `animatedNoiseComposite`；查看器随后用单个 `onBeforeCompile` patch 执行完整公式并复用统一时间入口。UI 标签由独立纯函数根据定义归属或已知 Hero015 pack 命名追加，不修改清单内部字段。

**Tech Stack:** Node.js CommonJS 清单工具、浏览器 ES modules、Three.js 0.160.0、Node 内置 `node:test`。

## Global Constraints

- 只恢复 shader 文本能够证明的 `baseWithRamp + baseWithRamp * animatedNoise.x * animatedScale`，不得按目标文件名硬编码颜色、倍率或速度；真实证据中 Ally scale 为 `5`、Enemy scale 为 `8`。
- Ally 保持青绿色渐变，Enemy 保持红橙色渐变；不得交换或统一阵营色。
- 噪声 UV repeat 固定来自 shader 证据 `[2, 2]`，时间项固定来自 `fract(time * 0.1)` 与 `fract(time * -0.75)`。
- 最终颜色绕过 MeshStandard PBR 光照，但继续通过 Three.js 的 tone mapping、色彩空间与雾处理。
- 不生成身体、四肢、额外头部或额外狼实例；`hero015_hell_t3.glb` 仍是独立的完整英雄本体。
- 不修改内部 `modelLabel`、资源路径、皮肤绑定、动画绑定或 Ally/Enemy 资源选择。
- 任一复合字段无法证明或校验失败时，保留现有普通 view-dot 输出，不猜测缺失值。
- 当前目录不是 Git 仓库（`git rev-parse --show-toplevel` 返回 128）；本计划不伪造 commit 步骤，改用定向测试与文件审查作为每个任务的检查点。

---

## File map

- `extracted/tools/material_runtime_pipeline_manifest.js`：从 shadergraph 与 sampler 绑定生成严格的动态噪声复合证据。
- `extracted/tests/material_runtime_pipeline_manifest.test.js`：用真实 Ally/Enemy GLB 与 shadergraph 回归证据结构和阵营渐变差异。
- `extracted/viewer/material-runtime-shaders.js`：校验证据、加载数据纹理、安装唯一 shader patch，并接入统一时间推进。
- `extracted/tests/material_runtime_shaders.test.js`：验证 uniforms、GLSL 公式、无光照输出覆盖和避免第二套 UV patch。
- `extracted/viewer/model-labels.js`：提供无 DOM 依赖的召唤物限定词与显示文本拼接函数。
- `extracted/tests/model_labels.test.js`：验证动画/静态清单、阵营与非召唤物边界。
- `extracted/viewer/app.js`：让 `displayVariant` 使用纯标签函数；现有搜索索引自动消费最终显示文本。
- `extracted/reports/material_runtime_pipeline.tsv`、`extracted/reports/material_runtime_pipeline_summary.json`、`extracted/viewer/material-runtime-pipeline-manifest.json`：由现有材质管线重建的生成物。

---

### Task 1: 从真实 shadergraph 生成动态噪声复合证据

**Files:**
- Modify: `extracted/tools/material_runtime_pipeline_manifest.js:1512-1600,2610-2650`
- Test: `extracted/tests/material_runtime_pipeline_manifest.test.js`

**Interfaces:**
- Consumes: `previewUvAnimationForMaterial(...)` 返回的 `floorFractAtlasOffset`、`samplerTextureBindings.paths`、既有 `viewDotRampFormulaClass(...)`。
- Produces: `viewDotRamp.animatedNoiseComposite`，结构为 `{ mode, sampler, texturePath, channel, uvRepeat, xTerms, yTerms, scale }` 或 `null`。

- [ ] **Step 1: 写入真实资源失败测试**

在 `extracted/tests/material_runtime_pipeline_manifest.test.js` 末尾加入：

```js
test("Fortress pack materials recover the native animated-noise composite", () => {
  const rels = [
    "Characters/Hero015/Art/hero015_hell_t3_packAlly.glb",
    "Characters/Hero015/Art/hero015_hell_t3_packEnemy.glb",
  ];
  const rows = buildMaterialRuntimePipelineRows({
    manifestItems: rels.map((rel) => ({
      rel,
      modelLabel: "Fortress_Skin_Hell_T3",
      character: "Hero015",
      sourceRelativePath: "Characters/Hero015/FortressMinion.def",
    })),
    glbRoot: path.resolve("extracted/hero_assets_glb_textured_pbr"),
  });

  assert.equal(rows.length, 2);
  const ramps = [];
  for (const row of rows) {
    const side = row.rel.includes("packAlly") ? "packAlly" : "packEnemy";
    const viewDotRamp = JSON.parse(row.viewDotRamp);
    ramps.push(viewDotRamp.rampHash);
    assert.deepEqual(viewDotRamp.animatedNoiseComposite, {
      mode: "base-plus-base-times-animated-noise",
      sampler: "sampler82",
      texturePath: `../hero_assets_material_textures_preview/Characters/Hero015/Art/hero015_hell_t3_${side}.hell_t3_${side}_mat.sampler-sampler82.png`,
      channel: "x",
      uvRepeat: [2, 2],
      xTerms: [{ kind: "fract", speed: 0.1, offset: 0 }],
      yTerms: [{ kind: "fract", speed: -0.75, offset: 0 }],
      scale: side === "packAlly" ? 5 : 8,
    });
  }
  assert.notEqual(ramps[0], ramps[1]);
});
```

- [ ] **Step 2: 运行测试确认按预期失败**

Run: `node --test extracted/tests/material_runtime_pipeline_manifest.test.js --test-name-pattern="Fortress pack materials"`

Expected: FAIL；`viewDotRamp.animatedNoiseComposite` 的 actual 为 `undefined`。

- [ ] **Step 3: 实现严格的证据连接器**

在 `viewDotRampForShadergraph` 之前加入以下完整辅助函数：

```js
function normalizedAnimatedNoiseTerms(terms) {
  if (!Array.isArray(terms) || terms.length < 1 || terms.length > 6) return null;
  const normalized = terms.map((term) => {
    const speed = Number(term?.speed);
    const offset = Number(term?.offset);
    if (term?.kind !== "fract" || !Number.isFinite(speed) || !Number.isFinite(offset)) return null;
    return { kind: "fract", speed, offset };
  });
  return normalized.every(Boolean) ? normalized : null;
}

function animatedNoiseCompositeForViewDotRamp(
  shaderText,
  viewDotSampler,
  formulaClass,
  previewUvAnimation,
  samplerTextureBindings,
) {
  if (formulaClass !== "base-plus-viewdot-ramp" || previewUvAnimation?.mode !== "floorFractAtlasOffset") return null;
  const baseUvSource = String(previewUvAnimation.baseUvSource || "");
  const offsetVariable = String(previewUvAnimation.offsetVariable || "");
  const uvRepeat = uvRepeatForVaryingSource(shaderText, baseUvSource);
  const xTerms = normalizedAnimatedNoiseTerms(previewUvAnimation.xTerms);
  const yTerms = normalizedAnimatedNoiseTerms(previewUvAnimation.yTerms);
  const phaseSource = String(previewUvAnimation.phaseSource || "");
  const phaseMatches = [...(previewUvAnimation.xTerms || []), ...(previewUvAnimation.yTerms || [])].every(
    (term) => !term?.phaseSource || term.phaseSource === phaseSource,
  );
  if (
    !uvRepeat ||
    uvRepeat.some((value) => !Number.isFinite(value) || Math.abs(value) < 0.000001 || Math.abs(value) > 64) ||
    !xTerms ||
    !yTerms ||
    !/^uniform:unif\d+$/.test(phaseSource) ||
    !phaseMatches ||
    !/^var\d+\.xy$/.test(baseUvSource) ||
    !/^tmpvar_\d+$/.test(offsetVariable)
  ) {
    return null;
  }

  const escapedViewDotSampler = escapeRegexLiteral(viewDotSampler);
  const viewDotAssignment = new RegExp(
    `\\b(tmpvar_\\d+)\\.xyz\\s*=\\s*\\(\\s*(tmpvar_\\d+)\\s*\\+\\s*texture2D\\s*\\(\\s*${escapedViewDotSampler}\\s*,[^;]+?\\)\\.xyz\\s*\\)\\s*;`,
    "s",
  ).exec(shaderText);
  if (!viewDotAssignment) return null;
  const baseWithRampVariable = viewDotAssignment[1];
  const baseInputVariable = viewDotAssignment[2];
  const baseSamplerMatch = new RegExp(
    `\\b${escapeRegexLiteral(baseInputVariable)}\\s*=\\s*texture2D\\s*\\(\\s*(sampler\\d+)\\s*,[^;]+?\\)\\.xyz\\s*;`,
    "s",
  ).exec(shaderText);
  if (!baseSamplerMatch) return null;

  const compositeMatch = new RegExp(
    `\\btmpvar_\\d+\\.xyz\\s*=\\s*\\(\\s*${escapeRegexLiteral(baseWithRampVariable)}\\.xyz\\s*\\+\\s*\\(\\(\\s*${escapeRegexLiteral(baseWithRampVariable)}\\.xyz\\s*\\*\\s*texture2D\\s*\\(\\s*(sampler\\d+)\\s*,\\s*\\(\\s*${escapeRegexLiteral(baseUvSource)}\\s*\\+\\s*${escapeRegexLiteral(offsetVariable)}\\s*\\)\\s*\\)\\.([xyzw])\\2\\2\\s*\\)\\s*\\*\\s*([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))\\s*\\)\\s*\\)\\s*;`,
    "s",
  ).exec(shaderText);
  if (!compositeMatch) return null;
  const sampler = compositeMatch[1];
  const channel = compositeMatch[2];
  const scale = Number(compositeMatch[3]);
  const texturePath = samplerTextureBindings?.paths?.[sampler] || "";
  if (
    sampler === viewDotSampler ||
    sampler === baseSamplerMatch[1] ||
    !texturePath ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    scale > 64
  ) {
    return null;
  }

  return {
    mode: "base-plus-base-times-animated-noise",
    sampler,
    texturePath,
    channel,
    uvRepeat,
    xTerms,
    yTerms,
    scale,
  };
}
```

把 `viewDotRampForShadergraph` 签名扩展为接收 `previewUvAnimation`：

```js
function viewDotRampForShadergraph(
  shaderBuffer,
  shaderText,
  runtimeSamplerRecords,
  samplerTextureBindings,
  uniformDefaults = {},
  previewUvAnimation = null,
) {
```

在既有 `rampHash` 声明后计算可选复合证据：

```js
  const animatedNoiseComposite = animatedNoiseCompositeForViewDotRamp(
    shaderText,
    sampler,
    formulaClass,
    previewUvAnimation,
    samplerTextureBindings,
  );
```

在其 return 对象的 `uvMaskRamp` 后按条件加入；证据不完整时不写出该字段：

```js
    ...(animatedNoiseComposite ? { animatedNoiseComposite } : {}),
```

在 `materialRuntimePipelineRowsForGlb` 中先计算 UV 证据，再计算 view-dot 证据：

```js
    const previewUvAnimation = shaderText
      ? previewUvAnimationForMaterial(shaderText, analysis?.roles || {}, analysis?.samplerToHash || {}, varyingSources, uniformDefaults)
      : null;
    const viewDotRamp = shaderBuffer
      ? viewDotRampForShadergraph(
          shaderBuffer,
          shaderText,
          runtimeSamplerRecords,
          samplerTextureBindings,
          uniformDefaults,
          previewUvAnimation,
        )
      : null;
```

删除该函数稍后位置原有的重复 `previewUvAnimation` 声明；其余消费者继续使用同一常量。

- [ ] **Step 4: 运行定向测试确认通过**

Run: `node --test extracted/tests/material_runtime_pipeline_manifest.test.js --test-name-pattern="Fortress pack materials"`

Expected: PASS，且两个阵营的 `rampHash` 不同。

- [ ] **Step 5: 运行整个清单生成器测试文件**

Run: `node --test extracted/tests/material_runtime_pipeline_manifest.test.js`

Expected: PASS；普通 view-dot 行仍不带可猜测的动态复合字段。

---

### Task 2: 在单一 shader patch 中执行原生动态能量公式

**Files:**
- Modify: `extracted/viewer/material-runtime-shaders.js:646-780,1937-1960`
- Test: `extracted/tests/material_runtime_shaders.test.js`

**Interfaces:**
- Consumes: Task 1 生成的 `evidence.viewDotRamp.animatedNoiseComposite`。
- Produces: `settings.animatedNoiseComposite`、`material.userData.characterUvRuntimeUniforms.characterUvRuntimeTime`，以及唯一的 view-dot/noise `onBeforeCompile` hook。

- [ ] **Step 1: 写入运行时失败测试**

在 `extracted/tests/material_runtime_shaders.test.js` 的 view-dot 测试后加入：

```js
test("view-dot runtime executes Fortress native animated-noise color without PBR lighting", async () => {
  const {
    advanceCharacterUvRuntime,
    applyCharacterUvAnimationRuntime,
    applyCharacterViewDotRampRuntime,
  } = await import("../viewer/material-runtime-shaders.js");
  const ramp = Array.from({ length: 64 }, (_unused, index) => {
    const value = index / 63;
    return [value * 0.1, value * 0.46, value * 0.42];
  });
  const loaded = [];
  const material = {
    roughness: 1,
    metalness: 1,
    envMapIntensity: 1,
    userData: {},
  };
  const evidence = {
    colorMode: "viewDotRamp",
    viewDotRampFormulaClass: "base-plus-viewdot-ramp",
    viewDotRampSourceKind: "inline-ramp",
    viewDotRamp: {
      mode: "viewDotRampFormula",
      formulaClass: "base-plus-viewdot-ramp",
      sourceKind: "inline-ramp",
      canRenderNatively: true,
      ramp,
      animatedNoiseComposite: {
        mode: "base-plus-base-times-animated-noise",
        sampler: "sampler82",
        texturePath: "../textures/fortress-pack-noise.png",
        channel: "x",
        uvRepeat: [2, 2],
        xTerms: [{ kind: "fract", speed: 0.1, offset: 0 }],
        yTerms: [{ kind: "fract", speed: -0.75, offset: 0 }],
        scale: 5,
      },
    },
    previewUvAnimation: {
      mode: "floorFractAtlasOffset",
      baseUvSource: "var3.xy",
      offsetVariable: "tmpvar_7",
      xTerms: [{ kind: "fract", speed: 0.1, offset: 0 }],
      yTerms: [{ kind: "fract", speed: -0.75, offset: 0 }],
    },
  };

  applyCharacterViewDotRampRuntime(material, evidence, (texturePath, kind) => {
    const texture = { texturePath, kind, flipY: true };
    loaded.push(texture);
    return texture;
  });

  assert.deepEqual(loaded, [{ texturePath: "../textures/fortress-pack-noise.png", kind: "data", flipY: false }]);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeTime.value, 0);
  const combinedHook = material.onBeforeCompile;
  applyCharacterUvAnimationRuntime(material, evidence);
  assert.equal(material.onBeforeCompile, combinedHook);

  advanceCharacterUvRuntime(material, 0.25);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeTime.value, 0.25);

  const shader = {
    uniforms: {},
    fragmentShader: "#include <map_fragment>\nvec3 outgoingLight = vec3(0.0);\n#include <opaque_fragment>",
  };
  material.onBeforeCompile(shader);

  assert.equal(shader.uniforms.characterViewDotAnimatedNoiseMap.value, loaded[0]);
  assert.equal(shader.uniforms.characterUvRuntimeTime.value, 0.25);
  assert.match(shader.fragmentShader, /vMapUv \* vec2\(2\.000000, 2\.000000\)/);
  assert.match(shader.fragmentShader, /fract\(0\.000000 \+ characterUvRuntimeTime \* 0\.100000\)/);
  assert.match(shader.fragmentShader, /fract\(0\.000000 \+ characterUvRuntimeTime \* -0\.750000\)/);
  assert.match(shader.fragmentShader, /texture2D\(characterViewDotAnimatedNoiseMap, characterViewDotNoiseUv\)\.x/);
  assert.match(
    shader.fragmentShader,
    /characterViewDotFinalColor = characterViewDotBaseWithRamp \+ characterViewDotBaseWithRamp \* characterViewDotNoise \* 5\.000000/,
  );
  assert.match(shader.fragmentShader, /outgoingLight = characterViewDotFinalColor;\s*#include <opaque_fragment>/);
});
```

- [ ] **Step 2: 运行测试确认按预期失败**

Run: `node --test extracted/tests/material_runtime_shaders.test.js --test-name-pattern="Fortress native animated-noise"`

Expected: FAIL；当前代码不会加载噪声纹理，也不会创建共享时间 uniform。

- [ ] **Step 3: 校验并加载动态噪声证据**

在 `viewDotRampSettings` 前加入：

```js
function normalizedViewDotAnimatedNoiseTerms(terms) {
  if (!Array.isArray(terms) || terms.length < 1 || terms.length > 6) return null;
  const normalized = terms.map((term) => {
    const speed = Number(term?.speed);
    const offset = Number(term?.offset);
    if (term?.kind !== "fract" || !Number.isFinite(speed) || !Number.isFinite(offset)) return null;
    return { kind: "fract", speed, offset };
  });
  return normalized.every(Boolean) ? normalized : null;
}

function viewDotAnimatedNoiseSettings(composite, loadTexture) {
  if (!composite) return null;
  const uvRepeat = Array.isArray(composite.uvRepeat) ? composite.uvRepeat.slice(0, 2).map(Number) : [];
  const xTerms = normalizedViewDotAnimatedNoiseTerms(composite.xTerms);
  const yTerms = normalizedViewDotAnimatedNoiseTerms(composite.yTerms);
  const scale = Number(composite.scale);
  const texturePath = String(composite.texturePath || "");
  const channel = String(composite.channel || "");
  const sampler = String(composite.sampler || "");
  if (
    composite.mode !== "base-plus-base-times-animated-noise" ||
    uvRepeat.length !== 2 ||
    uvRepeat.some((value) => !Number.isFinite(value) || Math.abs(value) < 0.000001 || Math.abs(value) > 64) ||
    !xTerms ||
    !yTerms ||
    !/^sampler\d+$/.test(sampler) ||
    !/^[xyzw]$/.test(channel) ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    scale > 64 ||
    !texturePath ||
    typeof loadTexture !== "function"
  ) {
    return null;
  }
  const texture = loadTexture(texturePath, "data");
  if (!texture) return null;
  texture.flipY = false;
  return {
    mode: composite.mode,
    sampler,
    texturePath,
    texture,
    channel,
    uvRepeat,
    xTerms,
    yTerms,
    scale,
  };
}
```

在 `viewDotRampSettings` 中先建立动态设置，并把它并入两种 source 返回值：

```js
  const animatedNoiseComposite =
    formulaClass === "base-plus-viewdot-ramp"
      ? viewDotAnimatedNoiseSettings(rampEvidence.animatedNoiseComposite, loadTexture)
      : null;
  const settings = {
    mode: rampEvidence.mode,
    formulaClass,
    sourceKind,
    rampHash: evidence?.viewDotRampHash || rampEvidence.rampHash || "",
    animatedNoiseComposite,
  };
```

- [ ] **Step 4: 用同一个 shader patch 计算完整公式**

用以下实现替换 `patchViewDotRampFragmentShader`：

```js
export function patchViewDotRampFragmentShader(fragmentShader, settings) {
  const sample = viewDotRampSampleFunction(settings);
  if (!sample) return fragmentShader;
  const animated = settings.animatedNoiseComposite;
  const noiseHeader = animated
    ? "uniform sampler2D characterViewDotAnimatedNoiseMap;\nuniform float characterUvRuntimeTime;"
    : "";
  const colorBody = animated
    ? `
vec3 characterViewDotBaseWithRamp = diffuseColor.rgb + characterViewDotRampColor;
vec2 characterViewDotNoiseUv = vMapUv * vec2(${glslNumber(animated.uvRepeat[0])}, ${glslNumber(animated.uvRepeat[1])}) + vec2(
  ${floorFractAtlasTermsExpression(animated.xTerms)},
  ${floorFractAtlasTermsExpression(animated.yTerms)}
);
float characterViewDotNoise = texture2D(characterViewDotAnimatedNoiseMap, characterViewDotNoiseUv).${animated.channel};
vec3 characterViewDotFinalColor = characterViewDotBaseWithRamp + characterViewDotBaseWithRamp * characterViewDotNoise * ${glslNumber(animated.scale)};
diffuseColor.rgb = characterViewDotFinalColor;
diffuseColor.a = 1.0;`
    : viewDotRampFormulaBody(settings);
  const mapBody = `
#include <map_fragment>
float characterViewDotRampDot = clamp(dot(normalize(vViewPosition), normalize(vNormal)), 0.0, 1.0);
vec3 characterViewDotRampColor = ${sample.sampleExpression};
${colorBody}
`;
  const patchedMap = fragmentShader.replace("#include <map_fragment>", mapBody);
  const patchedOutput = animated
    ? patchedMap.replace(
        "#include <opaque_fragment>",
        "outgoingLight = characterViewDotFinalColor;\n#include <opaque_fragment>",
      )
    : patchedMap;
  return `${sample.header}\n${noiseHeader}\n${patchedOutput}`;
}
```

在 `applyCharacterViewDotRampRuntime` 中创建稳定 uniforms，并让 hook 与统一时间入口共享它们：

```js
  const sample = viewDotRampSampleFunction(settings);
  const uniforms = { ...(sample?.uniforms || {}) };
  if (settings.animatedNoiseComposite) {
    uniforms.characterViewDotAnimatedNoiseMap = { value: settings.animatedNoiseComposite.texture };
    uniforms.characterUvRuntimeTime = { value: 0 };
  }
  material.userData ||= {};
  if (settings.animatedNoiseComposite) material.userData.characterUvRuntimeUniforms = uniforms;
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    previousOnBeforeCompile?.(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = patchViewDotRampFragmentShader(shader.fragmentShader, settings);
  };
```

把 cache key 的末尾扩展为动态证据的稳定序列化：

```js
    `character-view-dot-ramp:${settings.sourceKind}:${settings.formulaClass}:${settings.rampHash}:${settings.uvMaskRampHash || ""}:${settings.uniformColor?.join(",") || ""}:${JSON.stringify(settings.animatedNoiseComposite ? {
      sampler: settings.animatedNoiseComposite.sampler,
      texturePath: settings.animatedNoiseComposite.texturePath,
      channel: settings.animatedNoiseComposite.channel,
      uvRepeat: settings.animatedNoiseComposite.uvRepeat,
      xTerms: settings.animatedNoiseComposite.xTerms,
      yTerms: settings.animatedNoiseComposite.yTerms,
      scale: settings.animatedNoiseComposite.scale,
    } : null)}`,
```

在 `applyCharacterUvAnimationRuntime` 的现有诊断 early-return 后加入：

```js
  if (material?.userData?.characterViewDotRampRuntime?.animatedNoiseComposite) return material;
```

- [ ] **Step 5: 运行定向与完整运行时测试**

Run: `node --test extracted/tests/material_runtime_shaders.test.js --test-name-pattern="Fortress native animated-noise"`

Expected: PASS。

Run: `node --test extracted/tests/material_runtime_shaders.test.js`

Expected: PASS；既有普通 view-dot、UV animation 和材质状态测试不回归。

---

### Task 3: 为 Hero015 pack 增加纯显示限定词

**Files:**
- Create: `extracted/viewer/model-labels.js`
- Create: `extracted/tests/model_labels.test.js`
- Modify: `extracted/viewer/app.js:12-18,819-821`

**Interfaces:**
- Produces: `modelSummonQualifier(item): string` 与 `appendModelQualifier(label, item): string`。
- Consumes: 清单项已有的 `rel` 和 `sourceRelativePath`；不写入或改变传入对象。

- [ ] **Step 1: 创建标签失败测试**

创建 `extracted/tests/model_labels.test.js`：

```js
const assert = require("node:assert/strict");
const test = require("node:test");

test("Fortress pack labels identify ally, enemy, and unqualified summons", async () => {
  const { appendModelQualifier, modelSummonQualifier } = await import("../viewer/model-labels.js");
  const ally = {
    rel: "Characters/Hero015/Art/hero015_hell_t3_packAlly.glb",
    modelLabel: "Fortress_Skin_Hell_T3",
    sourceRelativePath: "Characters/Hero015/FortressMinion.def",
  };
  const enemy = {
    rel: "Characters/Hero015/Art/hero015_hell_t3_packEnemy.glb",
    modelLabel: "Fortress_Skin_Hell_T3",
  };
  const unqualified = {
    rel: "Characters/Hero015/Art/hero015_kirin_pack.glb",
  };
  const snapshot = structuredClone(ally);

  assert.equal(modelSummonQualifier(ally), "召唤物（友方）");
  assert.equal(modelSummonQualifier(enemy), "召唤物（敌方）");
  assert.equal(modelSummonQualifier(unqualified), "召唤物");
  assert.equal(appendModelQualifier("冥界要塞 / Netherworld Fortress", ally), "冥界要塞 / Netherworld Fortress · 召唤物（友方）");
  assert.deepEqual(ally, snapshot);
});

test("Fortress hero bodies and unrelated heroes keep their original labels", async () => {
  const { appendModelQualifier, modelSummonQualifier } = await import("../viewer/model-labels.js");
  const fortressBody = {
    rel: "Characters/Hero015/Art/hero015_hell_t3.glb",
    sourceRelativePath: "Characters/Hero015/Hero015_Skin_Hell_T3.def",
  };
  const otherHero = {
    rel: "Characters/Hero012/Art/hero012_fall_t3.glb",
    sourceRelativePath: "Characters/Hero012/Hero012_Skin_Fall_T3.def",
  };

  assert.equal(modelSummonQualifier(fortressBody), "");
  assert.equal(modelSummonQualifier(otherHero), "");
  assert.equal(appendModelQualifier("Fortress_Skin_Hell_T3", fortressBody), "Fortress_Skin_Hell_T3");
});
```

- [ ] **Step 2: 运行测试确认按预期失败**

Run: `node --test extracted/tests/model_labels.test.js`

Expected: FAIL，错误为找不到 `extracted/viewer/model-labels.js`。

- [ ] **Step 3: 创建最小纯函数模块**

创建 `extracted/viewer/model-labels.js`：

```js
const fortressMinionDefinition = "characters/hero015/fortressminion.def";
const fortressPackResource = /^Characters\/Hero015\/Art\/hero015[^/]*pack[^/]*\.(?:glb|obj)$/i;

function normalizedResourcePath(value) {
  return String(value || "").replaceAll("\\", "/");
}

export function modelSummonQualifier(item) {
  const rel = normalizedResourcePath(item?.rel);
  const sourceRelativePath = normalizedResourcePath(item?.sourceRelativePath).toLowerCase();
  const ownedByMinionDefinition = sourceRelativePath.endsWith(fortressMinionDefinition);
  if (!ownedByMinionDefinition && !fortressPackResource.test(rel)) return "";
  if (/packAlly/i.test(rel)) return "召唤物（友方）";
  if (/packEnemy/i.test(rel)) return "召唤物（敌方）";
  return "召唤物";
}

export function appendModelQualifier(label, item) {
  const text = String(label || "");
  const qualifier = modelSummonQualifier(item);
  if (!qualifier) return text;
  return text ? `${text} · ${qualifier}` : qualifier;
}
```

- [ ] **Step 4: 接入现有显示与搜索数据流**

在 `extracted/viewer/app.js` imports 中加入：

```js
import { appendModelQualifier } from "./model-labels.js";
```

把 `displayVariant` 改为：

```js
function displayVariant(item) {
  const label = displaySkinName(skinCatalogEntry(item), item.modelLabel || item.variant || item.rel || "");
  return appendModelQualifier(label, item);
}
```

现有 `itemSearchValues` 已包含 `displayVariant(item)`，因此不增加第二套搜索字段。

- [ ] **Step 5: 运行标签测试与 app 静态语法检查**

Run: `node --test extracted/tests/model_labels.test.js`

Expected: PASS。

Run: `node --check extracted/viewer/app.js && node --check extracted/viewer/model-labels.js`

Expected: 两条命令均退出 0。

---

### Task 4: 重建材质清单并完成端到端验证

**Files:**
- Regenerate: `extracted/reports/material_runtime_pipeline.tsv`
- Regenerate: `extracted/reports/material_runtime_pipeline_summary.json`
- Regenerate: `extracted/viewer/material-runtime-pipeline-manifest.json`
- Update generated-audit expectation: `extracted/tests/viewer_lighting.test.js:5510-5514`
- Verify: all files changed by Tasks 1-3

**Interfaces:**
- Consumes: Tasks 1-3 的生成器、运行时和显示函数。
- Produces: 查看器可直接消费的更新后材质清单与完整测试证据。

- [ ] **Step 1: 运行两个子系统的定向回归**

Run: `node --test extracted/tests/material_runtime_pipeline_manifest.test.js extracted/tests/material_runtime_shaders.test.js extracted/tests/model_labels.test.js`

Expected: PASS，退出 0。

- [ ] **Step 2: 重建材质管线生成物**

Run: `npm run material:pipeline`

Expected: 生成器、blocker audit、status 与 render-state audit 全部退出 0；三个生成物包含新的嵌套证据。

该命令会同步刷新 `character-lit-probe-blocker-audit.json`。当前工具把既有的 339 个 character-lit 行和 3 个 solid-lit 行都计入 `rowsWithRequiredRuntimeLightBindings`，因此对应快照断言应为 `342`；`rowsWithViewerShaderPortFormulaReady=339` 与 `rowsBlockedOnlyByRuntimeValues=332` 保持不变。

- [ ] **Step 3: 核对 Ally/Enemy 最终清单证据**

Run:

```bash
node - <<'NODE'
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync("extracted/viewer/material-runtime-pipeline-manifest.json", "utf8"));
const rows = manifest.items.filter((row) => /hero015_hell_t3_pack(?:Ally|Enemy)\.glb$/i.test(row.rel));
if (rows.length !== 2) throw new Error(`expected 2 Fortress pack rows, got ${rows.length}`);
for (const row of rows) {
  const ramp = JSON.parse(row.viewDotRamp);
  const composite = ramp.animatedNoiseComposite;
  const expectedScale = row.rel.includes("packAlly") ? 5 : 8;
  if (composite?.sampler !== "sampler82" || composite?.channel !== "x" || composite?.scale !== expectedScale) {
    throw new Error(`invalid native composite for ${row.rel}`);
  }
  console.log(row.rel, ramp.rampHash, JSON.stringify(composite));
}
NODE
```

Expected: 输出恰好两行；两行均显示 `sampler82` 与 `"channel":"x"`，Ally scale 为 `5`、Enemy scale 为 `8`，且 ramp hash 不同。

- [ ] **Step 4: 运行完整自动化测试**

Run: `npm test`

Expected: 全部测试 PASS；若发现预先已有失败，保存原始失败命令与错误文本，并将其与本次定向测试结果分开报告。

- [ ] **Step 5: 运行材质视觉 smoke test**

Run: `npm run test:visual-smoke`

Expected: PASS；如果环境缺少 Electron/图形会话导致无法启动，报告为环境限制，不能把未运行描述为通过。

- [ ] **Step 6: 审查变更范围与生成物**

Run: `git diff --no-index /dev/null extracted/viewer/model-labels.js >/tmp/fortress-model-labels.diff || test $? -eq 1`

Expected: 命令退出 0，diff 只包含新的纯标签模块。

Run: `rg -n "animatedNoiseComposite|召唤物（友方）|召唤物（敌方）" extracted/tools/material_runtime_pipeline_manifest.js extracted/viewer/material-runtime-shaders.js extracted/viewer/model-labels.js extracted/viewer/material-runtime-pipeline-manifest.json`

Expected: 生成器、运行时、标签模块与最终清单都有对应命中；没有几何生成、多实例或目标路径颜色硬编码。
