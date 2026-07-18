# Adagio_Angel 光照/材质问题诊断（已修复关闭，见文末结论）

日期：2026-07-06

## 用户报告
- 每个模型都有"奇怪的光"；Adagio_Angel（屠龙天使）左翅膀尖挥到某处会爆亮、像有束光；胸口有个粉紫点。
- 原则：找全局的"根"，改一处全英雄通用，不逐模型特调。

## 对照实验结论（运行时逐个关掉验证）
- **排除**：emissive 发光（6 个材质的 emissive 其实是黑的，不发光）、环境反射（scene.environment=RoomEnvironment）、bloom（strength 0.04 极弱）、边缘光 rimLight——逐个关掉画面几乎不变，都不是元凶。
- **翅膀爆亮/奇怪的光 = keyLight（暖黄方向光，强度 1.35，app.js:101）**：关掉它整体明显变暗，说明它是主亮度且偏硬。打在翅膀大白羽毛面片上，挥到正对光的角度就整片漫反射爆亮，像"一束光"。
- **胸口粉紫点 = 独立 bug**：不是主材质（6 个材质都不发光、不品红）。品红是"贴图丢失占位色"的典型——很可能某张贴图没加载成功，或一个特效小挂件。需单独查该 mesh 的贴图数据。

## "根"与下一步（不瞎调数值）
- 翅膀爆亮的根 = 全局光照 setup（keyLight 偏强偏硬）。正解不是拍脑袋降强度，而是**逆向游戏原本的光照**（交接文档的 LevelVisuals / light probe / native anchor 那条线，如 `current_native_light_probe_chain_audit`、`native_light_probe_runtime_evidence`）——像 Ringo 逆向 CFF0 那样拿到游戏真实光照参数。
- 粉紫点的根 = 定位那张丢失/错误的贴图（查 Adagio_Angel 各 mesh 的 map/贴图路径，找加载失败的）。

## 光照 setup 现状（app.js）
- renderer.toneMapping = ACESFilmic, exposure 0.82（第 82-83 行）
- hemisphereLight 1.05 / keyLight 1.35 / fillLight 0.35 / rimLight 0.45（99-107）
- scene.environment = RoomEnvironment PMREM（96-97）
- bloomPass strength 0.04 / threshold 1.08（113）
- 材质 emissive 强制 emissiveIntensity≥1 在 material-runtime-shaders.js 的 applyCharacterEmissiveRuntime（但材质 emissive 多为黑，不发光）

## 待清理
- effect-particles.js 里 Ringo 工作留的临时诊断钩子 `window.__pdbg`（3 处）——下次一并清。

## 结论（2026-07-06 修复关闭）
- 翅膀爆亮：根 = viewer 手调光照结构性偏离游戏模型。已按逆向证据接入 native preset（LIGHTING_PRESETS.native，默认）：F002_S000.lightfield 中心 probe（六方向均匀 0.245，component²×0.5 公式）+ MenuMeshData 展示点光（(0,0,100) 白色无衰减，挂相机）+ 无 tone mapping。全英雄通用，四英雄样本自检通过。详见 progress.md 2026-07-06 条目。
- 胸口粉紫点：证伪"贴图丢失占位"假设。它是 angel_mat diffuse 贴图上胸甲宝石的本色（低粗糙度+法线造型+sampler112 非零），旧强光照让它像发光点；native 光照下为正常宝石。无需修复。

## 2026-07-10 补充：native preset 缺 tonemapping 导致翅膀过曝（已修）
- 上面接入的 native preset 把 `toneMapping` 设 `"none"`（当时假设"游戏 GLES 直出无 ACES"，无证据）。但 native 的 `menuPointLight`（挂相机、无衰减、强度 1）会把翅膀正面浅粉羽毛照到亮度 >1，没有 tonemapping 压缩就直接 clip 成死白——用户复报"翅膀奇怪白光"就是这个。转开角度羽毛背面朝观众（深蓝、亮度低）就不爆。
- 修复：`native.toneMapping` `"none"` → `"aces"`（ACES 高光压缩，exposure 1）。翅膀恢复有细节的浅粉羽毛，Ringo 等明暗正常。一处改、全英雄通用。详见 progress.md 2026-07-10。
- 教训：不要假设"游戏无 tonemapping"——移动端引擎普遍有高光压缩，缺它浅色大面片正对点光必过曝爆白。

## 2026-07-11 补充：真根因是纯 AmbientLight 无方向塑形（翅膀白+黄绿斑同源，默认改 neutral）
- ACES 只缓解了死白 clip，没根治。用户复报翅膀白光还在，还框出 Ringo 腰腿的橙黄绿光斑（同一类"奇怪光效"）。
- 真根因：native preset 把游戏的 6 方向 `Probe.Samples`（本身有方向性的 irradiance）**简化成了单一 `THREE.AmbientLight`（均匀无方向）**。均匀光无明暗塑形 → 浅色面（翅膀）平板发白、贴图杂色区（绿绑带）平板浮起像光斑。两个现象同源。
- 隔离：关 menuPointLight 黄绿斑仍在（排除点光）；切 flat/neutral（带方向光）→ 翅膀正常、黄绿斑消失。
- 修：默认 preset 改为 neutral（IBL + 方向光 + ACES 0.82），方向性塑形正常。native 降为"游戏原生（实验）"选项，保留但不默认。详见 progress.md 2026-07-11。
- 教训升级：不能把有方向性的 probe/irradiance 简化成单一 AmbientLight——均匀光会让所有浅色/杂色区平板发亮，制造"伪光效"。

## 2026-07-11 二次修正：固定光斑 = 挂相机点光 + 均匀光，彻底删除 native
- 用户复报："奇怪的光"不在模型上，而是**固定在画面某位置、打物体才可见、移开物体就消失**（光源投射特征，之前一直误当材质问题查）。
- 软件渲染 selfcheck 对比确认：根源是 native 的 `menuPointLight`（挂 camera 的无衰减白点光，固定视角照亮腰腹凸起 → 固定光斑）+ `ambientProbeLight`（纯 AmbientLight 平板发亮）。
- 修：整体删除 native preset + 这两盏灯，光照只留方向光的 neutral(默认)/game/flat。详见 progress.md 2026-07-11。
- 教训：别用挂相机点光模拟游戏灯（固定光斑），别用纯 AmbientLight 当环境光（平板发亮）；GPU 挂起时用软件渲染（swiftshader）跑 selfcheck。
