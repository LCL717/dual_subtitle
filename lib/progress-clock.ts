export interface ProgressReading { seconds: number | null; reason: string; source?: object }
export function readProgress(doc: Document, video: HTMLVideoElement): ProgressReading {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) return { seconds: null, reason: 'invalid-duration' };
  // Controls may be siblings of the nearest video wrapper, not descendants.
  // Identify by the verified duration scale rather than an assumed DOM hierarchy.
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>('[role="slider"][aria-valuenow]'));
  if (candidates.length > 32) return { seconds: null, reason: 'too-many-candidates' };
  if (!candidates.length) return { seconds: null, reason: 'no-progress-candidates' };
  const parse = (el: Element, name: string) => {
    const raw = el.getAttribute(name);
    return raw !== null && raw.length <= 64 && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
  };
  const valid = candidates.filter(el => {
    const min = parse(el, 'aria-valuemin'), max = parse(el, 'aria-valuemax'), value = parse(el, 'aria-valuenow');
    return [min, max, value].every(Number.isFinite) && min === 0 && max > 0
      && Math.abs(max / 1000 - duration) <= .25 && value >= min && value <= max;
  });
  if (!valid.length) return { seconds: null, reason: 'unverified-units-or-range' };
  const visible = valid.filter(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      const style = doc.defaultView?.getComputedStyle(node);
      if (node.hidden || node.getAttribute('aria-hidden') === 'true' || style?.display === 'none'
        || style?.visibility === 'hidden' || style?.opacity === '0') return false;
    }
    return true;
  });
  if (visible.length !== 1) return { seconds: null, reason: visible.length ? 'ambiguous-progress' : 'progress-hidden' };
  const el = visible[0]!;
  return { seconds: parse(el, 'aria-valuenow') / 1000, reason: 'milliseconds-duration-verified', source: el };
}

export function createProgressClock() {
  let offsets: number[] = [];
  let offset: number | null = null;
  let source: object | undefined;
  let lastUi: { value: number; raw: number; at: number } | undefined;
  let previous: { raw: number; at: number; rate: number; duration: number } | undefined;
  let reason = 'waiting-progress';
  let spread: number | null = null;
  let ui: number | null = null;
  let collectionSince: number | undefined;
  function reset(why = 'invalidated') {
    offsets = []; offset = null; source = undefined; lastUi = undefined; previous = undefined; spread = null; reason = why; collectionSince = undefined;
  }
  return {
    reset,
    status() { return { reason, samples: offsets.length, offset, spread, uiSeconds: ui }; },
    read(reading: ProgressReading, raw: number | null, now: number, playing: boolean, rate: number, duration: number): number | null {
      ui = reading.seconds;
      if (raw === null || !Number.isFinite(raw) || !Number.isFinite(duration)) { reset('clock-unavailable'); return null; }
      if (previous && (now - previous.at > 1000 || duration !== previous.duration || raw < previous.raw - .25
        || raw - previous.raw > .75 + (now - previous.at) / 1000 * Math.max(rate, previous.rate))) reset('clock-discontinuity');
      previous = { raw, at: now, rate, duration };
      if (reading.seconds === null) {
        reason = reading.reason;
        if (!['progress-unavailable', 'progress-hidden', 'no-progress-candidates'].includes(reading.reason)) { reset(reading.reason); return null; }
        // Hidden UI is not a new observation. Follow the fresh media clock only.
        return offset === null ? null : Math.max(0, raw + offset);
      }
      if (source && source !== reading.source) reset('progress-replaced');
      source = reading.source;
      if (!playing) { lastUi = undefined; offsets = []; collectionSince = undefined; reason = 'paused-or-buffering'; return offset === null ? null : Math.max(0, raw + offset); }
      if (lastUi?.value === reading.seconds) {
        if (now - lastUi.at > 2500 && raw - lastUi.raw > .5) { reset('stale-progress'); return null; }
        return offset === null ? null : Math.max(0, raw + offset);
      }
      const candidate = reading.seconds - raw;
      if (!lastUi) {
        // First appearance may be an old or preview value: require an update.
        lastUi = { value: reading.seconds, raw, at: now }; reason = 'waiting-progress-update'; return offset === null ? null : raw + offset;
      }
      const consistent = now - lastUi.at <= 2500 && reading.seconds > lastUi.value && raw > lastUi.raw
        && Math.abs((reading.seconds - lastUi.value) - (raw - lastUi.raw)) <= .35;
      lastUi = { value: reading.seconds, raw, at: now };
      if (!consistent) { offsets = []; offset = null; collectionSince = undefined; reason = 'inconsistent-progress'; return null; }
      if (offset !== null && Math.abs(candidate - offset) > .35) { offset = null; offsets = []; collectionSince = undefined; }
      collectionSince ??= now;
      offsets.push(candidate); if (offsets.length > 5) offsets.shift();
      spread = Math.max(...offsets) - Math.min(...offsets);
      if (spread > .3) offset = null;
      if (offsets.length === 5 && spread <= .3 && now - collectionSince >= 1000) {
        offset = [...offsets].sort((a, b) => a - b)[2]!;
        reason = 'progress-aligned';
      } else reason = spread > .3 ? 'unstable-offset' : 'collecting-progress';
      const time = offset === null ? null : raw + offset;
      if (time !== null && (time < 0 || time > duration + .25)) { reset('mapped-out-of-range'); return null; }
      return time;
    },
  };
}
