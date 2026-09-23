import test from 'node:test';
import assert from 'node:assert/strict';
import { createInternalTimingProbe, sanitizeInternalTiming } from '../lib/internal-timing-probe.ts';

test('read-only probe follows retained ancestors, detects new state, and resets each session', () => {
  let time = 0;
  let attached = true;
  const ancestor = { memoizedState: { position: 120 }, return: null };
  const fiber = { return: ancestor, memoizedProps: { currentTime: 120 } };
  const node = { __reactFiber$private: fiber, parentElement: null };
  const doc = { querySelectorAll: () => attached ? [node] : [] };
  let invoked = 0;
  const player = { getCurrentTime() { invoked++; }, secret: 'private title' };
  Object.defineProperty(player, 'position', { get() { invoked++; throw Error('getter invoked'); } });
  const probe = createInternalTimingProbe(() => time);
  const first = probe.sample(doc, player, 'one');
  assert.ok(first.candidates.some(row => row.value === 120 && !row.retained));
  assert.ok(first.candidates.some(row => row.kind === 'accessor'));
  attached = false; time += 1000;
  ancestor.memoizedState = { position: 121 };
  const hidden = probe.sample(doc, player, 'one');
  assert.ok(hidden.candidates.some(row => row.value === 121 && row.retained));
  assert.equal(invoked, 0);
  assert.ok(!JSON.stringify(hidden).includes('private'));
  assert.ok(!probe.sample(doc, player, 'two').candidates.some(row => row.source === 'control'));
  attached = true; probe.sample(doc, player, 'two');
  attached = false; time += 6000;
  assert.ok(!probe.sample(doc, player, 'two').candidates.some(row => row.source === 'control'));
});

test('cycles and large graphs stay bounded; boundary sanitizer rejects arbitrary data', () => {
  const player = { currentTime: 1 };
  player.state = player;
  const result = createInternalTimingProbe(() => 0).sample({ querySelectorAll: () => [] }, player, 'one');
  assert.equal(result.visited, 1);
  assert.deepEqual(sanitizeInternalTiming(result), result);
  const malicious = { ...result, secret: 'private', candidates: [
    ...result.candidates, { root: 1, source: 'control', path: 'privateTitle.time', kind: 'number', value: 1 },
    { root: 1, source: 'control', path: 'time', kind: 'number', value: 'private' },
  ] };
  assert.deepEqual(sanitizeInternalTiming(malicious), result);
  const large = {};
  for (let i = 0; i < 200; i++) large[`field${i}`] = i;
  assert.equal(createInternalTimingProbe(() => 0).sample({ querySelectorAll: () => [] }, large, 'one').limited, true);
});
