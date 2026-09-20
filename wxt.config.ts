import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'Dul Subtitle',
    description: 'Netflix 双语字幕工具（开发预览：字幕轨道接入中）',
    permissions: ['storage'],
    action: { default_title: 'Dul Subtitle · 双语字幕' },
  },
});