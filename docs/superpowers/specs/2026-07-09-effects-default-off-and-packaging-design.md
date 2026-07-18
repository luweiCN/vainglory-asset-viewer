# 运行时特效默认关闭 + 打包 Windows exe（设计）

日期：2026-07-09

## 用户诉求
- 把"那些看起来像光、现在不对的特效"做成可选开关并默认去掉。
- 打包一个 Windows exe。
- 澄清：武器**模型**（手持的枪/剑/法杖）已经做好、保留不动；要去掉的是武器上的**特效**（挥砍拖尾等），和身上的法术光片一类。

## 根因（诊断已确认，非猜测）
- viewer 早已有"特效部件"开关（`#effectsToggle`），控制所有运行时特效 preview（PFX Sprite/面片 + 粒子系统）。
- 但 `extracted/viewer/app.js` 的 `syncEffectsToggleAvailability(enabled)` 里有一行自动勾选：
  `else if (wasDisabled && !effectsToggle.checked) effectsToggle.checked = true;`
  只要当前英雄的动作带运行时特效，加载时就把开关自动打开。
- 证据：后台加载 Celeste（Hero014），dump 整个 three 场景 → 出现 `Sprite runtime_effect_preview_0_Effect_Celeste_SNW_coldMist_Idle`（半透明），且 `effectsToggle.checked === true`（自动开）。截图可见顶部绿光片、右侧飘带。Ringo（idle 无特效）开关是关的。
- 排除项：不是 bloom（`renderSceneOnce` 里 `bloomToggle.checked` 默认 false，默认不过 composer）；Ringo 身上那条橙黄"飘带"是腰间黄布条 mesh（模型自带布料，全不透明、emissive 全黑），不是特效，保留不动。

## 方案（一处根，全英雄通用）
- 删掉 `syncEffectsToggleAvailability` 的自动勾选逻辑，只保留"控制可用性 + 无特效时置为未勾选"。effectsToggle 默认关闭。
- 效果：所有英雄/皮肤加载后默认干净，运行时特效面片（法术光片、冷雾、飘带、武器挥砍拖尾等）默认隐藏；开关保留，用户手动勾选可看。
- 恢复交接文档里"特效部件默认隐藏，需要用户打开"的原意。

## 验证标准
1. Celeste 加载后 `effectsToggle.checked === false`，场景无 `runtime_effect_preview_*` 可见 Sprite；截图无绿光片/飘带。
2. 手动勾选"特效部件"后，特效面片重新出现（开关仍可用）。
3. Ringo / 其它英雄无回归（黄布条等模型自带部件保持显示）。
4. `npm test` 全过（更新/新增断言默认关的测试）。

## 打包
- 环境：arm64 mac，brew + Rosetta 已就绪，装 `wine-stable`。
- `build` 已配置 `win: { target: "nsis" }`；`npm run electron:dist` 输出 Windows 安装 exe 到 `dist/`。
- 风险：arm64 上 wine 跑 x86、首次联网下载 NSIS/winCodeSign 组件，可能失败；失败则回退到 Windows 机器上 `npm run electron:dist`（提供命令）。
- 无 Windows 图标（.ico），exe 用默认 electron 图标；内部展示工具可接受。

## 范围外
- Ringo 腰间黄布条及其它模型自带装饰 mesh：保留，不做隐藏开关（用户确认"不用管，保留"）。
