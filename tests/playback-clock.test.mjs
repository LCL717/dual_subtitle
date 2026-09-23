import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackClock, readPlaybackSample, isPlaybackSample, visibleAdMarkers } from '../lib/playback-clock.ts';
import { Window } from 'happy-dom';

function netflix(player, sessions = ['watch-main']) {
  return { appContext: { state: { playerApp: { getAPI: () => ({ videoPlayer: {
    getAllPlayerSessionIds: () => sessions, getVideoPlayerBySessionId: () => player,
  } }) } } } };
}
test('uses Netflix milliseconds and rejects other movies and ambiguous sessions', () => {
  const player = { getCurrentTime: () => 12500, getMovieId: () => 123 };
  assert.deepEqual(readPlaybackSample(netflix(player), '/watch/123', false), { seconds: 12.5, ad: false });
  assert.equal(readPlaybackSample(netflix(player), '/watch/456', false).seconds, null);
  assert.equal(readPlaybackSample(netflix(player, ['watch-a', 'watch-b']), '/watch/123', false).seconds, null);
  assert.equal(readPlaybackSample(netflix(player), '/watch/123', true).seconds, null);
});
test('ad clock suppresses samples and reports an epoch for downstream native calibration', () => {
  const clock = createPlaybackClock();
  clock.update({ seconds: 60, ad: false }, 0);
  assert.equal(clock.read(100), 60);
  clock.update({ seconds: 90, ad: true }, 200);
  assert.equal(clock.adEpoch(), 1);
  assert.equal(clock.read(200), null);
  clock.update({ seconds: 120, ad: true }, 30000);
  clock.invalidate();
  assert.equal(clock.adEpoch(), 1);
  clock.update({ seconds: 60, ad: false }, 30100);
  assert.equal(clock.read(30100), null);
  clock.update({ seconds: 60.5, ad: false }, 30600);
  assert.equal(clock.read(30600), 60.5);
  clock.update({ seconds: null, ad: true }, 31000);
  assert.equal(clock.adEpoch(), 2);
});

test('recognizes captured Netflix ad UI, excluding progress markers and pause-ad controls', async () => {
  const win = new Window();
  try {
    win.document.body.innerHTML = '<div data-uia="ads-info-container"><span data-uia="ads-info-time"></span></div><div class="watch-video--modular-ads-container"></div><div data-uia="ad-markers"></div><div data-uia="pause-ad"></div>';
    for (const el of win.document.querySelectorAll('*')) el.getClientRects = () => [{ width: 10, height: 10 }];
    const markers = visibleAdMarkers(win.document);
    assert.ok(markers.includes('[data-uia="ads-info-container"]'));
    assert.ok(markers.includes('[data-uia="ads-info-time"]'));
    assert.ok(markers.includes('.watch-video--modular-ads-container'));
    assert.ok(!markers.some(x => x.includes('ad-markers') || x.includes('pause-ad')));
    win.document.querySelector('[data-uia="ads-info-container"]').style.visibility = 'hidden';
    win.document.querySelector('.watch-video--modular-ads-container').hidden = true;
    assert.deepEqual(visibleAdMarkers(win.document), []);
  } finally { await win.happyDOM.close(); }
});
test('does not extrapolate during pause, expires stale data and resets on seek', () => {
  const clock = createPlaybackClock();
  clock.update({ seconds: 10, ad: false }, 0);
  assert.equal(clock.read(500), 10);
  assert.equal(clock.read(601), null);
  clock.invalidate(); assert.equal(clock.read(0), null);
  clock.update({ seconds: 4, ad: false }, 700);
  assert.equal(clock.read(700), 4);
  assert.equal(isPlaybackSample({ seconds: NaN, ad: false }), false);
  assert.equal(isPlaybackSample({ seconds: 1, ad: 'false' }), false);
});
