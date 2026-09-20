import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverResources } from '../lib/resource-discovery.ts';
import { normalizeTracks } from '../lib/netflix-tracks.ts';

test('resolves exact IDs through cyclic state without calling getters', async () => {
  let called = false;
  const root = { nested: [{ trackId: 'ja', profile: 'webvtt', urls: [{ url: 'https://a.nflxvideo.net/sub?token=secret' }] }] };
  root.loop = root;
  Object.defineProperty(root, 'getter', { get() { called = true; throw new Error('must not run'); } });
  const report = await discoverResources(root, ['ja', 'en']);
  assert.equal(report.resources.length, 1);
  assert.equal(report.resources[0].trackId, 'ja');
  assert.equal(called, false);
  assert.equal(report.skippedAccessors, 1);
});
test('ignores other track IDs, HTTP and lookalike CDN hosts', async () => {
  const urls = ['http://a.nflxvideo.net/sub', 'https://nflxvideo.net.evil.test/sub', 'https://user:pass@a.nflxvideo.net/sub'];
  const report = await discoverResources({ entries: urls.map(url => ({ trackId: 'ja', urls: [{ url }] })),
    unrelated: { trackId: 'ko', urls: [{ url: 'https://a.nflxvideo.net/sub' }] } }, ['ja']);
  assert.equal(report.resources.length, 0);
});
test('bounded search reports incomplete result', async () => {
  const report = await discoverResources({ a: { b: { c: {} } } }, ['ja'], 2);
  assert.equal(report.visited, 2);
  assert.equal(report.limited, true);
});
test('raw closedcaptions type distinguishes SDH; unknown duplicate variants get numbers', () => {
  const tracks = normalizeTracks([
    { trackId: '1', bcp47: 'ja', displayName: 'Japanese', rawTrackType: 'subtitles' },
    { trackId: '2', bcp47: 'ja', displayName: 'Japanese', rawTrackType: 'closedcaptions' },
    { trackId: '3', bcp47: 'en', displayName: 'English' },
    { trackId: '4', bcp47: 'en', displayName: 'English' },
  ]);
  assert.deepEqual(tracks.map(track => track.label), ['Japanese', 'Japanese [SDH]', 'English [轨道 1]', 'English [轨道 2]']);
});
