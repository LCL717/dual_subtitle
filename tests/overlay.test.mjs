import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mountOverlay } from '../lib/overlay.ts';

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
