import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeSelection } from '../lib/native-selection.ts';
const tracks = [{ id: 'ja', language: 'ja', label: 'Japanese' }, { id: 'ja-sdh', language: 'ja', label: 'Japanese [SDH]' }, { id: 'en', language: 'en', label: 'English' }];
const report = { state: 'ready', tracks, currentTrackId: 'ja-sdh', detail: '' };
test('first track follows exact native variant and changes with Netflix', () => {
  assert.deepEqual(nativeSelection(report, 'en').ids, ['ja-sdh', 'en']);
  assert.deepEqual(nativeSelection({ ...report, currentTrackId: 'ja' }, 'en').ids, ['ja', 'en']);
});
test('off, unavailable, missing second track and same-language combinations suspend dual', () => {
  for (const currentTrackId of [null, 'off', 'missing']) assert.equal(nativeSelection({ ...report, currentTrackId }, 'en').ids, null);
  assert.equal(nativeSelection({ ...report, state: 'unavailable' }, 'en').ids, null);
  for (const lower of [null, 'missing', 'ja', 'ja-sdh']) assert.equal(nativeSelection(report, lower).ids, null);
});
