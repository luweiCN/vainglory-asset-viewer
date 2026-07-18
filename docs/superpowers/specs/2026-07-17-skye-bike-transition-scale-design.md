# 斯凯摩托过渡动作双车修复设计

## 目标

修复 `Characters/Skye/Art/skye_bike.glb` 在登场 `skye.bike_spawn.anim` 和回城 `skye.bike_withdraw.anim` 中同时出现两套摩托形态的问题，同时保留完整的上下车与机甲变形动作。

## 已确认事实

- 正常 `Sprint` 动作在第 41 帧进入摩托形态：完整摩托骨骼显示，同时 18 根未参与过渡动作 scale 关键帧的机甲骨骼继承摩托形态缩放。
- `BikeSpawn` 仅在第 0–33 帧显示完整摩托骨骼。
- `Withdraw` 仅在第 103–158 帧显示完整摩托骨骼。
- 这两个过渡动作没有重新记录上述 18 根机甲骨骼的 scale；当前查看器每帧从绑定姿势恢复它们，导致完整摩托和未收起的机甲零件同时出现。
- 官方皮肤说明确认回城表现是一套机甲变形成一辆摩托，而不是额外生成第二辆摩托。

## 设计

只在以下条件全部成立时补足摩托形态的继承 scale：

1. 当前皮肤为 `Skye_Skin_Bike`；
2. 当前动作路径是 `Characters/Skye/Art/skye.bike_spawn.anim` 或 `Characters/Skye/Art/skye.bike_withdraw.anim`；
3. 动作中的完整摩托根骨骼当前 scale 大于可见阈值。

补足范围只包含 `Sprint` 第 41 帧中已经切换为摩托形态、但两个过渡动作没有 scale 关键帧的 18 根骨骼。使用骨骼哈希名称建立映射，避免把规则误用到其他骨架：

- `D5B032E7`
- `2A2E6C4F`
- `6268847C`
- `90246792`
- `5541D42F`
- `759551EF`
- `31099AA2`
- `EA12AB50`
- `A37B4A50`
- `9237C7CD`
- `00BB42EB`
- `555D80C2`
- `F7FAF4A2`
- `587247DC`
- `D2F10A78`
- `708818DA`
- `48492C64`
- `04004BD3`

完整摩托隐藏后停止补足，让动作自身恢复人形机甲。过渡动作已有 scale 关键帧的骨骼继续使用动作原值，不覆盖骑手肢体和动作专用缩放。

## 代码边界

- 只修改 `extracted/viewer/app.js` 的原生动画 scale 处理。
- 更新 `extracted/viewer/index.html` 的 `app.js` 缓存键。
- 不修改 GLB、动画资源、动作绑定或模型形态按钮。
- 不影响 `Idle`、`Sprint`、其他斯凯皮肤或其他英雄。

## 验证

遵守用户不运行测试套件和全量扫描的要求，仅执行：

- `node --check extracted/viewer/app.js`；
- 只读源码断言，确认规则只覆盖指定皮肤和两个动作；
- 保持现有 Electron 实例，用户通过 `View → Reload` 检查 `BikeSpawn`、`Withdraw`、`Idle` 和 `Sprint`。

代码验证只能证明规则接入正确；最终视觉结果由刷新后的动作画面确认。
