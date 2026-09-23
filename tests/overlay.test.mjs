import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mountOverlay } from '../lib/overlay.ts';

test('progress UI restores dual subtitles after ads with unrelated native language and survives hidden controls', async () => {
  const win = new Window({ url: 'https://www.netflix.com/watch/123' });
  const keys = ['document', 'location', 'innerHeight', 'performance'];
  const saved = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  let now = 0;
  const values = [win.document, win.location, 800, { now: () => now }];
  keys.forEach((key, i) => Object.defineProperty(globalThis, key, { configurable: true, value: values[i], writable: true }));
  let stop;
  try {
    win.document.body.innerHTML = '<div class="watch-video"><video></video><div class="scrubber-container"><div role="slider" aria-valuemin="0" aria-valuemax="2000000" aria-valuenow="1000000"></div></div><div class="player-timedtext">unrelated language</div></div>';
    const video = win.document.querySelector('video'), slider = win.document.querySelector('[role="slider"]');
    Object.defineProperty(video, 'duration', { value: 2000 });
    Object.defineProperty(video, 'paused', { value: false });
    Object.defineProperty(video, 'readyState', { value: 4 });
    video.getBoundingClientRect = () => ({ left: 0, bottom: 700, width: 1000, height: 600 });
    slider.getBoundingClientRect = () => ({ width: 500, height: 10 });
    let raw = null, epoch = 1, status;
    let shadow;
    const attach = win.HTMLElement.prototype.attachShadow;
    win.HTMLElement.prototype.attachShadow = function (options) { shadow = attach.call(this, options); return shadow; };
    stop = mountOverlay(video, [[{ start: 1000, end: 1100, text: 'mapped subtitle' }], []], 24, () => assert.fail('unexpected stop'),
      { read: () => raw, invalidate() {}, adEpoch: () => epoch }, (_, state) => { status = state; });
    for (let i = 0; i <= 20; i++) {
      now = i * 100; raw = 30 + i * .1; video.currentTime = raw;
      slider.setAttribute('aria-valuenow', String(1000000 + i * 100));
      video.dispatchEvent(new win.Event('timeupdate'));
    }
    assert.equal(status.mode, 'aligned-progress');
    assert.equal(shadow.querySelector('.line').textContent, 'mapped subtitle');
    slider.parentElement.hidden = true; raw = 32.1; now = 2100;
    video.dispatchEvent(new win.Event('timeupdate'));
    assert.equal(status.mode, 'aligned-progress');
    epoch++; raw = null; now = 2200; video.dispatchEvent(new win.Event('timeupdate'));
    assert.equal(shadow.host.hidden, true);
    assert.equal(status.progress.offset, null);
  } finally {
    stop?.(); keys.forEach((key, i) => saved[i] ? Object.defineProperty(globalThis, key, saved[i]) : delete globalThis[key]);
    await win.happyDOM.close();
  }
});

