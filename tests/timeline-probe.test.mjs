import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { readTimelineControls, timelineInteraction } from '../lib/timeline-probe.ts';

test('timeline experiment preserves numerical units and filters titles, text and URLs', async () => {
  const win = new Window();
  try {
    win.document.body.innerHTML = '<div role="slider" aria-valuenow="37.5" aria-valuemin="0" aria-valuemax="100" aria-valuetext="private title 12:34 of 1:20:00"><span style="width:37.5%">secret</span></div><input type="range" value="25">';
    const el = win.document.querySelector('[role="slider"]');
    el.getBoundingClientRect = () => ({ left: 100, width: 200, height: 10 });
    const rows = readTimelineControls(win.document);
    assert.equal(rows[0].now, '37.5');
    assert.equal(rows[0].max, '100');
    assert.deepEqual(rows[0].timeTokens, ['12:34', '1:20:00']);
    assert.deepEqual(rows[0].childWidths, ['37.5%']);
    assert.ok(!JSON.stringify(rows).includes('secret'));
    assert.ok(!JSON.stringify(rows).includes('private'));
    let sample;
    el.addEventListener('pointerdown', event => { sample = timelineInteraction(event, win.document); });
    el.dispatchEvent(new win.MouseEvent('pointerdown', { clientX: 150, bubbles: true }));
    assert.equal(sample.fraction, .25);
    assert.equal(sample.index, 0);
    win.document.body.insertAdjacentHTML('beforeend', '<div role="slider" aria-valuenow="https://secret"></div>'.repeat(30));
    assert.equal(readTimelineControls(win.document).length, 16);
    assert.equal(readTimelineControls(win.document)[2].now, null);
  } finally { await win.happyDOM.close(); }
});
