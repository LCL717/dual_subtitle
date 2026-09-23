import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createProgressClock, readProgress } from '../lib/progress-clock.ts';

test('progress source requires a unique visible scrubber and verified millisecond range', async () => {
  const win = new Window();
  try {
    win.document.body.innerHTML = '<div class="watch-video"><video></video><div role="slider" aria-valuenow="50"></div><div class="scrubber-container"><div role="slider" aria-valuemin="0" aria-valuemax="2421916" aria-valuenow="935898"></div></div></div>';
    const video = win.document.querySelector('video');
    Object.defineProperty(video, 'duration', { value: 2421.916666 });
    const slider = win.document.querySelector('.scrubber-container [role="slider"]');
    slider.getBoundingClientRect = () => ({ width: 100, height: 10 });
    assert.equal(readProgress(win.document, video).seconds, 935.898);
    slider.setAttribute('aria-valuemax', '100');
    assert.equal(readProgress(win.document, video).seconds, null);
    slider.setAttribute('aria-valuemax', '2421916');
    slider.setAttribute('aria-valuenow', '38%');
    assert.equal(readProgress(win.document, video).seconds, null);
    slider.setAttribute('aria-valuenow', '935898');
    const duplicate = slider.cloneNode(); duplicate.getBoundingClientRect = slider.getBoundingClientRect;
    slider.parentElement.append(duplicate);
    assert.equal(readProgress(win.document, video).reason, 'ambiguous-progress');
    duplicate.remove(); slider.parentElement.style.opacity = '0';
    assert.equal(readProgress(win.document, video).reason, 'progress-hidden');
  } finally { await win.happyDOM.close(); }
});

test('reads duration-matched slider outside video wrapper without scrubber classes and rejects volume', async () => {
  const win = new Window();
  try {
    win.document.body.innerHTML = '<div data-uia="video-player"><video></video></div><div role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"></div><div role="slider" aria-valuemin="0" aria-valuemax="2421916" aria-valuenow="1480331"></div>';
    const video = win.document.querySelector('video');
    Object.defineProperty(video, 'duration', { value: 2421.916666 });
    for (const el of win.document.querySelectorAll('[role="slider"]')) el.getBoundingClientRect = () => ({ width: 100, height: 10 });
    assert.equal(readProgress(win.document, video).seconds, 1480.331);
    win.document.querySelector('[aria-valuemax="2421916"]').remove();
    assert.equal(readProgress(win.document, video).reason, 'unverified-units-or-range');
    win.document.querySelector('[role="slider"]').remove();
    assert.equal(readProgress(win.document, video).reason, 'no-progress-candidates');
  } finally { await win.happyDOM.close(); }
});

for (const rawBase of [16, 2670]) test(`progress mapping recovers raw base ${rawBase}, follows pause and hidden controls, rejects jumps`, () => {
  const clock = createProgressClock(); const source = {};
  let time;
  for (let i = 0; i <= 20; i++) {
    time = clock.read({ seconds: 935 + i * .1, reason: 'valid', source }, rawBase + i * .1, i * 100, true, 1, 4483);
    if (i < 5) assert.equal(time, null);
  }
  assert.ok(Math.abs(time - 937) < .001);
  assert.equal(clock.status().reason, 'progress-aligned');
  assert.ok(Math.abs(clock.read({ seconds: null, reason: 'progress-unavailable' }, rawBase + 2.1, 2100, true, 1, 4483) - 937.1) < .001);
  assert.ok(Math.abs(clock.read({ seconds: null, reason: 'progress-unavailable' }, rawBase + 2.1, 2200, false, 1, 4483) - 937.1) < .001);
  assert.equal(clock.read({ seconds: null, reason: 'progress-unavailable' }, 10, 2300, true, 1, 4483), null);
  assert.equal(clock.status().offset, null);
});

test('unchanged, future seek target, delayed noisy UI and insufficient updates never calibrate', () => {
  const source = {};
  for (const scenario of ['unchanged', 'target', 'noisy']) {
    const clock = createProgressClock();
    for (let i = 0; i < 30; i++) {
      const seconds = scenario === 'unchanged' ? 500 : scenario === 'target' ? (i % 2 ? 500 : 1000) : 500 + i * .1 + (i % 2 ? .8 : 0);
      assert.equal(clock.read({ seconds, reason: 'valid', source }, 10 + i * .1, i * 100, true, 1, 2421), null);
    }
  }
});

test('stale UI, clock loss and replacement invalidate an established mapping', () => {
  const clock = createProgressClock(), source = {};
  for (let i = 0; i <= 20; i++) clock.read({ seconds: 500 + i * .1, reason: 'valid', source }, 10 + i * .1, i * 100, true, 1, 2421);
  for (let i = 21; i <= 46; i++) clock.read({ seconds: 502, reason: 'valid', source }, 10 + i * .1, i * 100, true, 1, 2421);
  assert.equal(clock.status().offset, null);
  clock.reset('advertisement');
  assert.equal(clock.read({ seconds: 600, reason: 'valid', source }, null, 5000, true, 1, 2421), null);
  assert.equal(clock.status().reason, 'clock-unavailable');
});
