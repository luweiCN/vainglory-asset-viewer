# Vain、Skaarf CNY 与模型形态范围修正设计

## 目标

- 模型形态选择器只对 `SAW_Skin_Tank` 生效。
- `Skaarf_Skin_CNY` 及 A、B、C、D 四个变体显示各自的图集配色。
- 四个 Vain 水晶模型不再把运行时能量噪声画成黑色不透明大面。
- 只处理用户指定的路径，不做全量资源扫描或测试套件运行。

## 已确认根因

### 模型形态范围

Baron Heli 和 Skye Bike 使用动作驱动的变形。通用形态选择器无法完整复现它们的原生状态，因此本次移除这两个配置，只保留通过独立骨骼组拆分的 Tank SAW。

### Skaarf CNY

五个皮肤条目共享 `Characters/Hero010/Art/hero010_CNY.glb` 是正常的；该 GLB 的 `CNY_mat` 贴图是一张 3×3 调色图集。当前预览 shader 固定采样左上角，导致五个条目全部显示金焰配色。

修复时按皮肤 ID 选择已存在的图集区域：

| 皮肤 ID | 名称 | 图集区域 |
| --- | --- | --- |
| `Skaarf_Skin_CNY` | 金焰 | 左上 |
| `Skaarf_Skin_CNY_A` | 碧焰 | 左中 |
| `Skaarf_Skin_CNY_B` | 紫焰 | 中下 |
| `Skaarf_Skin_CNY_C` | 青焰 | 中中 |
| `Skaarf_Skin_CNY_D` | 赤焰 | 左下 |

这里修改的是角色材质图集采样。技能粒子仍使用现有 CNY 特效资源；本次不伪造缺失的逐变体粒子参数。

### Vain 水晶

以下模型的部分能量材质依赖游戏运行时查色表和透明度计算：

- `Characters/Vain5v5Home/Art/vain5v5Away.glb`
- `Characters/Vain5v5Home/Art/vain5v5Home.glb`
- `Characters/VainAway/Art/vainAway.glb`
- `Characters/VainHome/Art/vainHome.glb`

导出的 GLB 保留了接近黑色的能量噪声贴图，却没有保留查色表生成的 alpha，因而在当前预览中成为黑色不透明面。

修复只针对这四个模型中原生启用混合、但导出 alpha 为全不透明的能量/水晶材质：由噪声亮度恢复柔和 alpha，关闭深度写入，并用 Home 蓝青、Away 红紫的能量色预览。实体底座和普通不透明材质保持原样。

## 数据流

`setActiveObject` 将当前 `skinId`/模型路径作为只读上下文传给材质运行时管线。管线据此：

1. 对 Skaarf CNY 的 `CNY_mat` 注入对应图集偏移。
2. 对目标 Vain 能量材质注入透明能量预览 shader。
3. 其他模型继续走现有材质逻辑，不改变结果。

## 验收标准

- Baron Heli 和 Skye Bike 不再显示“模型形态”选项；Tank SAW 仍可切换人形、坦克形态和同时显示。
- Skaarf 的金、碧、紫、青、赤五个条目不再采样同一个图集区域。
- Vain 模型不再出现截图中的黑色不透明扇形大面，底座仍可见。
- `app.js`、`model-form-profiles.js`、`material-runtime-shaders.js` 通过 `node --check`。
- 不运行项目测试套件或全量扫描；最终视觉结果由客户端 `View → Reload` 检查。

## 非目标

- 不为 Baron 或 Skye 重做原生变形状态机。
- 不重建 GLB 文件。
- 不补造 Skaarf 各颜色缺失的粒子参数。
- 不修改未被用户点名的材质或模型。
