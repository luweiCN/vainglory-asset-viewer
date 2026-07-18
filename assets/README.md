# 模型与贴图资源

本目录保存查看器使用的去重发布资源：GLB 模型位于 `models/`，共享模型贴图位于 `models/shared_glb_textures/`，特效贴图位于 `effect_textures_preview/`。

二进制资源通过 Git LFS 管理。克隆仓库前请先安装 Git LFS；已有仓库可运行：

```bash
git lfs install
git lfs pull
```

这些文件由发布资源准备流程生成。哈希命名的共享贴图不要手工改名，否则 GLB 和运行时材质引用会失效。

《虚荣》及相关美术资源的权利归其各自权利人所有；本仓库不代表原开发商或发行商提供授权或背书。
