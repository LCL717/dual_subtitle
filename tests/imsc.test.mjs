import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseImsc } from '../lib/imsc.ts';
import { isSubtitlePayload } from '../lib/dual.ts';
const parse = text => new DOMParser().parseFromString(text, 'application/xml');
const xml = (content, attributes = '') => `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ${attributes}><body>${content}</body></tt>`;

test('IMSC clock timing, Unicode, spans, entities and explicit line breaks', () => {
  const cues = parseImsc(xml('<div><p begin="00:00:01.250" end="00:00:03.000"><span>日本語 &amp; English</span><br/>次の行</p></div>'), parse);
  assert.deepEqual(cues, [{ start: 1.25, end: 3, text: '日本語 & English\n次の行' }]);
});
test('tick timestamps use document tickRate', () => {
  assert.deepEqual(parseImsc(xml('<p begin="10000000t" end="25000000t">Hi</p>', 'ttp:tickRate="10000000"'), parse),
    [{ start: 1, end: 2.5, text: 'Hi' }]);
});
test('ancestor time offsets and duration are respected', () => {
  assert.deepEqual(parseImsc(xml('<div begin="10s" end="14s"><p begin="1s" dur="10s">Hi</p></div>'), parse),
    [{ start: 11, end: 14, text: 'Hi' }]);
});
test('frame rate multipliers and default tick rate', () => {
  const cues = parseImsc(xml('<p begin="30f" end="60t">Hi</p>', 'ttp:frameRate="30" ttp:frameRateMultiplier="1000 1001"'), parse);
  assert.ok(Math.abs(cues[0].start - 1.001) < 1e-9);
  assert.ok(Math.abs(cues[0].end - 2.002) < 1e-9);
});
test('unsupported content fails explicitly instead of hiding native subtitles', () => {
  for (const content of ['<p>Missing timing</p>', '<p begin="1s" end="2s"><span begin="1s">Timed span</span></p>', '<div timeContainer="seq"><p begin="1s" end="2s">x</p></div>'])
    assert.throws(() => parseImsc(xml(content), parse));
  assert.throws(() => parseImsc('<!DOCTYPE tt><tt/>', parse));
  assert.throws(() => parseImsc('<html>Login page</html>', parse));
});
test('bridge requires two bounded, valid subtitle timelines', () => {
  const cues = [{ start: 1, end: 2, text: 'hello' }];
  assert.equal(isSubtitlePayload({ tracks: [cues, cues] }), true);
  assert.equal(isSubtitlePayload({ tracks: [cues, []] }), false);
  assert.equal(isSubtitlePayload({ tracks: [cues, [{ start: 3, end: 2, text: 'bad' }]] }), false);
  assert.equal(isSubtitlePayload({ tracks: [cues, [{ start: 1, end: 2, text: 'a'.repeat(4097) }]] }), false);
});
