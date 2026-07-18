# 虚荣英雄模型查看器

一个用于离线查看《虚荣》英雄、皮肤、模型形态、材质、骨骼、动画和特效部件的桌面应用。

## 下载

请从 [GitHub Releases](../../releases) 下载对应平台的完整安装包。macOS 和 Windows 分为两个 Release，安装包已经包含运行所需的模型、贴图、动画和界面资源，安装后无需另外下载游戏数据。

## 支持平台

- macOS Apple Silicon（ARM64）
- macOS Intel（x64）
- Windows 64 位（x64）

## 开发

```bash
npm ci
npm run electron:start
```

公开仓库不提交游戏资源、构建缓存、历史备份和安装包。版本标签触发 GitHub Actions，使用固定版本、经过校验的完整应用资源分别生成 macOS 与 Windows 离线安装包。
