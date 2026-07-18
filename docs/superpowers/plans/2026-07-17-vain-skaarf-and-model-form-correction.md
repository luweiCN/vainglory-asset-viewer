# Vain、Skaarf CNY 与模型形态范围修正实施计划

> **For agentic workers:** 直接在当前会话逐项实施；本目录不是 Git 仓库，不创建 worktree 或提交。用户明确要求不运行测试套件。

**Goal:** 只保留 Tank SAW 的模型形态切换，恢复 Skaarf CNY 五套图集配色，并消除四个 Vain 水晶模型的黑色不透明能量面。

**Architecture:** 当前模型路径和皮肤 ID 作为只读上下文传入现有材质运行时管线。Skaarf 使用共享图集的静态偏移；Vain 仅对原生启用混合且缺少有效 alpha 的目标材质增加预览 shader，不修改 GLB 和普通材质。

**Tech Stack:** JavaScript ES modules、Three.js `MeshStandardMaterial.onBeforeCompile`、现有 GLB/材质运行时清单。

## Global Constraints

- 只处理设计规范列出的三个问题。
- 不运行项目测试套件或全量扫描。
- 不创建新的后台进程。
- 只做 `node --check` 和目标常量/路径断言。

---

### Task 1: 收窄模型形态配置

**Files:**
- Modify: `extracted/viewer/model-form-profiles.js`

**Interfaces:**
- Consumes: `modelFormProfileForSkinId(skinId)`。
- Produces: 仅 `SAW_Skin_Tank` 返回形态配置。

- [x] **Step 1: 删除 Baron 和 Skye 配置**

从 `MODEL_FORM_PROFILES` 中删除 `Baron_Skin_Heli` 与 `Skye_Skin_Bike` 两项，保留 Tank SAW 项及通用几何拆分函数。

- [x] **Step 2: 轻量验证**

运行：

```bash
node --check extracted/viewer/model-form-profiles.js
```

目标断言：配置文件包含 `SAW_Skin_Tank`，不再包含 Baron/Skye 两个皮肤 ID。

### Task 2: 恢复 Skaarf CNY 图集变体

**Files:**
- Modify: `extracted/viewer/material-runtime-shaders.js`
- Modify: `extracted/viewer/app.js`

**Interfaces:**
- Consumes: `runtimeContext.activeSkinId`、`runtimeContext.rel`。
- Produces: `applyCharacterMaterialRuntimePipeline(..., runtimeContext)`；旧调用在不传上下文时保持原行为。

- [x] **Step 1: 定义 CNY 图集偏移**

在材质运行时模块中加入只读映射：

```js
const hero010CnyPaletteOffsets = new Map([
  ["Skaarf_Skin_CNY", [0, 0]],
  ["Skaarf_Skin_CNY_A", [0, 1 / 3]],
  ["Skaarf_Skin_CNY_B", [1 / 3, 2 / 3]],
  ["Skaarf_Skin_CNY_C", [1 / 3, 1 / 3]],
  ["Skaarf_Skin_CNY_D", [0, 2 / 3]],
]);
```

- [x] **Step 2: 将偏移注入现有 CNY shader**

把固定采样：

```glsl
texture2D(characterCnyPaletteMap, vMapUv * vec2(0.3333333333))
```

改为带 `characterCnyPaletteOffset` uniform 的采样，并将皮肤 ID 加入 shader cache key。

- [x] **Step 3: 从 app 传递当前上下文**

`setActiveObject` 调用材质管线时传入：

```js
{
  activeSkinId: modelSkinId(manifestItem),
  rel: manifestItem?.rel || "",
}
```

- [x] **Step 4: 轻量验证**

运行 `node --check`，并用只读 Node 断言确认五个皮肤 ID 对应五个预期图集区域。

### Task 3: 修复 Vain 能量材质

**Files:**
- Modify: `extracted/viewer/material-runtime-shaders.js`

**Interfaces:**
- Consumes: 材质证据中的原生 blend 状态、当前目标模型路径。
- Produces: 仅目标 Vain 能量材质使用透明着色预览。

- [x] **Step 1: 识别目标能量材质**

仅当模型路径属于四个 Vain 路径、并且 `nativeRenderStateFromEvidence(evidence).blendEnabled === true` 时启用修复。

- [x] **Step 2: 注入能量预览 shader**

在现有材质管线完成后追加 `onBeforeCompile`：从 `diffuseColor` 的亮度得到能量强度，生成柔和 alpha，并把输出改为 Home 蓝青或 Away 红紫。材质设置为透明、关闭深度写入、使用普通透明混合，不隐藏任何几何体。

- [x] **Step 3: 避免污染其他模型**

把 `runtimeContext` 加入材质证据 cache key；其他路径或原生不混合材质直接返回。

- [x] **Step 4: 轻量验证**

运行：

```bash
node --check extracted/viewer/material-runtime-shaders.js
node --check extracted/viewer/app.js
```

目标断言：四个 Vain 路径存在，Vain 修复函数只由运行时上下文触发。

### Task 4: 客户端交付

**Files:**
- Modify: `extracted/viewer/index.html`

**Interfaces:**
- Consumes: 浏览器脚本缓存键。
- Produces: `View → Reload` 后加载本次脚本。

- [x] **Step 1: 更新缓存键**

只更新 `material-runtime-shaders.js` 与 `app.js` 的版本查询参数，避免 Electron 使用旧模块。

- [x] **Step 2: 确认现有客户端仍运行**

只读取现有 Electron 进程；不启动第二个实例。

- [x] **Step 3: 交付人工视觉检查项**

请用户刷新后依次检查 Tank SAW、Skaarf 五色和四个 Vain 路径。明确说明视觉结果尚需客户端确认。
