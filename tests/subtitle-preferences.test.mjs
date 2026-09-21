import test from 'node:test';
import assert from 'node:assert/strict';
import { preferenceFor, readPreferences, matchPreferences } from '../lib/subtitle-preferences.ts';
const japanese = { id: 'old-ja', language: 'ja', label: 'Japanese [SDH]', variant: 'main' };
const english = { id: 'old-en', language: 'en', label: 'English', variant: '' };
const preferences = { enabled: true, upper: preferenceFor(japanese), lower: preferenceFor(english) };
test('saved preferences match new episode track IDs without losing language order', () => {
  const saved = readPreferences(JSON.parse(JSON.stringify(preferences)));
  assert.deepEqual(matchPreferences([{ ...english, id: 'new-en' }, { ...japanese, id: 'new-ja' }], saved), ['new-ja', 'new-en']);
});
test('missing SDH or variant never silently falls back to another track', () => {
  assert.deepEqual(matchPreferences([{ ...japanese, label: 'Japanese' }, english], preferences), [null, 'old-en']);
  assert.deepEqual(matchPreferences([{ ...japanese, variant: 'other' }, english], preferences), [null, 'old-en']);
});
test('ambiguous same-language variants require user selection', () => {
  assert.deepEqual(matchPreferences([japanese, { ...japanese, id: 'duplicate' }, english], preferences), [null, 'old-en']);
});
test('manual disable persists while retaining selected languages', () => {
  const saved = readPreferences(JSON.parse(JSON.stringify({ ...preferences, enabled: false })));
  assert.equal(saved.enabled, false);
  assert.deepEqual(matchPreferences([japanese, english], saved), ['old-ja', 'old-en']);
});
test('malformed preferences do not enable auto playback', () => {
  for (const value of [null, {}, { ...preferences, enabled: 'true' }, { ...preferences, lower: preferences.upper }])
    assert.equal(readPreferences(value), undefined);
});
