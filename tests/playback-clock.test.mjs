import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackClock, readPlaybackSample, isPlaybackSample } from '../lib/playback-clock.ts';

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
test('ads suspend output, then fresh content time replaces any advertisement offset', () => {
  const clock = createPlaybackClock();
  clock.update({ seconds: 60, ad: false }, 0);
  assert.equal(clock.read(100), 60);
  clock.update({ seconds: 90, ad: true }, 200);
  assert.equal(clock.read(200), null);
  clock.update({ seconds: 120, ad: true }, 30000);
  clock.update({ seconds: 60, ad: false }, 30100);
  assert.equal(clock.read(30100), null);
  clock.update({ seconds: 60.5, ad: false }, 30600);
  assert.equal(clock.read(30600), 60.5);
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
