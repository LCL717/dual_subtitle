import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStyle, DEFAULT_STYLE } from '../lib/subtitle-style.ts';
test('style defaults to transparent background and shadow, preserving legacy size', () => {
  assert.deepEqual(normalizeStyle(undefined), DEFAULT_STYLE);
  assert.deepEqual(normalizeStyle({ fontSize: 28 }), { fontSize: 28, backgroundOpacity: 0, shadow: true, fontFamily: '' });
});
test('style accepts explicit no-shadow and clamps invalid storage values', () => {
  assert.deepEqual(normalizeStyle({ fontSize: 100, backgroundOpacity: -1, shadow: false }),
    { fontSize: 36, backgroundOpacity: 0, shadow: false, fontFamily: '' });
  assert.deepEqual(normalizeStyle({ fontSize: NaN, backgroundOpacity: Infinity, shadow: 'false' }), DEFAULT_STYLE);
});