test('overlay follows seek, preserves text safety and restores native visibility on close/navigation', async () => {
  const window = new Window({ url: 'https://www.netflix.com/watch/123' });
  const previous = { document: globalThis.document, location: globalThis.location, innerHeight: globalThis.innerHeight };
  Object.assign(globalThis, { document: window.document, location: window.location, innerHeight: 800 });
  let stop;
  try {
    const video = window.document.createElement('video');
    video.getBoundingClientRect = () => ({ left: 0, bottom: 700, width: 1000, height: 600 });
    window.document.body.append(video);
    const native = window.document.createElement('div');
    native.className = 'player-timedtext'; native.textContent = 'native';
    window.document.body.append(native);
    const originalVisibility = window.getComputedStyle(native).visibility;
    let shadow;
    const originalAttach = window.HTMLElement.prototype.attachShadow;
    window.HTMLElement.prototype.attachShadow = function (options) { shadow = originalAttach.call(this, options); return shadow; };
    const tracks = [[{ start: 1, end: 3, text: '<script>not markup</script>' }], [{ start: 2, end: 4, text: 'English' }]];
    video.currentTime = 2;
    stop = mountOverlay(video, tracks, 24, () => {});
    assert.equal(shadow.querySelector('script'), null);
    assert.equal(shadow.host.style.getPropertyValue('--subtitle-background'), 'rgba(0,0,0,0)');
    assert.notEqual(shadow.querySelector('.line').style.textShadow, 'none');
    assert.equal(shadow.querySelector('.line').textContent, '<script>not markup</script>');
    assert.equal(shadow.querySelector('.lower').textContent, 'English');
    assert.equal(window.getComputedStyle(native).visibility, 'hidden');
    video.currentTime = 3;
    video.dispatchEvent(new window.Event('seeked'));
    assert.equal(shadow.querySelector('.line').textContent, '');
    assert.equal(shadow.querySelector('.lower').textContent, 'English');
    video.currentTime = 1;
    video.dispatchEvent(new window.Event('seeked'));
    assert.equal(shadow.querySelector('.lower').textContent, '');
    stop(); stop();
    assert.equal(window.getComputedStyle(native).visibility, originalVisibility);
    // Ad media time must not determine the subtitle cue. Missing/ad clock
    // restores native captions; the next content sample resynchronizes unaided.
    let contentTime = 2;
    const clock = { read: () => contentTime, invalidate: () => { contentTime = null; } };
    let style = { fontSize: 24, backgroundOpacity: 0, shadow: true };
    stop = mountOverlay(video, tracks, 24, () => {}, clock, undefined, () => style);
    video.currentTime = 200;
    video.dispatchEvent(new window.Event('timeupdate'));
    assert.equal(shadow.querySelector('.lower').textContent, 'English');
    const spanBeforeStyleChange = shadow.querySelector('.lower span');
    style = { fontSize: 30, backgroundOpacity: 50, shadow: false };
    video.dispatchEvent(new window.Event('timeupdate'));
    assert.equal(shadow.querySelector('.lower span'), spanBeforeStyleChange);
    assert.equal(shadow.querySelector('.lower').style.fontSize, '30px');
    assert.equal(shadow.querySelector('.lower').style.textShadow, 'none');
    assert.equal(shadow.host.style.getPropertyValue('--subtitle-background'), 'rgba(0,0,0,0.5)');
    contentTime = null;
    video.dispatchEvent(new window.Event('timeupdate'));
    assert.equal(shadow.querySelector('.lower').textContent, '');
    assert.equal(window.getComputedStyle(native).visibility, originalVisibility);
    contentTime = 2;
    video.dispatchEvent(new window.Event('timeupdate'));
    assert.equal(shadow.querySelector('.lower').textContent, 'English');
    assert.equal(window.getComputedStyle(native).visibility, 'hidden');
    // A replacement video after the ad is rebound and needs a fresh clock.
    const replacement = window.document.createElement('video');
    replacement.getBoundingClientRect = video.getBoundingClientRect;
    video.replaceWith(replacement);
    video.dispatchEvent(new window.Event('timeupdate'));
    assert.equal(contentTime, null);
    contentTime = 1;
    replacement.dispatchEvent(new window.Event('timeupdate'));
    assert.equal(shadow.querySelector('.lower').textContent, '');
    stop();
    replacement.replaceWith(video);
    let reason = '';
    stop = mountOverlay(video, tracks, 24, message => { reason = message; });
    window.location.href = 'https://www.netflix.com/watch/456';
    video.dispatchEvent(new window.Event('timeupdate'));
    assert.match(reason, /切换/);
    assert.equal(window.getComputedStyle(native).visibility, originalVisibility);
  } finally {
    stop?.();
    Object.assign(globalThis, previous);
    await window.happyDOM.close();
  }
});

test('ad epoch hides the overlay until two native cue onsets establish the new mapping', async () => {
  const win = new Window({ url: 'https://www.netflix.com/watch/123' });
  const previous = { document: globalThis.document, location: globalThis.location, innerHeight: globalThis.innerHeight };
  Object.assign(globalThis, { document: win.document, location: win.location, innerHeight: 800 });
  let stop;
  try {
    const video = win.document.createElement('video');
    video.getBoundingClientRect = () => ({ left: 0, bottom: 700, width: 1000, height: 600 });
    Object.defineProperty(video, 'paused', { value: false });
    Object.defineProperty(video, 'readyState', { value: 4 });
    const native = win.document.createElement('div');
    native.className = 'player-timedtext'; native.textContent = 'First native caption';
    win.document.body.append(video, native);
    let shadow;
    const attach = win.HTMLElement.prototype.attachShadow;
    win.HTMLElement.prototype.attachShadow = function (options) { shadow = attach.call(this, options); return shadow; };
    let raw = 10;
    let epoch = 0;
    let mode;
    const cues = [{ start: 10, end: 10.2, text: 'First native caption' }, { start: 10.2, end: 10.4, text: 'Second native caption' }, { start: 10.4, end: 11, text: 'Third native caption' }];
    stop = mountOverlay(video, [cues, []], 24, () => assert.fail('unexpected stop'),
      { read: () => raw, invalidate() {}, adEpoch: () => epoch }, (_, state) => { mode = state.mode; });
    const tick = () => video.dispatchEvent(new win.Event('timeupdate'));
    epoch = 1; raw = null; tick();
    assert.equal(shadow.host.hidden, true);
    assert.notEqual(win.getComputedStyle(native).visibility, 'hidden');
    raw = 30; tick();
    assert.equal(mode, 'waiting-native');
    raw = 30.2; native.textContent = 'Second native caption'; tick();
    assert.equal(shadow.host.hidden, true);
    raw = 30.4; native.textContent = 'Third native caption'; tick();
    assert.equal(mode, 'aligned');
    assert.equal(shadow.host.hidden, false);
    assert.equal(shadow.querySelector('.line').textContent, 'Third native caption');
    assert.equal(win.getComputedStyle(native).visibility, 'hidden');
    stop();
    assert.notEqual(win.getComputedStyle(native).visibility, 'hidden');
  } finally { stop?.(); Object.assign(globalThis, previous); await win.happyDOM.close(); }
});
