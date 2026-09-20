import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTracks, inspectNetflixTracks, isTrackReport } from '../lib/netflix-tracks.ts';

const japanese = { trackId: 'ja-1', bcp47: 'ja', displayName: '日本語', trackType: 'PRIMARY' };
const korean = { trackId: 'ko-1', bcp47: 'ko', displayName: '한국어', trackType: 'SDH' };
function netflix(players) {
  return { appContext: { state: { playerApp: { getAPI: () => ({ videoPlayer: {
    getAllPlayerSessionIds: () => Object.keys(players),
    getVideoPlayerBySessionId: id => players[id],
  } }) } } } };
}
const player = { getTimedTextTrackList: () => [japanese, korean], getTimedTextTrack: () => japanese };

test('normalization excludes off, forced and invalid entries; preserves language and SDH', () => {
  const tracks = normalizeTracks([null, japanese, japanese, korean,
    { trackId: 'none', bcp47: 'off' }, { ...japanese, trackId: 'forced', isForcedNarrative: true },
    { trackId: 'missing-language' }]);
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].language, 'ja');
  assert.equal(tracks[1].label, '한국어 [SDH]');
});
test('reads current Japanese without setters or textTracks', () => {
  const report = inspectNetflixTracks(netflix({ main: player }));
  assert.equal(report.state, 'ready');
  assert.equal(report.currentTrackId, 'ja-1');
  assert.equal(isTrackReport(report), true);
});
test('does not guess which session is the active movie', () => {
  const report = inspectNetflixTracks(netflix({ main: player, preview: player }));
  assert.equal(report.state, 'ambiguous');
  assert.deepEqual(report.tracks, []);
});
test('missing and changed player APIs fail closed', () => {
  assert.equal(inspectNetflixTracks(undefined).state, 'unavailable');
  assert.equal(inspectNetflixTracks({ appContext: { state: { playerApp: {} } } }).state, 'error');
});
test('unknown current track is not guessed from first entry', () => {
  const report = inspectNetflixTracks(netflix({ main: { getTimedTextTrackList: () => [japanese] } }));
  assert.equal(report.currentTrackId, null);
});
test('bridge rejects malformed and oversized payloads', () => {
  assert.equal(isTrackReport(null), false);
  const valid = inspectNetflixTracks(netflix({ main: player }));
  assert.equal(isTrackReport({ ...valid, tracks: [{ id: 'x' }] }), false);
  assert.equal(isTrackReport({ ...valid, tracks: Array(201).fill(valid.tracks[0]) }), false);
  assert.equal(isTrackReport({ ...valid, detail: 'x'.repeat(501) }), false);
});
