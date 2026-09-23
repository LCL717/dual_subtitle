import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubtitleSync } from '../lib/subtitle-sync.ts';

const tracks = [[{ start: 2600, end: 2602, text: 'First sentence' }, { start: 2603, end: 2605, text: 'Second sentence' },
  { start: 2606, end: 2608, text: 'Third sentence' }]];

test('native matching times out with diagnostics; a post-ad seek can recover without matching text', () => {
  const sync = createSubtitleSync(tracks);
  sync.resync();
  for (let i = 0; i <= 300; i++) assert.equal(sync.read(30 + i / 10, '', i * 100, true, 1, 0), null);
  assert.equal(sync.status().mode, 'failed');
  assert.equal(sync.status().diagnostics.reason, 'timeout:no-container');
  sync.beginSeek(true, 2600);
  sync.endSeek();
  for (let i = 0; i < 5; i++) assert.equal(sync.read(2600 + i / 10, '', 31000 + i * 100, true, 1, 0, 2600 + i / 10), null);
  assert.equal(sync.read(2600.5, '', 31500, true, 1, 0, 2600.5), 2600.5);
  assert.equal(sync.status().mode, 'raw');
  assert.equal(sync.status().diagnostics.reason, 'seek-clock-restored');
});

test('seek during an ad cannot restore raw mode; mismatched clocks fail verification', () => {
  const sync = createSubtitleSync(tracks);
  sync.resync(); sync.beginSeek(false, 0); sync.endSeek();
  assert.equal(sync.read(0, '', 0, true, 1, 0, 0), null);
  assert.equal(sync.status().mode, 'waiting-native');
  sync.beginSeek(true, 20); sync.endSeek();
  for (let i = 0; i <= 50; i++) assert.equal(sync.read(20 + i / 10, '', i * 100, true, 1, 0, 200), null);
  assert.equal(sync.status().mode, 'failed');
  assert.equal(sync.status().diagnostics.reason, 'seek-clock-unverified');
});

test('matching diagnostics describe missing text, ambiguity and anchor disagreement without storing text', () => {
  const sync = createSubtitleSync(tracks);
  sync.resync();
  sync.read(30, '', 0, true, 1, 2);
  assert.equal(sync.status().diagnostics.reason, 'multiple-containers');
  sync.read(30.1, 'not in downloaded tracks', 100, true, 1);
  assert.equal(sync.status().diagnostics.reason, 'no-match');
  sync.read(30.2, 'First sentence', 200, true, 1);
  sync.read(30.3, 'Third sentence', 300, true, 1);
  assert.equal(sync.status().diagnostics.reason, 'inconsistent-anchors');
  assert.equal(sync.status().diagnostics.matches, 2);
  assert.ok(sync.status().diagnostics.offsetDifference > 5);
  assert.ok(!JSON.stringify(sync.status()).includes('sentence'));
});
function sample(sync, raw, text, now, playing = true) { return sync.read(raw, text, now, playing, 1); }

for (const [scenario, origin] of [['continuous ad clock', 2630], ['seek-triggered ad reset', 30]]) {
  test(`native anchors recover ${scenario} without seeking or knowing ad duration`, () => {
    const sync = createSubtitleSync(tracks);
    assert.equal(sample(sync, 2500, '', 0), 2500);
    sync.resync();
    assert.equal(sample(sync, null, '', 100), null);
    assert.equal(sample(sync, origin, 'First sentence', 200), null); // may be mid-cue
    // Continuous samples are needed; long observation gaps invalidate onsets.
    for (let i = 1; i <= 30; i++) assert.equal(sample(sync, origin + i / 10, i === 30 ? 'Second sentence' : 'First sentence', 200 + i * 100), null);
    for (let i = 31; i < 60; i++) assert.equal(sample(sync, origin + i / 10, 'Second sentence', 200 + i * 100), null);
    assert.equal(sample(sync, origin + 6, 'Third sentence', 6200), 2606);
    assert.equal(sync.status().mode, 'aligned');
    assert.equal(sample(sync, origin + 6, 'Third sentence', 6300, false), 2606);
    sync.invalidate();
    assert.equal(sample(sync, 4000, 'Third sentence', 6400), null);
    sync.resync(); // another ad must discard the old mapping
    assert.equal(sync.status().offset, null);
  });
}
test('missing, repeated and incompatible native text never enables an assumed time mapping', () => {
  const sync = createSubtitleSync([[...tracks[0], { start: 2700, end: 2701, text: 'Second sentence' }]]);
  sync.resync();
  assert.equal(sample(sync, 30, '', 0), null);
  assert.equal(sample(sync, 31, 'Second sentence', 1000), null);
  assert.equal(sample(sync, 32, 'Third sentence', 2000), null);
  assert.equal(sample(sync, 33, 'unknown text', 3000), null);
  assert.equal(sample(sync, 34, '', 4000), null);
  assert.equal(sync.status().mode, 'waiting-native');
});
