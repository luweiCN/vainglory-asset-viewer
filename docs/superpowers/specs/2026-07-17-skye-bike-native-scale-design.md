# Skye Bike 原生缩放轨道修复设计

## 目标

修复 `Characters/Skye/Art/skye_bike.glb` 在摩托相关动作中同时显示机甲与摩托零件、车头与车身分离的问题。

## 已确认根因

- 默认动作已经正确选择 `Characters/Skye/Art/skye.bike_idle.anim`。
- 待机动作的自动平移模式为 `all`，并非平移安全模式造成零件分离。
- `skye.bike_sprint.anim` 有 37 根骨骼包含原生 scale 轨道，其中多根骨骼会在 `1`、`0.1`、`0.01` 与 `0.001` 之间切换，用于折叠、隐藏并重新拼接机甲和摩托零件。
- 当前 `nativeScaleBoneIndicesForActiveObject` 没有把 `Skye_Skin_Bike` 纳入原生缩放许可范围，因此这些轨道被清空。

## 修复方案

仅当当前皮肤 ID 为 `Skye_Skin_Bike` 时，把该模型的 85 根骨骼全部加入原生 scale 许可集合。动画本身决定哪些骨骼实际具有 scale 值；没有 scale 变化的骨骼保持原值。

这样可以让：

- `bike_idle` 保持正常机甲形态；
- `bike_sprint`、技能与回城动作按原始轨道完成摩托拼接；
- 动作结束或切回待机时恢复机甲；
- 查看器不显示“模型形态”按钮。

## 范围限制

- 不修改模型几何或 GLB 文件。
- 不重新加入 Skye 形态按钮。
- 不更改 Baron、Tank SAW 或其他模型的 scale 策略。
- 不运行测试套件或全量扫描。

## 验收标准

- `model-form-profiles.js` 仍不包含 `Skye_Skin_Bike`。
- `app.js` 只在 `Skye_Skin_Bike` 分支允许完整原生 scale。
- `app.js` 通过 `node --check`。
- 用户刷新后检查待机、Sprint 和回城动作，确认没有两种形态同时出现，摩托车头与车身连接正确。
