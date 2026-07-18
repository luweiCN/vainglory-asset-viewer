# Skye Bike 原生缩放轨道修复实施计划

> **For agentic workers:** 使用 `executing-plans` 在当前会话执行。用户已经选择内联执行；本目录不是 Git 仓库，不创建 worktree 或提交。

**Goal:** 让 `Skye_Skin_Bike` 的原生动作能够应用全部 scale 轨道，恢复机甲与摩托的正确拼接和显隐。

**Architecture:** 在现有 `nativeScaleBoneIndicesForActiveObject` 中增加一个皮肤 ID 精确分支，把 Skye Bike 的骨骼加入原生 scale 许可集合。动作解析、动作选择、模型形态控件和其他模型逻辑保持原样。

**Tech Stack:** JavaScript ES modules、Three.js 骨骼动画运行时。

## Global Constraints

- 只修改 `Skye_Skin_Bike` 的 scale 许可。
- 不重新加入模型形态按钮。
- 不修改 GLB、动作资源或其他英雄。
- 不运行测试套件或全量扫描。

---

### Task 1: 恢复 Skye Bike 原生 scale

**Files:**
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/viewer/index.html`

**Interfaces:**
- Consumes: `modelSkinId(activeManifestItem)`、`firstActiveSkinnedSkeletonBones()`。
- Produces: `nativeScaleBoneIndicesForActiveObject()` 对 `Skye_Skin_Bike` 返回包含全部 85 根骨骼的集合。

- [x] **Step 1: 增加精确皮肤分支**

在 `nativeScaleBoneIndicesForActiveObject` 建立 `boneIndices` 后加入：

```js
if (modelSkinId(activeManifestItem) === "Skye_Skin_Bike") {
  firstActiveSkinnedSkeletonBones().forEach((_, boneIndex) => boneIndices.add(boneIndex));
}
```

保留现有材质推断、Hero011、SAW 和缓存逻辑。

- [x] **Step 2: 更新 app 缓存键**

把 `index.html` 中 `app.js` 的查询参数更新为 `20260717-skye-bike-scale`，确保 `View → Reload` 加载新代码。

- [x] **Step 3: 轻量验证**

运行：

```bash
node --check extracted/viewer/app.js
```

再用只读源码断言确认：

- `app.js` 包含精确的 `Skye_Skin_Bike` scale 分支；
- `model-form-profiles.js` 不包含 `Skye_Skin_Bike`；
- `index.html` 包含新缓存键。

- [x] **Step 4: 人工视觉交付**

保持当前 Electron 实例运行，不启动新实例。请用户刷新后检查 `bike_idle`、`Sprint` 和 `Withdraw`；不在代码校验阶段宣称视觉问题已经解决。
