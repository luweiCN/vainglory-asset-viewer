# Fortress 狼群召唤物原生材质与标签设计

日期：2026-07-14

状态：用户已批准方案 1（数据驱动复原原生 shader）

## 一句话结论

`hero015_hell_t3_packAlly/packEnemy` 是 `FortressMinion.def` 使用的单只狼群召唤物。保留其原始几何，不补造身体；查看器根据已恢复的 shadergraph 证据执行完整的无光照动态能量公式，并在模型列表中明确标注友方/敌方召唤物。

## 已验证事实

- `hero015_hell_t3_packAlly.mesh` 原始资源只有 1190 个顶点、5598 个索引，几何最低点为 `y=58.628`；缺少身体并非 GLB 导出丢面。
- 该资源归属于 `Characters/Hero015/FortressMinion.def`，同一 T3 皮肤包含 `packAlly` 与 `packEnemy` 两个阵营变体。
- Ally 的基础贴图和视角渐变为青绿色；Enemy 为红橙色。阵营色不应互换或统一。
- 原始片元公式可归纳为：

  ```text
  baseWithRamp = baseColor + viewDotRamp
  finalColor = baseWithRamp + baseWithRamp * animatedNoise.x * animatedScale
  finalAlpha = 1
  ```

- 噪声 UV 为基础 UV 的两倍，并叠加 `fract(time * 0.1)` 与 `fract(time * -0.75)`。
- 原始常量倍率存在阵营差异：Ally 为 `5`，Enemy 为 `8`；必须逐材质从 shader 恢复。
- 当前查看器只执行 `baseColor + viewDotRamp`，仍通过 `MeshStandardMaterial` 的 PBR 光照；独立的噪声 sampler 因与 base sampler 不同且缺少复合公式而被提前跳过。

## 目标

1. 数据驱动识别已验证的“基础色 + 视角渐变 + 滚动单通道噪声放大”公式。
2. 在查看器中执行完整公式，并绕过 PBR 光照对最终颜色的调制。
3. 保留 Three.js 的最终输出转换，包括查看器统一使用的 tone mapping、色彩空间和雾处理。
4. 在列表中把 Fortress 狼群模型标成“召唤物（友方）”或“召唤物（敌方）”。
5. 不改变内部 `modelLabel`、资源路径、皮肤绑定、动画绑定或 Ally/Enemy 资源选择。

## 非目标

- 不生成不存在的身体、四肢或额外狼实例。
- 不把单个 GLB 改成整支狼群预览。
- 不修改其他 Fortress 皮肤的几何或动画。
- 不按目标文件路径硬编码颜色或 shader 输出。
- 不在证据不完整的材质上猜测噪声 sampler、倍率或 UV 速度。

## 方案

### 1. 材质证据生成

在 `material_runtime_pipeline_manifest.js` 中扩展现有 `viewDotRamp` 证据。只有 shader 文本同时证明以下条件时，才附加 `animatedNoiseComposite`：

- 已存在可执行的 `base-plus-viewdot-ramp`；
- 噪声来自不同于 base/view-dot 的纹理 sampler；
- 最终公式明确为 `baseWithRamp + baseWithRamp * sampledChannel * constantScale`；
- 噪声纹理路径已解析；
- UV repeat、两个时间项、采样通道和倍率都可从 shader 中恢复。

证据结构固定为：

```json
{
  "mode": "base-plus-base-times-animated-noise",
  "sampler": "sampler82",
  "texturePath": "../hero_assets_material_textures_preview/...sampler-sampler82.png",
  "channel": "x",
  "uvRepeat": [2, 2],
  "xTerms": [{ "kind": "fract", "speed": 0.1, "offset": 0 }],
  "yTerms": [{ "kind": "fract", "speed": -0.75, "offset": 0 }],
  "scale": 5
}
```

上例是 Ally 证据；Enemy 的同一字段为 `8`。

任一字段无法证明时，不生成该结构，现有 view-dot 行为保持不变。

### 2. 查看器运行时

`viewDotRampSettings` 校验并接收 `animatedNoiseComposite`。运行时将噪声纹理按数据纹理加载，关闭颜色空间转换并保持 `flipY=false`。

