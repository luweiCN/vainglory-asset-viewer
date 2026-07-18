# 特效发射参数逆向突破 + 接入方案

日期：2026-07-06

## 一句话结论

不再手调/猜测特效发射参数。全量精确参数在游戏的 **CFF0 定义文件**里（本地已有、可解密），**发射点/距离/时机对全英雄通用**，主 app 已有解析函数。下一步是把粒子系统的手调值全部换成这些真实数据源。

## 已验证的事实（可行性 + 通用性都成功）

### 1. 全量数据源：CFF0 定义文件
- 942 个 CFF0 文件在本地：`extracted/ios_raw/Payload/GameKindred.app/Data/`（Android 版也在 `extracted/android_raw/assets/Data/`）。
- 格式 HackedGlory 已逆向，解密脚本：`external/HackedGlory/scripts/decrypt_cff0.py`、`extract_balance_db.py`。
- 前 4 字节 magic = `CFF0`。

### 2. 飞行距离 = CFF0 `range` 字段（已验证，67 英雄通用）
- 字段偏移表在 `external/HackedGlory/scripts/extract_balance_db.py` 的 `HERO_STAT_OFFSETS`（注释：verified against Vox/Catherine/Ringo）：
  - `124: health_base`、`196: range`、`200: atk_speed_ratio`、`232: move_speed` 等。
- 工具确认：`Ringo: range=6.2, health_base=703.0, atk_speed=1.0, move=3.6`。
- 提取命令：`python3 external/HackedGlory/scripts/extract_balance_db.py <Data目录> <输出json>`。
- 已导出到 `scratchpad/balance.json`（全 67 英雄 + 所有物品）。

### 3. 发射点 = 语义命名的 locator（已验证，25+ 英雄通用）
- 来源 manifest：`extracted/viewer/effect-projectile-runtime-manifest.json`。
- Ringo 普攻真实发射点：
  - `runtimeLocatorLabel: "GunMuzzleTip_Attack"`（枪口尖端）
  - `runtimeLocatorPosition: "5,143.5,60.8"`（相对模型根的局部坐标，model-root-offset）
  - `runtimeLocatorRotation: "0,0,0"`、`nativeTimelineTimes: "0|0.2"`、`runtimeStartSeconds: 0`
  - 来自 `Characters/Ringo/Ringo.def`
- 其它英雄同样有语义命名 locator：Adagio=`Projectile_GunBarrelTip`、Petal=`GunMuzzle`、Celeste=`Mouth`、Karas=`Ability01_BladeShot`、Caine=`AutoAttack`、多英雄=`CenterBody`。

### 4. 主 app 已有解析（只是粒子接入没用它）
- `normalizeRuntimeEffectProjectileRow(item)`（app.js ~1555）已把 locator 解析成 `runtimeBinding`：
  - `localPosition`（GunMuzzleTip 坐标）、`localRotation`、`locatorLabel`
  - `startSeconds`、`timelineTimes`、`projectileMode`、`lateralOffsets`
  - `kind: "model-root-offset"`（有 locator 时）
- 查询：`runtimeEffectProjectileRuntimeByModelLabel`（按 modelLabel 的 lookup，app.js ~16076 构建）。

## 接入方案（下一步工程）

把 `effect-particles.js` + `app.js` 里粒子系统的三个手调值，换成真实数据源：

| 现在（手调/猜） | 换成（真实） |
|---|---|
| 发射点 = 右手骨骼 + `unit*1.1` 沿手臂方向 | `runtimeBinding.localPosition`（GunMuzzleTip locator，model-root-offset） |
| 距离 = `runtimeEffectProjectileTravelDistance`(=120) 或 `unit*1.6` | CFF0 `range` × 单位换算 |
| 时机 = role window `[0.18,0.82]` 猜的 | `timelineTimes` / `startSeconds` |

### 待标定（有据可依，非猜测）
1. **游戏单位 → 模型空间换算比例**：range=6.2（游戏米）对应模型局部空间多少单位。标定方法：locator 坐标 (5,143.5,60.8) 在模型空间，range 在游戏空间，用已知量（如英雄身高 vs 游戏身高，或 locator 到目标的关系）标定一次，全英雄通用。
2. **发射方向**：locator rotation=(0,0,0)；确认发射方向是模型 forward 还是 locator 朝向；结合 `projectileMode` / `lateralOffsets`。
3. **弹速/时长**：timeline `0|0.2` 是否代表飞行时长；或 range/弹速；弹速可能是全局常量或在特效定义。

### 接入点
- `app.js` 的 `syncRuntimeEffectPreviews` 粒子分支：通过 `runtimeEffectProjectileRuntimeByModelLabel` 查当前英雄/动作的 projectile row，拿 `runtimeBinding.localPosition` 当发射点。
- `updateRuntimeParticlePreview`：origin 用 locator（model-root-offset），distance 用 range×换算，时机用 timeline。
- 删除现有的"右手骨骼 + 手臂方向 + unit*1.6"手调逻辑。

## 待清理
- `effect-particles.js` / `app.js` 里的临时诊断钩子（`window.__pdbg`）。
- 独立原型 `extracted/viewer/ringo-attack-prototype.html`（方法验证用，可保留或移走）。

## 关键原则（用户反复强调）
- 不逐英雄手调。任何"针对某英雄猜的偏移/方向/距离"都是错的方向。
- 正解 = 从 CFF0/locator 数据逆向出全量精确参数，一套逻辑全英雄通用。
