# Dul Subtitle

Chrome / Edge 的 Netflix 双语字幕扩展，使用 WXT + TypeScript + 原生 HTML/CSS。

## 当前进度

已完成工程骨架，并增加实验性 Netflix 字幕列表读取、当前字幕识别与上下语言选择预览。字号预览支持本机保存。

**目前不能显示 Netflix 双语字幕。** 成功读取后开放语言选择，开启按钮仍禁用。选择仅用于本次弹窗核对，不改变原生字幕或保存语言偏好。Netflix 私有接口尚未实测；下一步需核对真实列表，再验证两条字幕内容获取。

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