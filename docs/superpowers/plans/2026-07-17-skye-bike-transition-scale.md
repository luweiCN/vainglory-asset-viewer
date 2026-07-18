# 斯凯摩托过渡动作双车修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `Skye_Skin_Bike` 的登场和回城动作在完整摩托出现时正确继承摩托形态 scale，只显示一辆摩托。

**Architecture:** 在现有原生动画 pose 生成阶段增加一个精确的斯凯过渡态补偿层。它根据动作中的整车根骨骼是否可见，在两个指定动作里为 18 根未带 scale 关键帧的骨骼补入 `Sprint` 摩托形态 scale；其他 pose 数据和模型保持原样。

**Tech Stack:** JavaScript ES modules、Three.js 骨骼动画运行时。

## Global Constraints

- 只覆盖 `Skye_Skin_Bike`。
- 只覆盖 `skye.bike_spawn.anim` 与 `skye.bike_withdraw.anim`。
- 不修改 GLB、动画资源、绑定数据或模型形态按钮。
- 不运行测试套件或全量扫描。
- 保持现有 Electron 实例，不启动新实例。

---

### Task 1: 补足斯凯摩托过渡态 scale

**Files:**
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/viewer/index.html`

**Interfaces:**
- Consumes: `modelSkinId(activeManifestItem)`、`selectedAnimation()`、`firstActiveSkinnedSkeletonBones()`、`interpolateNativePose()`、`nativeScaleVisible()` 和 `nativeTrackHasScaleKeys()`。
- Produces: `skyeBikeTransitionInheritedScaleByBoneIndex(frame, nextFrame, alpha)`，返回当前帧需要继承的 `Map<number, number[]>` 或 `null`。

- [x] **Step 1: 运行失败的定向源码断言**

```bash
node --input-type=module -e 'import fs from "node:fs"; const source=fs.readFileSync("extracted/viewer/app.js","utf8"); if (!source.includes("SKYE_BIKE_MOTO_INHERITED_SCALE_BY_BONE_NAME")) { console.error("RED: Skye transition scale profile missing"); process.exit(1); }'
```

预期：退出码 `1`，输出 `RED: Skye transition scale profile missing`。

- [x] **Step 2: 增加精确常量和对象级缓存**

在 `NATIVE_SCALE_MASK` 附近增加两个动作路径、整车根骨骼哈希和 18 根骨骼的摩托形态 scale 映射；在现有 WeakMap 区域增加一个对象级 profile 缓存。映射使用设计规范记录的 18 个哈希和 `Sprint` 第 41 帧的原生 scale 值。

- [x] **Step 3: 解析当前过渡态继承 scale**

增加：

```js
function skyeBikeTransitionInheritedScaleByBoneIndex(frame, nextFrame, alpha) {
  const animationPath = selectedAnimation()?.targetRelativePath || "";
  if (
    modelSkinId(activeManifestItem) !== "Skye_Skin_Bike" ||
    !SKYE_BIKE_TRANSITION_ANIMATION_PATHS.has(animationPath)
  ) {
    return null;
  }

  const profile = skyeBikeTransitionScaleProfile();
  const rootIndex = profile?.motorcycleRootBoneIndex;
  if (!Number.isInteger(rootIndex) || !frame[rootIndex] || !nextFrame[rootIndex]) return null;
  const motorcyclePose = interpolateNativePose(frame[rootIndex], nextFrame[rootIndex], alpha);
  return nativeScaleVisible(motorcyclePose.scale) ? profile.inheritedScaleByBoneIndex : null;
}
```

`skyeBikeTransitionScaleProfile()` 按骨骼哈希建立索引映射并缓存到当前对象；找不到整车根或 18 根骨骼不完整时返回 `null`，不对错误骨架应用规则。

- [x] **Step 4: 接入原生 pose 循环**

在读取 `frame` 和 `nextFrame` 后计算一次继承映射。在 pose 循环中，仅当当前骨骼位于该映射且动作没有自己的 scale 关键帧时覆盖 `pose.scale`：

```js
const inheritedScale = skyeBikeInheritedScales?.get(pose.boneIndex);
if (inheritedScale && !nativeTrackHasScaleKeys(pose.boneIndex)) pose.scale = inheritedScale;
```

保留现有 translation 过滤和 `nativeScaleBones` 许可逻辑。

- [x] **Step 5: 更新缓存键**

把 `index.html` 中 `app.js` 查询参数改为 `20260717-skye-bike-transition-scale`。

- [x] **Step 6: 运行低开销验证**

运行：

```bash
node --check extracted/viewer/app.js
```

再运行只读源码断言，确认：

- 18 项摩托形态 scale 映射存在；
- 只包含两个指定动作路径；
- `model-form-profiles.js` 仍不包含 `Skye_Skin_Bike`；
- `index.html` 使用新缓存键；
- 原 Electron 进程仍在运行。

- [x] **Step 7: 视觉交付**

请用户执行 `View → Reload`，检查 `BikeSpawn`、`Withdraw`、`Idle` 与 `Sprint`。代码阶段不宣称视觉问题已经解决。
