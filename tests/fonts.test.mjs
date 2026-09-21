import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFontList, fontStack, readLocalFonts, fontLabel } from '../lib/fonts.ts';
test('localized labels preserve original family identity and unknown names', () => {
  assert.equal(fontLabel('Microsoft YaHei'), '微软雅黑（Microsoft YaHei）');
  assert.equal(fontLabel('Yu Gothic'), '游ゴシック（Yu Gothic）');
  assert.equal(fontLabel('Custom Font'), 'Custom Font');
  assert.equal(fontLabel('日本語'), '日本語');
  assert.equal(fontLabel('constructor'), 'constructor');
  assert.ok(fontStack('Yu Gothic').startsWith('"Yu Gothic",'));
});
test('font scan builds list from returned families, deduplicating faces', async () => {
  const names = await readLocalFonts({ queryLocalFonts: async () => [{ family: 'Example' }, { family: 'Example' }, { family: '日本語' }] });
  assert.equal(names.length, 2);
  assert.ok(names.includes('日本語'));
  assert.deepEqual(normalizeFontList([null, '', '\nBad', ' Example ', 'Example']), ['Example']);
});
test('unsupported API and denied permission give actionable fallback', async () => {
  await assert.rejects(readLocalFonts({}), /系统备用字体/);
  await assert.rejects(readLocalFonts({ queryLocalFonts: async () => { throw { name: 'NotAllowedError' }; } }), /未获字体访问权限/);
});
test('font names are quoted as single CSS family and invalid names use default', () => {
  assert.equal(fontStack(''), 'Arial, "Microsoft YaHei", sans-serif');
  assert.equal(fontStack('@serif'), 'serif, Arial, "Microsoft YaHei", sans-serif');
  assert.ok(fontStack('A"B\\C').startsWith('"A\\"B\\\\C",'));
  assert.equal(fontStack('bad\nname'), fontStack(''));
});
