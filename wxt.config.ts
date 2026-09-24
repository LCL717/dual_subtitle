import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'Dual Subtitle',
    description: 'Netflix 双语字幕工具（实验版：IMSC 文本字幕）',
    permissions: ['storage'],
    action: { default_title: 'Dual Subtitle · 双语字幕' },
  },
});
