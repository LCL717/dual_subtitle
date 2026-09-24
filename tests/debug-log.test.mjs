import test from 'node:test';
import assert from 'node:assert/strict';
import { createDebugLog } from '../lib/debug-log.ts';
import { createDebugRecorder } from '../lib/debug-recorder.ts';
import { Window } from 'happy-dom';

test('debug recording is opt-in, bounded, chronological, stoppable and restartable', () => {
  let time = 0;
  const log = createDebugLog(3, () => time);
  const row = event => ({ event, videoTime: 5, videoId: 1, paused: false, seeking: false, rate: 1, readyState: 4, phase: 'active', waiting: false });
  log.add(row('ignored'));
  assert.equal(log.status().count, 0);
  log.start();
  for (let i = 0; i < 5; i++) { time += 250; log.add(row(String(i))); }
  assert.deepEqual(log.export().entries.map(x => x.event), ['2', '3', '4']);
  assert.equal(log.status().dropped, 2);
  log.start();
  assert.equal(log.status().count, 3);
  log.stop(); time += 1000; log.add(row('ignored'));
  assert.equal(log.status().durationMs, 1250);
  assert.equal(log.status().count, 3);
  log.start();
  assert.equal(log.status().count, 0);
  assert.equal(log.status().dropped, 0);
});

test('recorder correlates responses, captures seek events, redacts extras and stops listeners', async () => {
  const win = new Window({ url: 'https://www.netflix.com/watch/123' });
  const keys = ['window', 'document', 'location', 'HTMLVideoElement'];
  const previous = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  keys.forEach(key => Object.defineProperty(globalThis, key, { value: win[key === 'window' ? 'window' : key], configurable: true }));
  const sent = [];
  win.postMessage = message => sent.push(message);
  const recorder = createDebugRecorder(() => ({ phase: 'active', waiting: false }));
  try {
    win.document.body.innerHTML = '<video></video>';
    recorder.start();
    const request = sent[0];
    const response = { type: 'dual:debug-clock-response:v1', id: request.id, path: request.path,
      seconds: 120, playerId: 1, ad: false, markers: ['secret', '[data-uia="ads-info"]'], secret: 'cookie' };
    win.dispatchEvent(new win.MessageEvent('message', { origin: win.location.origin, source: win, data: { ...response, id: 'wrong' } }));
    assert.equal(recorder.status().count, 1);
    win.dispatchEvent(new win.MessageEvent('message', { origin: win.location.origin, source: win, data: response }));
    win.document.querySelector('video').dispatchEvent(new win.Event('seeked'));
    recorder.stop();
    const output = recorder.export();
    assert.deepEqual(output.entries.map(x => x.event), ['recording-start', 'sample', 'seeked', 'recording-stop']);
    assert.equal(output.entries[1].playerTime, 120);
    assert.deepEqual(output.entries[1].markers, ['[data-uia="ads-info"]']);
    assert.ok(!JSON.stringify(output).includes('cookie'));
    win.document.querySelector('video').dispatchEvent(new win.Event('seeked'));
    assert.equal(recorder.status().count, 4);
  } finally {
    recorder.dispose();
    keys.forEach((key, index) => previous[index] ? Object.defineProperty(globalThis, key, previous[index]) : delete globalThis[key]);
    await win.happyDOM.close();
  }
});
