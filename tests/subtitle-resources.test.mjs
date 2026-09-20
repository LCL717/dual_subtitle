import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeResources, inspectResources, isResourceReport } from '../lib/subtitle-resources.ts';
import { createTimeline } from '../lib/timeline.ts';

test('resource summary exposes structure, never signed URLs or cue text', () => {
  const summary = summarizeResources({ trackId: 'ja', downloadables: [{ contentProfile: 'webvtt-lssdh-ios8',
    urls: { '1': 'https://example.com/subtitle?secret=private' } }], cues: [{ text: 'private dialogue' }] }, 'ja', 'Japanese');
  assert.equal(summary.hasDownloadMetadata, true);
  assert.equal(summary.hasInlineCues, true);
  assert.deepEqual(summary.profiles, ['webvtt-lssdh-ios8']);
  assert.equal(JSON.stringify(summary).includes('private'), false);
});
test('metadata presence is not reported as downloadable content', () => {
  const summary = summarizeResources({ downloadableIds: { profile: 'opaque-id' } }, 'ja', 'Japanese');
  assert.equal(summary.hasDownloadMetadata, true);
  assert.equal(summary.hasInlineCues, false);
  assert.deepEqual(summary.profiles, []);
});
test('resource request rejects stale selections and duplicate languages', () => {
  assert.equal(inspectResources(undefined, ['a', 'a']).state, 'unavailable');
  assert.equal(inspectResources(undefined, ['a', 'b']).state, 'unavailable');
  assert.equal(isResourceReport({ state: 'inspected', tracks: [{}], detail: '' }), false);
});
test('resource summary handles missing metadata without guessing', () => {
  const report = { state: 'inspected', detail: 'pending', tracks: [summarizeResources({ trackId: 'ja' }, 'ja', 'Japanese')] };
  assert.equal(isResourceReport(report), true);
  assert.equal(report.tracks[0].hasDownloadMetadata, false);
});
test('timeline preserves overlapping cues, excludes the end boundary and supports backward seek', () => {
  const at = createTimeline([{ start: 1, end: 10, text: 'long' }, { start: 2, end: 3, text: 'short' },
    { start: 20, end: 21, text: 'later' }]);
  assert.deepEqual(at(2), ['long', 'short']);
  assert.deepEqual(at(3), ['long']);
  assert.deepEqual(at(10), []);
  assert.deepEqual(at(20), ['later']);
  assert.deepEqual(at(1), ['long']);
});
test('two languages have independent cue boundaries', () => {
  const upper = createTimeline([{ start: 0, end: 4, text: 'Japanese sentence' }]);
  const lower = createTimeline([{ start: 0, end: 2, text: 'first' }, { start: 2, end: 4, text: 'second' }]);
  assert.deepEqual(upper(2), ['Japanese sentence']);
  assert.deepEqual(lower(2), ['second']);
});
test('timeline rejects malformed timing and does not retain caller mutation', () => {
  const cue = { start: 1, end: 2, text: 'original' };
  const at = createTimeline([cue, { start: NaN, end: 10, text: 'invalid' }]);
  cue.text = 'changed';
  assert.deepEqual(at(1), ['original']);
  assert.deepEqual(at(Infinity), []);
});
