import type { Cue } from './timeline.ts';

export type SyncMode = 'raw' | 'waiting-native' | 'aligned' | 'failed' | 'recovering-seek' | 'aligned-progress';
export interface SyncStatus { mode: SyncMode; offset: number | null; progress?: ReturnType<ReturnType<typeof import('./progress-clock.ts').createProgressClock>['status']>; diagnostics?: {
  reason: string; containers: number; textLength: number; changes: number; matches: number; offsetDifference: number | null;
} }
const key = (text: string) => text.normalize('NFKC').replace(/[\s\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '');

// Raw media time can remain on an advertisement timeline. Recover its mapping
// from two observed native cue onsets, never from elapsed advertisement duration.
export function createSubtitleSync(tracks: Cue[][]) {
  const starts = new Map<string, number | null>();
  for (const track of tracks) for (const cue of track) {
    const text = key(cue.text);
    if (text.length < 4 || text.length > 4096) continue;
    if (!starts.has(text)) starts.set(text, cue.start);
    else if (starts.get(text) !== cue.start) starts.set(text, null);
  }
  let mode: SyncMode = 'raw';
  let offset = 0;
  let lastText: string | undefined;
  let anchor: { start: number; raw: number } | undefined;
  let previous: { raw: number; now: number; rate: number } | undefined;
  let waitingSince: number | undefined;
  let seekOrigin: number | undefined;
  let stableSince: number | undefined;
  let reason = 'raw-clock';
  let containers = 0, textLength = 0, changes = 0, matches = 0;
  let offsetDifference: number | null = null;
  // Avoid subtract/add cancellation placing an exact onset just before its cue.
  const mappedTime = (raw: number) => Math.max(0, Math.round((raw + offset) * 1e6) / 1e6);
  function resync() {
    mode = 'waiting-native'; offset = 0; anchor = undefined; lastText = undefined; previous = undefined;
    waitingSince = undefined; seekOrigin = undefined; stableSince = undefined;
    reason = 'waiting-clock'; changes = 0; matches = 0; offsetDifference = null;
  }
  return {
    resync,
    invalidate() { if (mode !== 'raw' && mode !== 'failed') resync(); },
    beginSeek(allowed: boolean, videoTime: number) {
      if (mode === 'raw') return;
      const before = previous?.raw ?? videoTime;
      resync();
      if (allowed) { seekOrigin = before; reason = 'seeking'; }
    },
    endSeek() { if (seekOrigin !== undefined) { mode = 'recovering-seek'; reason = 'verifying-seek-clock'; } },
    status(): SyncStatus { return { mode, offset: mode === 'aligned' ? offset : null,
      diagnostics: { reason, containers, textLength, changes, matches, offsetDifference } }; },
    read(raw: number | null, nativeText: string, now: number, playing: boolean, rate: number, nativeContainers = 1, videoTime = raw): number | null {
      if (mode === 'failed') return null;
      containers = nativeContainers; textLength = nativeText.length;
      if (raw === null || !Number.isFinite(raw) || raw < 0) {
        if (mode === 'aligned') resync();
        // Never use a caption first seen while timing is unavailable as an onset.
        lastText = undefined; anchor = undefined; previous = undefined;
        stableSince = undefined;
        return null;
      }
      if (mode === 'raw') return raw;
      waitingSince ??= now;
      if (mode === 'recovering-seek') {
        if (now - waitingSince >= 5000) { mode = 'failed'; reason = 'seek-clock-unverified'; return null; }
        const consistent = videoTime !== null && Math.abs(videoTime - raw) <= .75 && seekOrigin !== undefined
          && Math.abs(raw - seekOrigin) >= .5 && (!previous || (now - previous.now <= 600 && raw >= previous.raw - .1
            && raw - previous.raw <= .5 + (now - previous.now) / 1000 * Math.max(rate, previous.rate)));
        previous = { raw, now, rate };
        if (!consistent) stableSince = undefined;
        else stableSince ??= now;
        if (stableSince !== undefined && now - stableSince >= 500) { mode = 'raw'; offset = 0; reason = 'seek-clock-restored'; return raw; }
        return null;
      }
      if (mode === 'waiting-native' && now - waitingSince >= 30000) { mode = 'failed'; reason = `timeout:${reason}`; return null; }
      if (previous && (now - previous.now > 1000 || raw < previous.raw - .5
        || raw - previous.raw > 1 + (now - previous.now) / 1000 * Math.max(rate, previous.rate))) {
        const deadlineStart = waitingSince; resync(); waitingSince = deadlineStart; reason = 'clock-discontinuity';
      }
      previous = { raw, now, rate };
      const text = key(nativeText.slice(0, 4097));
      if (!playing) { lastText = text; anchor = undefined; reason = 'paused-or-buffering'; return mode === 'aligned' ? mappedTime(raw) : null; }
      const changed = lastText !== undefined && text !== lastText;
      if (changed) changes++;
      reason = containers === 0 ? 'no-container' : containers > 1 ? 'multiple-containers' : !text ? 'empty-text'
        : text.length < 4 ? 'text-too-short' : !changed ? (lastText === undefined ? 'waiting-text-change' : reason) : 'no-match';
      lastText = text;
      const start = changed ? starts.get(text) : undefined;
      if (typeof start === 'number') {
        matches++;
        const candidate = start - raw;
        offsetDifference = anchor ? candidate - (anchor.start - anchor.raw) : null;
        reason = anchor ? 'inconsistent-anchors' : 'first-anchor';
        if (mode === 'aligned' && Math.abs(candidate - offset) > .75) {
          mode = 'waiting-native'; anchor = undefined;
        }
        if (mode === 'waiting-native') {
          if (anchor && start > anchor.start && raw > anchor.raw
            && raw - anchor.raw <= 60 && Math.abs(candidate - (anchor.start - anchor.raw)) <= .75) {
            offset = candidate; mode = 'aligned'; reason = 'matched-anchors';
          }
          anchor = { start, raw };
        }
      } else if (changed && starts.get(text) === null) reason = 'ambiguous-match';
      return mode === 'aligned' ? mappedTime(raw) : null;
    },
  };
}

export function nativeSubtitleSnapshot(doc: Document): { text: string; count: number } {
  const roots = Array.from(doc.querySelectorAll<HTMLElement>('.player-timedtext')).filter(el =>
    !el.parentElement?.closest('.player-timedtext') && !el.hidden && el.getAttribute('aria-hidden') !== 'true'
    && doc.defaultView?.getComputedStyle(el).display !== 'none');
  // Multiple containers can represent previews or stale players: do not guess.
  return { count: roots.length, text: roots.length === 1 ? (roots[0]!.textContent ?? '').slice(0, 4097) : '' };
}
