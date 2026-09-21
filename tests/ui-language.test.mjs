import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLanguage, translate, messages } from '../lib/ui-messages.ts';
import { UI_LANGUAGE_KEY } from '../lib/ui-messages.ts';
import { initializeLanguage, t } from '../lib/ui-language.ts';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';

test('saved language takes priority, otherwise browser locale selects a supported language', () => {
  assert.equal(resolveLanguage('en', 'zh-CN'), 'en');
  assert.equal(resolveLanguage('zh-CN', 'en-US'), 'zh-CN');
  assert.equal(resolveLanguage(undefined, 'zh-TW'), 'zh-CN');
  assert.equal(resolveLanguage('invalid', 'ja-JP'), 'en');
});
test('dynamic messages translate without changing track names or browser errors', () => {
  assert.equal(translate('已选上方：日本語 [SDH]；下方：English。点击开启以应用此组合。', 'en'), 'Upper: 日本語 [SDH]; lower: English. Enable to apply this combination.');
  assert.equal(translate('资源检查失败：字幕请求失败（HTTP 403）。', 'en'), 'Resource inspection failed: Subtitle request failed (HTTP 403).');
  assert.equal(translate('错误详情：NetworkError', 'en'), 'Error details: NetworkError');
  assert.equal(translate('微软雅黑（Microsoft YaHei）', 'en'), '微软雅黑（Microsoft YaHei）');
  assert.equal(translate('双语字幕已开启。 语言偏好保存失败，请稍后重试。', 'en'), 'Dual subtitles are on. Unable to save language preferences. Try again later.');
  assert.equal(translate('日本語：发现资源信息（imsc1.1）\nEnglish：未发现资源信息（格式未知）', 'en'), '日本語: Resource metadata found (imsc1.1)\nEnglish: No resource metadata found (Unknown format)');
  assert.equal(translate('错误详情：$&', 'en'), 'Error details: $&');
  assert.equal(translate('日本語 [轨道 2]', 'en'), '日本語 [Track 2]');
});

test('both UI pages translate static controls, preserve preview, and persist language before reloading', async () => {
  for (const page of ['popup', 'fonts']) {
    const win = new Window();
    try {
      win.document.write(readFileSync(new URL(`../entrypoints/${page}/index.html`, import.meta.url), 'utf8'));
      const preview = win.document.querySelector('.preview')?.textContent;
      let saved = { [UI_LANGUAGE_KEY]: 'en' };
      let reloads = 0;
      await initializeLanguage({ get: async () => saved, set: async value => { saved = value; } }, win.document, () => { reloads++; }, 'zh-CN');
      assert.equal(win.document.documentElement.lang, 'en');
      assert.equal(win.document.querySelector('h1').textContent, page === 'popup' ? 'Two languages, together.' : 'Read local fonts');
      if (page === 'popup') assert.equal(win.document.querySelector('.preview').textContent, preview);
      assert.equal(t('双语字幕已开启。'), 'Dual subtitles are on.');
      const select = win.document.querySelector('#ui-language');
      assert.equal(select.value, 'en');
      select.value = 'zh-CN';
      select.dispatchEvent(new win.Event('change'));
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(saved, { [UI_LANGUAGE_KEY]: 'zh-CN' });
      assert.equal(reloads, 1);
    } finally { await win.happyDOM.close(); }
  }
});

test('storage failures keep language switch usable without reloading', async () => {
  const win = new Window();
  try {
    win.document.body.innerHTML = '<main><h1>播放器状态</h1></main>';
    await initializeLanguage({ get: async () => { throw Error('unavailable'); }, set: async () => { throw Error('quota'); } }, win.document, () => assert.fail('must not reload'), 'en-US');
    const select = win.document.querySelector('#ui-language');
    select.value = 'zh-CN';
    select.dispatchEvent(new win.Event('change'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(select.value, 'en');
    assert.equal(select.disabled, false);
    assert.match(win.document.querySelector('[role="status"]').textContent, /Unable to save/);
  } finally { await win.happyDOM.close(); }
});
test('all literal messages translate and Chinese preserves original text', () => {
  for (const [source, english] of Object.entries(messages)) {
    if (!source.includes('{0}')) assert.equal(translate(source, 'en'), english);
    assert.equal(translate(source, 'zh-CN'), source);
  }
  assert.equal(translate('  字幕字号 ', 'en'), '  Font size ');
});
