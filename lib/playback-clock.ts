import { invoke, record } from './netflix-tracks.ts';

export interface PlaybackSample { seconds: number | null; ad: boolean }
export function isPlaybackSample(value: unknown): value is PlaybackSample {
  const data = record(value);
  return !!data && typeof data.ad === 'boolean' && (data.seconds === null
    || (typeof data.seconds === 'number' && Number.isFinite(data.seconds) && data.seconds >= 0));
}

// Netflix's player clock is milliseconds, independent of the HTML media clock.
// Private API and ad markers must still be verified on the user's current build.
export function readPlaybackSample(netflix: unknown, path: string, ad: boolean, observePlayer?: (player: object) => void): PlaybackSample {
  const unavailable = { seconds: null, ad };
  if (ad) return unavailable;
  try {
    const movie = /^\/watch\/(\d+)/.exec(path)?.[1];
    if (!movie) return unavailable;
    const app = record(record(record(netflix)?.appContext)?.state)?.playerApp;
    const api = record(invoke(app, 'getAPI'))?.videoPlayer;
    const sessions = invoke(api, 'getAllPlayerSessionIds');
    if (!Array.isArray(sessions) || sessions.length > 20) return unavailable;
    const watch = sessions.filter(id => typeof id === 'string' && id.startsWith('watch-'));
    const ids = watch.length ? watch : sessions;
    if (ids.length !== 1 || typeof ids[0] !== 'string') return unavailable;
    const player = invoke(api, 'getVideoPlayerBySessionId', ids[0]);
    if (player && typeof player === 'object') observePlayer?.(player);
    if (typeof record(player)?.getMovieId === 'function' && String(invoke(player, 'getMovieId')) !== movie) return unavailable;
    const milliseconds = invoke(player, 'getCurrentTime');
    if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) || milliseconds < 0) return unavailable;
    return { seconds: milliseconds / 1000, ad: false };
  } catch { return unavailable; }
}

// These are narrowly scoped candidate ad UI markers, not a text search over
// subtitles or the page. Absence is not proof that every Netflix ad is detected.
export function hasVisibleAd(doc: Document): boolean {
  return visibleAdMarkers(doc).length > 0;
}
export function visibleAdMarkers(doc: Document): string[] {
  return AD_SELECTORS.filter(selector => Array.from(doc.querySelectorAll<HTMLElement>(selector)).some(element => {
    const style = doc.defaultView?.getComputedStyle(element);
    return !element.hidden && element.getAttribute('aria-hidden') !== 'true'
      && style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0'
      && element.getClientRects().length > 0;
  }));
}
// Confirmed in both natural-entry and seek-triggered user captures. Timeline
// ad-markers and pause-ad controls are deliberately not playback-ad evidence.
export const AD_SELECTORS = ['[data-uia="ad-break"]', '[data-uia="ad-countdown"]', '[data-uia="ads-info"]', '.watch-video--ads-info',
  '[data-uia="ads-info-container"]', '[data-uia="ads-info-text"]', '[data-uia="ads-info-time"]', '.watch-video--modular-ads-container'];

export function createPlaybackClock() {
  let sample: PlaybackSample | undefined;
  let received = -Infinity;
  let resumeAfter = -Infinity;
  let adEpoch = 0;
  let adActive = false;
  return {
    update(value: PlaybackSample, now: number) {
      if (value.ad && !adActive) adEpoch++;
      adActive = value.ad;
      if (value.ad) resumeAfter = now + 500;
      sample = value; received = now;
    },
    invalidate() { sample = undefined; received = -Infinity; },
    adEpoch: () => adEpoch,
    read(now: number): number | null {
      if (!sample || sample.ad || now - received > 600 || now < resumeAfter) return null;
      // No wall-clock extrapolation: ads, pause and buffering cannot advance cues.
      return sample.seconds;
    },
  };
}
