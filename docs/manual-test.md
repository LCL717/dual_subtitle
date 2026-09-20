# 验证记录

## 2026-09-20 构建检查

- Node.js LTS 24.19.0、WXT 0.21.4、TypeScript 7.0.2。
- npm 安装完成，安装时审计报告为 0 个已知漏洞。
- `npm.cmd run postinstall`：通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run build`：通过，输出 `.output/chrome-mv3`。
- `npm.cmd run build:edge`：通过，输出 `.output/edge-mv3`。

以上仅是静态检查和构建结果，不代表真实浏览器或 Netflix 功能已通过。

## 手动检查（待执行）

分别在 Chrome / Edge 记录浏览器版本与结果：

- 加载对应构建目录，无扩展加载错误，弹窗正常显示。
- 非 Netflix 标签页：显示未连接提示，无未处理异常。
- Netflix 浏览页：显示请进入影片的提示。
- Netflix 播放页：加载完成后重新检测能识别视频。
- Netflix 页面内导航后，重新检测反映当前页状态。
- 字幕语言列表和开启按钮保持禁用，清楚提示功能开发中。
- 字号可在 16–36 px 调整，关闭再打开弹窗后保留。
- 键盘能操作重新检测与字号，焦点可见。
- 原生播放及原生字幕不受影响。

真实双轨字幕验收另按 PLAN.md 执行。