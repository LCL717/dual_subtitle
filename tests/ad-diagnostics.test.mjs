import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { readAdCandidates, readPlayerHints, sanitizeAdDiagnostics } from '../lib/ad-diagnostics.ts';

test('player diagnostics inspect descriptors without invoking getters or methods', () => {
  const player = { isAdPlaying: true, adState: 3, adUrl: 'https://secret', isAd() { throw Error('must not call'); },
    get adBreak() { throw Error('must not read'); }, title: 'private' };
  const result = readPlayerHints(player);
  assert.ok(result.some(x => x.name === 'isAdPlaying' && x.value === true));
  assert.ok(result.some(x => x.name === 'adBreak' && x.kind === 'accessor' && x.value === null));
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.ok(!JSON.stringify(result).includes('private'));
});
test('DOM scan collects bounded candidate tokens without text, URLs or arbitrary attributes', async () => {
  const win = new Window();
  try {
    win.document.body.innerHTML = '<div class="ad-container" data-uia="ads-countdown" title="private">subtitle secret</div><div class="header loading"></div>';
    const el = win.document.querySelector('div');
    el.getClientRects = () => [{ width: 10, height: 10 }];
    const result = readAdCandidates(win.document);
    assert.equal(result.candidates.length, 2);
    assert.ok(result.candidates.every(x => x.visible));
    assert.ok(!JSON.stringify(result).includes('secret'));
    const cleaned = sanitizeAdDiagnostics({ ...result, playerHints: [{ name: 'adState', kind: 'value', value: 'secret' }], secret: 'cookie' });
    assert.equal(cleaned.playerHints[0].value, null);
    assert.ok(!JSON.stringify(cleaned).includes('cookie'));
    assert.equal(sanitizeAdDiagnostics({ candidates: Array(100).fill(result.candidates[0]) }).candidates.length, 24);
  } finally { await win.happyDOM.close(); }
});