同一个 `onBeforeCompile` patch 完成以下计算，避免 view-dot 与 UV 动画分别改写同一 shader chunk：

1. 采样并解码 GLB base color；
2. 按视角法线点积采样内联渐变；
3. 用恢复出的 repeat 与时间项采样噪声通道；
4. 计算原生 `finalColor`；
5. 在 `opaque_fragment` 前把 `outgoingLight` 替换为 `finalColor`，从而绕过标准材质灯光与高光，同时继续经过查看器统一的 tone mapping、色彩空间和雾处理。

该复合层拥有自身的时间 uniform。`applyCharacterUvAnimationRuntime` 检测到 view-dot 已拥有动态噪声后不再安装第二套 UV patch。`advanceCharacterUvRuntime` 继续通过现有统一时间更新入口推进动画。

### 3. 模型列表标签

增加一个无 DOM 依赖的纯显示辅助函数。它只使用已有字段，并兼容动画清单与缺少定义关系的静态/全部资源清单：

- `sourceRelativePath` 以 `Characters/Hero015/FortressMinion.def` 结尾，或 `rel` 匹配 `Characters/Hero015/Art/hero015*pack*.glb` 的已知召唤物命名结构；
- `rel` 包含 `packAlly` 时返回 `召唤物（友方）`；
- `rel` 包含 `packEnemy` 时返回 `召唤物（敌方）`；
- 已识别为 Hero015 pack、但无法判断阵营的资源返回 `召唤物`；
- 其他资源返回空字符串。

`displayVariant` 在本地化皮肤名之后追加该限定词。搜索索引沿用最终显示文本，因此用户可以搜索“召唤物”“友方”或“敌方”。内部 `modelLabel` 保持不变。

## 数据流

```text
shadergraph + sampler 绑定
  → material runtime manifest
  → viewDotRamp.animatedNoiseComposite
  → viewer material evidence
  → 单一 view-dot/noise shader patch
  → 无光照原生颜色

manifest item
  → 皮肤本地化名称
  + FortressMinion 阵营限定词
  → 模型列表副标题与搜索索引
```

## 失败与安全边界

- 证据字段缺失、数值非法或纹理路径缺失时，不启用动态能量复合层。
- 不允许从文件名推断 shader 颜色、噪声倍率或速度；Hero015 pack 命名只用于补足静态清单缺失的 UI 召唤物/阵营限定词。
- 新逻辑必须保持普通 `base-plus-viewdot-ramp` 材质的现有输出。
- 原生 pass 已证明为不透明、写深度，因此保持 `transparent=false`、`depthWrite=true`、`alpha=1`。

## 测试设计

按 TDD 分两轮完成：

1. 材质证据与运行时
   - 真实 Ally/Enemy 行均生成相同结构、各自保留不同渐变；
   - 噪声 sampler、纹理、UV repeat、速度、通道和倍率完全匹配各自原 shader（Ally `5`、Enemy `8`）；
   - 运行时安装时间与噪声 uniforms；
   - 生成 shader 包含完整公式和 `outgoingLight` 覆盖；
   - 普通 view-dot 材质不启用动态噪声。
2. 标签
   - T3 Ally/Enemy 得到对应中文限定词；
   - 其他 Fortress 本体和普通英雄不追加限定词；
   - 原始 `modelLabel` 不发生改变。

每轮先运行定向测试确认按预期失败，再写最小实现使其通过。完成后运行材质管线、相关定向测试及完整 `npm test`。

## 验收标准

- 目标模型不再出现由 PBR 灯光造成的大面积黑色/塑料高光。
- Ally 保持青绿动态能量，Enemy 保持红橙动态能量。
- 噪声按原生速度流动，Ally 最终倍率为 `5`，Enemy 最终倍率为 `8`。
- 模型列表明确显示“召唤物（友方/敌方）”。
- `hero015_hell_t3.glb` 仍作为完整 T3 英雄本体独立显示。
- 相关定向测试和完整测试通过；若存在预先已有失败，必须逐项报告，不能把它们描述为本次通过。
