# Dul Subtitle

Chrome / Edge 的 Netflix 双语字幕扩展，使用 WXT + TypeScript + 原生 HTML/CSS。

## 当前进度

已实现实验性的字幕加载与上下双语叠加。用户已验证能找到 Japanese [SDH] 和 English [SDH] 两条 imsc1.1 字幕地址；新版真实下载和双语显示仍待 Netflix 页面实测。

1. 在扩展管理页重新加载扩展，再刷新 Netflix。
2. 打开扩展，重新检测，选择上下两种不同语言。
3. 点击“开启双语字幕（实验版）”，等待结果；成功时显示两轨段落数量。
4. 回到视频检查同步、暂停、拖动和全屏。
5. 点击“关闭并恢复原生字幕”退出。下载或解析失败时保留原生字幕，错误显示在按钮下方。

当前支持常见 IMSC/TTML 文本段落、时钟/帧/tick 时间、换行与父级时间偏移。暂不支持图像字幕、段内独立计时、顺序时间容器、复杂排版或 WebVTT。无字幕导入、无机器翻译。

字幕请求在 Netflix 页面内发起，不增加跨域扩展权限；如果遇到 CORS、请求失败或格式错误，请提供扩展里的错误提示。不要发送带凭据的字幕地址。

语言偏好尚不持久保存。字号调整后需重新开启应用；切集或播放器重建会自动停止并恢复原生字幕，需要重新检测与开启。此版本不宣称最终计划已全部完成。

## 先看界面（不需要敲命令）

本次已生成构建目录，可直接加载：

1. Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
2. 开启“开发者模式”，点击“加载已解压的扩展程序”。
3. Chrome 选择项目下 `.output/chrome-mv3`，Edge 选择 `.output/edge-mv3`。请选择包含 manifest.json 的目录，不要选择项目根目录。
4. 从浏览器扩展列表打开 Dul Subtitle，可将图标固定到工具栏。
5. 打开或刷新 Netflix，再点击扩展中的“重新检测”。已打开的页面需要刷新才能加载新安装的内容脚本。
6. 调整预览字号，关闭再打开弹窗，检查字号是否保留。

读取字幕列表后也不代表双语显示已可用。更新扩展后需要在扩展管理页重新加载，再刷新 Netflix。预览中的文字是固定示例，与当前影片无关。

## 在 VS Code 开发

已安装 Node.js LTS。若 VS Code 终端找不到 node / npm，请完全退出并重新打开 VS Code，以更新 PATH。

Windows PowerShell 建议使用 npm.cmd，避免 npm.ps1 的执行策略问题：

```powershell
npm.cmd ci
npm.cmd run dev
```

`npm.cmd ci` 按 package-lock.json 安装依赖；初次安装已完成，不必现在重复执行。WXT 开发模式会启动开发浏览器。若自动启动受浏览器限制，可构建后按上面的步骤手动加载。

```powershell
npm.cmd run dev:edge
npm.cmd run typecheck
npm.cmd run build
npm.cmd run build:edge
npm.cmd run zip
```

- `dev` / `dev:edge`：启动开发流程，按 Ctrl+C 停止。
- `typecheck`：检查 TypeScript 类型。
- `build` / `build:edge`：生成对应浏览器的生产构建。
- `zip`：生成 Chrome 扩展压缩包，不会上传或发布。

修改代码并重新构建后，在扩展管理页点击刷新；如修改了内容脚本，还需刷新 Netflix 页面。

## 文件说明

- `wxt.config.ts`：WXT 和扩展配置；manifest.json 由 WXT 生成。
- `entrypoints/popup/`：工具栏弹窗界面与设置。
- `entrypoints/netflix.content.ts`：只在 Netflix 页面运行的检测代码。
- `lib/protocol.ts`：弹窗与页面间的消息约定。
- `PLAN.md`：最终需求与分阶段计划。
- `docs/feasibility.md`：双轨字幕可行性状态。
- `docs/manual-test.md`：构建记录与手动测试清单。
- `.output/`：构建结果，`.wxt/`：自动生成的开发文件，均不应手工修改或提交。

## 权限

目前仅申请 storage，用于保存预览字号；内容脚本仅匹配 `https://www.netflix.com/*`。当前不读取 Cookie，不上传数据，不修改 Netflix 原生字幕，也不请求所有网站权限。

## 开发资料

- [WXT 安装与从零创建项目](https://wxt.dev/guide/installation)
- [WXT 入口文件约定](https://wxt.dev/guide/essentials/entrypoints)
- [Chrome 本地加载扩展](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)
## 当前需要验证的步骤

更新扩展并刷新 Netflix，重新检测后选择两种不同语言，点击“检查所选字幕资源”。请记录结果；该功能仅检查字段结构，尚不下载或显示双轨字幕。
